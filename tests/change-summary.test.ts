import { describe, expect, it } from "vitest";
import { summarizeVerifiedChanges } from "../src/change-summary.js";
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

describe("verified change summaries", () => {
  it("groups multiple fields from the same festival scan into one row", () => {
    const startChange = record();
    const endChange = record({
      field: "endAt",
      before: "2026-09-08T17:00:00.000Z",
      after: "2026-09-09T17:00:00.000Z",
    });

    const groups = summarizeVerifiedChanges([
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

  it("rejects one-sided, invalid, equal, and equivalent date records", () => {
    const groups = summarizeVerifiedChanges([
      record({ after: undefined }),
      record({ before: undefined }),
      record({ after: "2026-09-01T17:00:00.000Z" }),
      record({
        before: "2026-09-01T17:00:00.000Z",
        after: "2026-09-01T19:00:00.000+02:00",
      }),
      record({ before: "not-a-date" }),
      record({ kind: "added", before: undefined, after: undefined }),
    ]);

    expect(groups).toEqual([]);
  });

  it("keeps separate scans as separate rows and sorts newest first", () => {
    const groups = summarizeVerifiedChanges([
      record({ detectedAt: "2026-08-01T08:00:00.000Z" }),
      record({ detectedAt: "2026-08-03T08:00:00.000Z" }),
      record({
        detectedAt: "2026-08-03T08:00:00.000Z",
        eventId: "other-fest",
        eventName: "Other Fest",
      }),
    ]);

    expect(groups).toHaveLength(3);
    expect(groups.map((group) => group.detectedAt)).toEqual([
      "2026-08-03T08:00:00.000Z",
      "2026-08-03T08:00:00.000Z",
      "2026-08-01T08:00:00.000Z",
    ]);
  });
});
