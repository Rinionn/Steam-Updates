import { config, paths } from "./config.js";
import { fetchHtml } from "./fetch.js";
import { mergeSnapshot, readSnapshot, writeSnapshot } from "./storage.js";
import { enrichWithDeadlines, parseSteamCalendar } from "./steamworks.js";
import type { SyncResult } from "./types.js";

export async function syncSteamEvents(): Promise<SyncResult> {
  const html = await fetchHtml(config.calendarUrl);
  const parsed = parseSteamCalendar(html, config.calendarUrl);
  if (parsed.length === 0) {
    throw new Error(
      "Steamworks kaynağı sıfır etkinlik döndürdü; eski veri korunuyor.",
    );
  }

  const enriched = await enrichWithDeadlines(parsed, fetchHtml);
  const previous = await readSnapshot(paths.snapshot);
  const result = mergeSnapshot(previous, enriched, config.calendarUrl);
  await writeSnapshot(paths.snapshot, result.snapshot);
  return result;
}
