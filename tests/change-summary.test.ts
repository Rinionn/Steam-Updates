import { describe, expect, it } from "vitest";
import { summarizeCalendarChanges } from "../src/change-summary.js";
import type { ChangeRecord } from "../src/types.js";

function record(overrides: Partial<ChangeRecord> = {}): ChangeRecord {
  return {
    detectedAt: "2026-08-03T08:00:00.000Z",
    eventId: "test-fest",
    eventName: "Test Fest",
    kind: "date_shifted",
    field: "startAt",
    before: "2026-09-01T17:00:00.000Z",
    after: "2026-09-02T17:00:00.000Z",
    ...overrides,
  };
}

describe("calendar change summaries", () => {
  it("groups multiple fields from the same festival scan into one row", () => {
    const startChange = record();
    const endChange = record({
      field: "endAt",
      before: "2026-09-08T17:00:00.000Z",
      after: "2026-09-09T17:00:00.000Z",
    });

    const groups = summarizeCalendarChanges([
      startChange,
      endChange,
      startChange,
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({
      eventName: "Test Fest",
      detectedAt: "2026-08-03T08:00:00.000Z",
    });
    expect(groups[0].items.map((item) => item.field)).toEqual([
      "startAt",
      "endAt",
    ]);
  });

  it("uses the newest one-sided observation when no verified change exists", () => {
    const groups = summarizeCalendarChanges([
      record({
        detectedAt: "2026-08-01T08:00:00.000Z",
        before: undefined,
      }),
      record({
        detectedAt: "2026-08-03T08:00:00.000Z",
        after: undefined,
      }),
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0].detectedAt).toBe("2026-08-03T08:00:00.000Z");
    expect(groups[0].items[0]).toMatchObject({
      before: "2026-09-01T17:00:00.000Z",
      after: undefined,
    });
  });

  it("prefers a verified change over newer one-sided observations", () => {
    const groups = summarizeCalendarChanges([
      record({ detectedAt: "2026-08-02T08:00:00.000Z" }),
      record({
        detectedAt: "2026-08-03T08:00:00.000Z",
        after: undefined,
      }),
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0].detectedAt).toBe("2026-08-02T08:00:00.000Z");
    expect(groups[0].items[0].after).toBe("2026-09-02T17:00:00.000Z");
  });

  it("rejects invalid, equal, equivalent, and non-date records", () => {
    const groups = summarizeCalendarChanges([
      record({ after: "2026-09-01T17:00:00.000Z" }),
      record({
        before: "2026-09-01T17:00:00.000Z",
        after: "2026-09-01T19:00:00.000+02:00",
      }),
      record({ before: "not-a-date", after: undefined }),
      record({ kind: "added", before: undefined, after: undefined }),
      record({ kind: "renamed", before: "Old", after: "New" }),
    ]);

    expect(groups).toEqual([]);
  });

  it("returns at most one row per festival and sorts festivals newest first", () => {
    const groups = summarizeCalendarChanges([
      record({ detectedAt: "2026-08-01T08:00:00.000Z" }),
      record({ detectedAt: "2026-08-03T08:00:00.000Z" }),
      record({
        detectedAt: "2026-08-02T08:00:00.000Z",
        eventId: "other-fest",
        eventName: "Other Fest",
      }),
    ]);

    expect(groups).toHaveLength(2);
    expect(groups.map((group) => group.eventName)).toEqual([
      "Test Fest",
      "Other Fest",
    ]);
  });
});
