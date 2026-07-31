import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import * as cheerio from "cheerio";
import { DateTime } from "luxon";
import { fetchHtml } from "./fetch.js";
import { paths } from "./config.js";
import type {
  SteamNewsItem,
  SteamNewsKind,
  SteamNewsSnapshot,
} from "./types.js";
import { stableId } from "./utils.js";

const SOURCES = {
  newReleases:
    "https://store.steampowered.com/search/?sort_by=Released_DESC&category1=998&ndl=1&l=english",
  comingSoon:
    "https://store.steampowered.com/search/?filter=comingsoon&category1=998&ndl=1&l=english",
  steamworks:
    "https://steamcommunity.com/groups/steamworks/rss/",
};

const STEAM_TAG_CATEGORIES: Record<number, string> = {
  19: "Aksiyon",
  21: "Macera",
  9: "Strateji",
  122: "RPG",
  599: "Simülasyon",
  597: "Gündelik",
  701: "Spor",
  699: "Yarış",
  493: "Bağımsız",
  4085: "Anime",
  1667: "Korku",
  3859: "Çok Oyunculu",
  4182: "Tek Oyunculu",
  113: "Oynaması Ücretsiz",
};

function cleanText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function canonicalStoreDateLabel(value: string): string {
  const label = cleanText(value);
  for (const format of ["d MMM, yyyy", "MMM d, yyyy", "d MMM yyyy"]) {
    const parsed = DateTime.fromFormat(label, format, {
      locale: "en",
      zone: "Europe/Istanbul",
    });
    if (parsed.isValid) return parsed.setLocale("en").toFormat("d LLL, yyyy");
  }
  const month = DateTime.fromFormat(label, "MMM yyyy", {
    locale: "en",
    zone: "Europe/Istanbul",
  });
  return month.isValid ? month.setLocale("en").toFormat("LLL yyyy") : label;
}

function canonicalSteamImageUrl(value?: string): string | undefined {
  const url = String(value || "").trim();
  if (!url) return undefined;
  return url.replace(
    /^https:\/\/shared\.(?:akamai|cloudflare|fastly)\.steamstatic\.com/i,
    "https://shared.fastly.steamstatic.com",
  );
}

function categoriesFromRow(value?: string): string[] {
  try {
    const ids = JSON.parse(value || "[]") as unknown;
    if (!Array.isArray(ids)) return [];
    return [...new Set(ids.map(Number).map((id) => STEAM_TAG_CATEGORIES[id]).filter(Boolean))];
  } catch {
    return [];
  }
}

function storeDate(value: string, now: DateTime): DateTime | null {
  const normalized = cleanText(value);
  const formats = ["d MMM, yyyy", "MMM d, yyyy", "d MMM yyyy", "MMM yyyy"];
  for (const format of formats) {
    const parsed = DateTime.fromFormat(normalized, format, {
      locale: "en",
      zone: "Europe/Istanbul",
    });
    if (parsed.isValid) {
      return format === "MMM yyyy" ? parsed.endOf("month") : parsed.startOf("day");
    }
  }
  const iso = DateTime.fromISO(normalized, { zone: "Europe/Istanbul" });
  return iso.isValid ? iso : null;
}

export function parseStoreSearch(
  html: string,
  kind: Extract<SteamNewsKind, "new_release" | "coming_soon">,
  limit = 50,
): SteamNewsItem[] {
  const $ = cheerio.load(html);
  return $(".search_result_row")
    .toArray()
    .slice(0, limit)
    .map((element) => {
      const row = $(element);
      const url = String(row.attr("href") || "").trim();
      const appId =
        String(row.attr("data-ds-appid") || "").split(",")[0]?.trim() || url;
      return {
        id: stableId("steam-news", kind, appId),
        title: cleanText(row.find(".title").first().text()),
        kind,
        url,
        dateLabel: canonicalStoreDateLabel(
          row.find(".search_released").first().text(),
        ),
        imageUrl: canonicalSteamImageUrl(
          row.find(".search_capsule img").first().attr("src"),
        ),
        categories: categoriesFromRow(row.attr("data-ds-tagids")),
      };
    })
    .filter((item) => item.title && item.url);
}

export function parseSteamworksAnnouncements(
  xml: string,
  limit = 10,
): SteamNewsItem[] {
  const $ = cheerio.load(xml, { xmlMode: true });
  return $("item")
    .toArray()
    .slice(0, limit)
    .map((element) => {
      const item = $(element);
      const url = cleanText(item.find("link").first().text());
      const rawDate = cleanText(item.find("pubDate").first().text());
      const parsedDate = rawDate ? new Date(rawDate) : null;
      const summary = cleanText(
        cheerio.load(item.find("description").first().text()).text(),
      );
      return {
        id: stableId("steam-news", "platform", url),
        title: cleanText(item.find("title").first().text()),
        kind: "platform" as const,
        url,
        publishedAt:
          parsedDate && Number.isFinite(parsedDate.getTime())
            ? parsedDate.toISOString()
            : undefined,
        summary: summary ? summary.slice(0, 280) : undefined,
      };
    })
    .filter((item) => item.title && item.url);
}

export async function readSteamNews(
  filePath = paths.news,
): Promise<SteamNewsSnapshot | undefined> {
  try {
    return JSON.parse(await readFile(filePath, "utf8")) as SteamNewsSnapshot;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

export function mergeSteamNewsSnapshot(
  previous: SteamNewsSnapshot | undefined,
  items: SteamNewsItem[],
  now = new Date(),
): SteamNewsSnapshot {
  if (previous && JSON.stringify(previous.items) === JSON.stringify(items)) {
    return previous;
  }
  return {
    generatedAt: now.toISOString(),
    items,
  };
}

export async function syncSteamNews(): Promise<SteamNewsSnapshot> {
  const now = DateTime.now().setZone("Europe/Istanbul");
  const monthAgo = now.minus({ days: 30 }).startOf("day");
  const monthAhead = now.plus({ days: 30 }).endOf("day");
  const platformCutoff = now.minus({ months: 3 }).toMillis();
  const results = await Promise.allSettled([
    fetchHtml(SOURCES.newReleases).then((html) =>
      parseStoreSearch(html, "new_release").filter((item) => {
        const date = storeDate(item.dateLabel || "", now);
        return Boolean(date && date.toMillis() >= monthAgo.toMillis() && date.toMillis() <= now.endOf("day").toMillis());
      }).slice(0, 24),
    ),
    fetchHtml(SOURCES.comingSoon).then((html) =>
      parseStoreSearch(html, "coming_soon").filter((item) => {
        const date = storeDate(item.dateLabel || "", now);
        return Boolean(date && date.toMillis() >= now.startOf("day").toMillis() && date.toMillis() <= monthAhead.toMillis());
      }).slice(0, 24),
    ),
    fetchHtml(SOURCES.steamworks).then((xml) =>
      parseSteamworksAnnouncements(xml, 30).filter((item) => {
        const published = Date.parse(item.publishedAt || "");
        return Number.isFinite(published) && published >= platformCutoff;
      }),
    ),
  ]);
  const items = results.flatMap((result) =>
    result.status === "fulfilled" ? result.value : [],
  );
  if (items.length === 0) {
    throw new Error("Resmî Steam haber kaynaklarından veri alınamadı.");
  }
  const previous = await readSteamNews();
  const snapshot = mergeSteamNewsSnapshot(previous, items);
  if (snapshot === previous) return snapshot;
  await mkdir(path.dirname(paths.news), { recursive: true });
  await writeFile(paths.news, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
  return snapshot;
}
