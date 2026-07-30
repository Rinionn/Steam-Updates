import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  appendChangelog,
  pruneChangelog,
  readChangelog,
} from "../src/changelog.js";
import type { ChangeRecord } from "../src/types.js";

function record(
  detectedAt: string,
  eventId: string,
): ChangeRecord {
  return {
    detectedAt,
    eventId,
    eventName: `Event ${eventId}`,
    kind: "added",
  };
}

describe("changelog persistence", () => {
  it("appends new records instead of replacing the existing log", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "steam-changelog-"));
    const changelogPath = path.join(tempDir, "changelog.json");

    try {
      await appendChangelog(
        changelogPath,
        [record("2026-07-29T06:00:00.000Z", "first")],
        new Date("2026-07-30T06:00:00.000Z"),
      );
      await appendChangelog(
        changelogPath,
        [record("2026-07-30T06:00:00.000Z", "second")],
        new Date("2026-07-30T06:00:00.000Z"),
      );

      expect(await readChangelog(changelogPath)).toEqual([
        expect.objectContaining({ eventId: "first" }),
        expect.objectContaining({ eventId: "second" }),
      ]);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it("drops records older than 18 months and keeps the newest 400", () => {
    const recent = Array.from({ length: 405 }, (_, index) =>
      record(
        new Date(Date.UTC(2026, 0, 1, 0, index)).toISOString(),
        String(index),
      ),
    );
    const result = pruneChangelog(
      [record("2024-01-01T00:00:00.000Z", "expired"), ...recent],
      new Date("2026-07-30T06:00:00.000Z"),
    );

    expect(result).toHaveLength(400);
    expect(result[0].eventId).toBe("5");
    expect(result.at(-1)?.eventId).toBe("404");
    expect(result.some((item) => item.eventId === "expired")).toBe(false);
  });
});
