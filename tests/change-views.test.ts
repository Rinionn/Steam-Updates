import { describe, expect, it } from "vitest";
import { renderDigest } from "../src/email.js";
import { renderReport } from "../src/report.js";
import type { ChangeRecord, EventSnapshot } from "../src/types.js";

const snapshot: EventSnapshot = {
  generatedAt: "2026-07-30T06:00:00.000Z",
  sourceUrl: "https://partner.steamgames.com/doc/marketing/upcoming_events",
  events: [],
};

const recentChange: ChangeRecord = {
  detectedAt: "2026-07-30T05:00:00.000Z",
  eventId: "test-fest",
  eventName: "Test Fest",
  kind: "date_shifted",
  field: "startAt",
  before: "2026-08-03T17:00:00.000Z",
  after: "2026-08-04T17:00:00.000Z",
};

describe("change log views", () => {
  it("shows recent changes in a closed 90-day report section", () => {
    const html = renderReport(snapshot, [recentChange]);

    expect(html).toContain("Son 90 günde ne değişti");
    expect(html).toContain("Test Fest");
    expect(html).toMatch(/<details class="change-log">/);
    expect(html).not.toMatch(/<details class="change-log" open/);
  });

  it("shows the email block only when the last 24 hours contain changes", () => {
    const withChanges = renderDigest(snapshot, [recentChange]);
    const withoutChanges = renderDigest(snapshot, [
      {
        ...recentChange,
        detectedAt: "2026-07-28T05:00:00.000Z",
      },
    ]);

    expect(withChanges.html).toContain("SON 24 SAATTE DEĞİŞENLER");
    expect(withChanges.text).toContain("SON 24 SAATTE DEĞİŞENLER");
    expect(withoutChanges.html).not.toContain("SON 24 SAATTE DEĞİŞENLER");
    expect(withoutChanges.text).not.toContain("SON 24 SAATTE DEĞİŞENLER");
  });
});
