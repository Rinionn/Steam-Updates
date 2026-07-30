import { describe, expect, it } from "vitest";
import {
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
      },
    ]);
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
});
