import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  parseEventDeadlines,
  parseSteamCalendar,
} from "../src/steamworks.js";

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
});
