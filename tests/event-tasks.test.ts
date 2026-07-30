import { describe, expect, it } from "vitest";
import { buildEventTasks } from "../src/event-tasks.js";
import { parseEventDeadlines } from "../src/steamworks.js";
import type { SteamEvent } from "../src/types.js";

const baseEvent: SteamEvent = {
  id: "cyberpunk-fest",
  name: "Cyberpunk Fest",
  kind: "themed_fest",
  startAt: "2026-08-03T17:00:00Z",
  endAt: "2026-08-10T17:00:00Z",
  sourceUrl: "https://partner.steamgames.com/doc/marketing/upcoming_events",
  registrationUrl:
    "https://partner.steamgames.com/optin/sale/cyberpunk_2026",
  detailsUrl:
    "https://partner.steamgames.com/doc/marketing/upcoming_events/themed_sales/cyberpunk_2026",
  matchTags: ["Cyberpunk", "Sci-fi"],
  deadlines: [],
};

describe("event tasks", () => {
  it("temalı festival için kayıt, indirim ve mağaza görevleri üretir", () => {
    const tasks = buildEventTasks(baseEvent);
    expect(tasks).toHaveLength(3);
    expect(tasks.map((task) => task.title)).toEqual([
      "Uygunluğu ve kayıt durumunu kontrol et",
      "İndirim planını kontrol et",
      "Mağaza sayfasını ve etiketleri gözden geçir",
    ]);
  });

  it("sezon indirimi için teklif görevini zorunlu gösterir", () => {
    const tasks = buildEventTasks({
      ...baseEvent,
      id: "autumn-sale",
      kind: "seasonal_sale",
      registrationUrl: undefined,
      detailsUrl: undefined,
    });
    expect(tasks[0]).toMatchObject({
      level: "Gerekli",
      title: "Sezon indirimi teklifini gir",
    });
  });

  it("son tarih değiştiğinde deadline ve görev kimliğini korur", () => {
    const sourceUrl =
      "https://partner.steamgames.com/doc/marketing/upcoming_events/test";
    const firstDeadlines = parseEventDeadlines(
      `<div class="documentation_bbcode"><ul><li>September 1 @ 10:00am PDT - Registration deadline.</li></ul></div>`,
      baseEvent,
      sourceUrl,
    );
    const shiftedDeadlines = parseEventDeadlines(
      `<div class="documentation_bbcode"><ul><li>September 2 @ 11:00am PDT - Updated registration deadline from Valve.</li></ul></div>`,
      baseEvent,
      sourceUrl,
    );

    expect(firstDeadlines[0].id).toBe(shiftedDeadlines[0].id);
    expect(
      buildEventTasks({ ...baseEvent, deadlines: firstDeadlines })[0].id,
    ).toBe(
      buildEventTasks({ ...baseEvent, deadlines: shiftedDeadlines })[0].id,
    );
  });
});
