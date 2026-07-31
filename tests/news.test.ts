import { describe, expect, it } from "vitest";
import {
  mergeSteamNewsSnapshot,
  parseSteamworksAnnouncements,
  parseStoreSearch,
} from "../src/news.js";

describe("Steam news parsing", () => {
  it("parses official store search cards", () => {
    const html = `
      <a class="search_result_row" data-ds-appid="42" href="https://store.steampowered.com/app/42/Test/">
        <div class="search_capsule"><img src="https://cdn.example/test.jpg"></div>
        <span class="title">Test Game</span>
        <div class="search_released">30 Jul, 2026</div>
      </a>`;
    expect(parseStoreSearch(html, "new_release")).toMatchObject([
      {
        title: "Test Game",
        kind: "new_release",
        dateLabel: "30 Jul, 2026",
        imageUrl: "https://cdn.example/test.jpg",
      },
    ]);
  });

  it("Steam gorsel CDN ve tarih bicimini sabitler", () => {
    const row = (host: string, dateLabel: string) => `
      <a class="search_result_row" data-ds-appid="42" href="https://store.steampowered.com/app/42/Test/">
        <div class="search_capsule"><img src="https://shared.${host}.steamstatic.com/store_item_assets/test.jpg?t=1"></div>
        <span class="title">Test Game</span>
        <div class="search_released">${dateLabel}</div>
      </a>`;

    const akamai = parseStoreSearch(
      row("akamai", "30 Jul, 2026"),
      "new_release",
    );
    const fastly = parseStoreSearch(
      row("fastly", "Jul 30, 2026"),
      "new_release",
    );

    expect(akamai[0]?.imageUrl).toBe(
      "https://shared.fastly.steamstatic.com/store_item_assets/test.jpg?t=1",
    );
    expect(akamai).toEqual(fastly);

    const previous = {
      generatedAt: "2026-07-30T06:00:00.000Z",
      items: fastly,
    };
    expect(mergeSteamNewsSnapshot(previous, akamai)).toBe(previous);
  });

  it("parses official Steamworks RSS announcements", () => {
    const xml = `<?xml version="1.0"?>
      <rss><channel><item>
        <title>Store discovery update</title>
        <link>https://steamcommunity.com/groups/steamworks/announcements/detail/1</link>
        <pubDate>Thu, 30 Jul 2026 10:00:00 GMT</pubDate>
        <description><![CDATA[<p>Official platform update.</p>]]></description>
      </item></channel></rss>`;
    expect(parseSteamworksAnnouncements(xml)).toMatchObject([
      {
        title: "Store discovery update",
        kind: "platform",
        summary: "Official platform update.",
      },
    ]);
  });

  it("aynı haber içeriğinde üretim zamanını değiştirmez", () => {
    const items = parseStoreSearch(
      `<a class="search_result_row" data-ds-appid="42" href="https://store.steampowered.com/app/42/Test/">
        <span class="title">Test Game</span>
        <div class="search_released">30 Jul, 2026</div>
      </a>`,
      "new_release",
    );
    const previous = {
      generatedAt: "2026-07-30T06:00:00.000Z",
      items,
    };

    expect(
      mergeSteamNewsSnapshot(
        previous,
        items,
        new Date("2026-07-31T06:00:00.000Z"),
      ),
    ).toBe(previous);
  });
});
