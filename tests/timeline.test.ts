import { DateTime } from "luxon";
import { describe, expect, it } from "vitest";
import { renderReport } from "../src/report.js";
import { renderTimeline } from "../src/timeline.js";
import type { SteamEvent } from "../src/types.js";
import type { ReportModel } from "../src/view-model.js";

const event: SteamEvent = {
  id: "test-fest",
  name: "Test Festival With A Long Name",
  kind: "themed_fest",
  startAt: "2026-08-03T17:00:00.000Z",
  endAt: "2026-08-10T17:00:00.000Z",
  sourceUrl: "https://example.com/calendar",
  description: "English festival description.",
  descriptionTr: "Türkçe festival açıklaması.",
  matchTags: ["Cyberpunk"],
  deadlines: [
    {
      id: "test-registration",
      kind: "registration",
      label: "Registration deadline",
      dueAt: "2026-08-01T07:00:00.000Z",
      sourceUrl: "https://example.com/deadline",
    },
  ],
};

const model: ReportModel = {
  generated: DateTime.fromISO("2026-07-30T09:00:00.000+03:00", {
    setZone: true,
  }),
  events: [event],
  deadlines: [
    {
      event,
      deadline: event.deadlines[0],
      daysLeft: 2,
    },
  ],
  urgentDeadlines: [],
};

describe("event timeline", () => {
  it("renders 12 months, event links and urgent registration chips", () => {
    const html = renderTimeline(model, "Europe/Istanbul");

    expect(html.match(/data-timeline-month="/g)).toHaveLength(12);
    expect(html).toContain('href="#etkinlik-test-fest"');
    expect(html).toContain("3–10");
    expect(html).toContain('data-i18n="registration">Başvuru</span> · <span data-copy-tr="1 Ağu"');
    expect(html).toContain("En yakın kritik tarih:");
    expect(html).toContain(
      'data-copy-tr="1 Ağustos 2026" data-copy-en="1 August 2026"',
    );
    expect(html).toContain('· 2 <span data-i18n="days">gün</span>');
    expect(html).toContain("data-timeline-previous");
    expect(html).toContain("data-timeline-next");
  });

  it("replaces hero metrics and adds event-row anchor ids", () => {
    const html = renderReport({
      generatedAt: model.generated.toUTC().toISO() || "",
      sourceUrl: event.sourceUrl,
      events: [event],
    });

    expect(html).not.toContain('class="stats"');
    expect(html).toContain("data-event-timeline");
    expect(html).toContain('id="etkinlik-test-fest"');
    expect(html).toContain("timeline-highlight");
    expect(html).not.toContain("Takvimi indir (.ics)");
    expect(html).not.toContain("calendar-subscribe");
    expect(html).toContain("data-ics=");
    expect(html).toContain("data-task-aliases=");
    expect(html).toContain("Durumu dışa aktar");
    expect(html).toContain("Durumu içe aktar");
    expect(html).toContain("Tümünü sıfırla");
    expect(html).toContain(
      "steam-etkinlik-radari-gorevler-v1-yedek",
    );
    expect(html).toContain("Oyunlarım");
    expect(html).toContain("steam-etkinlik-radari-oyunlar-v1");
    expect(html).toContain("Sadece oyunlarımla eşleşenler");
    expect(html).toContain('data-match-tags="[&quot;Cyberpunk&quot;]"');
    expect(html).toContain("games,");
    expect(html).toContain("data-language=\"tr\"");
    expect(html).toContain("steam-etkinlik-radari-dil-v1");
    expect(html).toContain("data-description-tr=");
    expect(html).toContain("Başvurusu hâlâ açık olanlar");
    expect(html).toContain("Tamamlanmamış görevi olanlar");
    expect(html).toContain("new URLSearchParams(location.hash.slice(1))");
    expect(html).toContain('data-registration-open="true"');
    expect(html).toContain('data-kind="themed_fest"');
    expect(html).toContain('aria-hidden="true">✦</span>');
    expect(html).toContain('role="combobox"');
    expect(html).toContain("data-steam-game-results");
    expect(html).toContain("/api/steam-search?q=");
    expect(html).toContain("Steam araması Cloudflare");
  });
});
