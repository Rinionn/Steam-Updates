import { config, paths } from "./config.js";
import { appendChangelog } from "./changelog.js";
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

  const previous = await readSnapshot(paths.snapshot);
  const enriched = await enrichWithDeadlines(
    parsed,
    fetchHtml,
    previous?.events,
  );
  const result = mergeSnapshot(previous, enriched, config.calendarUrl);
  await Promise.all([
    writeSnapshot(paths.snapshot, result.snapshot),
    appendChangelog(paths.changelog, result.changes),
  ]);
  return result;
}
