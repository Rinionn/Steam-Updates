import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  DETAIL_REQUEST_DELAY_MS,
  enrichWithDeadlines,
  parseEventDeadlines,
  parseSteamCalendar,
} from "../src/steamworks.js";
import type { SteamEvent } from "../src/types.js";

const fixtureDir = path.resolve("tests", "fixtures");
const sourceUrl =
  "https://partner.steamgames.com/doc/marketing/upcoming_events?l=english";

describe("Steamworks parser", () => {
  it("sezon indirimlerini, temalı festivalleri ve Next Fest'i ayrıştırır", async () => {
    const html = await readFile(path.join(fixtureDir, "calendar.html"), "utf8");
    const events = parseSteamCalendar(html, sourceUrl);

    expect(events).toHaveLength(4);
    expect(events.map((event) => event.kind)).toEqual([
      "themed_fest",
      "seasonal_sale",
      "next_fest",
      "themed_fest",
    ]);

    const cyberpunk = events.find((event) => event.name === "Cyberpunk Fest");
    expect(cyberpunk?.registrationUrl).toBe(
      "https://partner.steamgames.com/optin/sale/cyberpunk_2026",
    );
    expect(cyberpunk?.detailsUrl).toContain("/themed_sales/cyberpunk_2026");
    expect(cyberpunk?.description).toBe("Games in cyberpunk settings.");
    expect(cyberpunk?.descriptionTr).toContain("siberpunk");
    expect(cyberpunk?.startAt).toBe("2026-08-03T17:00:00Z");

    const bridge = events.find((event) => event.name === "Year Bridge Fest");
    expect(bridge?.endAt).toBe("2027-01-04T18:00:00Z");

    const nextFest = events.find((event) => event.kind === "next_fest");
    expect(nextFest?.detailsUrl).toContain("/nextfest/2026october");
    expect(nextFest?.registrationUrl).toContain("nextfest_october_2026");
  });

  it("Steam Pasifik saatini UTC son tarihlerine dönüştürür", async () => {
    const calendar = await readFile(
      path.join(fixtureDir, "calendar.html"),
      "utf8",
    );
    const details = await readFile(
      path.join(fixtureDir, "nextfest.html"),
      "utf8",
    );
    const event = parseSteamCalendar(calendar, sourceUrl).find(
      (item) => item.kind === "next_fest",
    );
    expect(event).toBeDefined();

    const deadlines = parseEventDeadlines(
      details,
      event!,
      event!.detailsUrl!,
    );
    const registration = deadlines.find(
      (deadline) => deadline.kind === "registration",
    );

    expect(deadlines).toHaveLength(4);
    expect(registration?.dueAt).toBe("2026-09-01T06:59:00Z");
  });

  it("Steam hata sayfasını sağlıklı boş veri olarak kabul etmez", () => {
    expect(() =>
      parseSteamCalendar(
        '<div class="documentation_bbcode">Sorry, an error occurred. Please try again later</div>',
        sourceUrl,
      ),
    ).toThrow(/okunamadı/);
  });

  it("değişmeyen ve son 7 günde çekilmiş detayları önbellekten kullanır", async () => {
    const event: SteamEvent = {
      id: "cached-event",
      name: "Cached Event",
      kind: "themed_fest",
      startAt: "2026-08-03T17:00:00Z",
      endAt: "2026-08-10T17:00:00Z",
      sourceUrl,
      detailsUrl: "https://example.com/cached",
      matchTags: [],
      deadlines: [],
    };
    const cached: SteamEvent = {
      ...event,
      lastSeenAt: "2026-07-29T09:00:00Z",
      deadlines: [
        {
          id: "cached-deadline",
          kind: "registration",
          label: "Registration deadline",
          dueAt: "2026-08-01T06:59:00Z",
          sourceUrl: event.detailsUrl!,
        },
      ],
    };
    let requests = 0;
    const result = await enrichWithDeadlines(
      [event],
      async () => {
        requests++;
        return '<div class="documentation_bbcode"></div>';
      },
      [cached],
      {
        now: new Date("2026-07-30T09:00:00Z"),
        requestDelayMs: 0,
      },
    );

    expect(requests).toBe(0);
    expect(result[0].deadlines).toEqual(cached.deadlines);
    expect(result[0].lastSeenAt).toBe(cached.lastSeenAt);
  });

  it("tarihi değişen etkinliğin detayını önbelleğe rağmen yeniler", async () => {
    const previous: SteamEvent = {
      id: "changed-event",
      name: "Changed Event",
      kind: "themed_fest",
      startAt: "2026-08-03T17:00:00Z",
      endAt: "2026-08-10T17:00:00Z",
      sourceUrl,
      detailsUrl: "https://example.com/changed",
      matchTags: [],
      deadlines: [],
      lastSeenAt: "2026-07-29T09:00:00Z",
    };
    let requests = 0;
    await enrichWithDeadlines(
      [{ ...previous, startAt: "2026-08-04T17:00:00Z", lastSeenAt: undefined }],
      async () => {
        requests++;
        return '<div class="documentation_bbcode"></div>';
      },
      [previous],
      {
        now: new Date("2026-07-30T09:00:00Z"),
        requestDelayMs: 0,
      },
    );

    expect(requests).toBe(1);
    expect(DETAIL_REQUEST_DELAY_MS).toBe(500);
  });
});
