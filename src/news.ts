import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import * as cheerio from "cheerio";
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
    "https://store.steampowered.com/search/?sort_by=Released_DESC&category1=998&ndl=1",
  comingSoon:
    "https://store.steampowered.com/search/?filter=comingsoon&category1=998&ndl=1",
  steamworks:
    "https://steamcommunity.com/groups/steamworks/rss/",
};

function cleanText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export function parseStoreSearch(
  html: string,
  kind: Extract<SteamNewsKind, "new_release" | "coming_soon">,
  limit = 8,
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
        dateLabel: cleanText(row.find(".search_released").first().text()),
        imageUrl:
          String(row.find(".search_capsule img").first().attr("src") || "").trim() ||
          undefined,
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

export async function syncSteamNews(): Promise<SteamNewsSnapshot> {
  const results = await Promise.allSettled([
    fetchHtml(SOURCES.newReleases).then((html) =>
      parseStoreSearch(html, "new_release"),
    ),
    fetchHtml(SOURCES.comingSoon).then((html) =>
      parseStoreSearch(html, "coming_soon"),
    ),
    fetchHtml(SOURCES.steamworks).then((xml) =>
      parseSteamworksAnnouncements(xml),
    ),
  ]);
  const items = results.flatMap((result) =>
    result.status === "fulfilled" ? result.value : [],
  );
  if (items.length === 0) {
    throw new Error("Resmî Steam haber kaynaklarından veri alınamadı.");
  }
  const snapshot: SteamNewsSnapshot = {
    generatedAt: new Date().toISOString(),
    items,
  };
  await mkdir(path.dirname(paths.news), { recursive: true });
  await writeFile(paths.news, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
  return snapshot;
}
