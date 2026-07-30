import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  mergeSnapshot,
  readSnapshot,
  writeSnapshot,
} from "../src/storage.js";
import type { EventSnapshot, SteamEvent } from "../src/types.js";

const event: SteamEvent = {
  id: "test-event",
  name: "Test Fest",
  kind: "themed_fest",
  startAt: "2026-08-03T17:00:00Z",
  endAt: "2026-08-10T17:00:00Z",
  sourceUrl: "https://partner.steamgames.com/doc/marketing/upcoming_events",
  deadlines: [],
};

describe("snapshot merge", () => {
  it("aynı veriyi ikinci kez yeni veya değişmiş saymaz", () => {
    const first = mergeSnapshot(
      undefined,
      [event],
      event.sourceUrl,
      new Date("2026-07-30T06:00:00Z"),
    );
    const second = mergeSnapshot(
      first.snapshot,
      [event],
      event.sourceUrl,
      new Date("2026-07-31T06:00:00Z"),
    );

    expect(first.added).toHaveLength(1);
    expect(second.added).toHaveLength(0);
    expect(second.changed).toHaveLength(0);
    expect(second.snapshot.events[0].firstSeenAt).toBe(
      first.snapshot.events[0].firstSeenAt,
    );
  });

  it("tarih değişikliğini yakalar", () => {
    const previous: EventSnapshot = mergeSnapshot(
      undefined,
      [event],
      event.sourceUrl,
      new Date("2026-07-30T06:00:00Z"),
    ).snapshot;
    const result = mergeSnapshot(
      previous,
      [{ ...event, startAt: "2026-08-04T17:00:00Z" }],
      event.sourceUrl,
      new Date("2026-07-31T06:00:00Z"),
    );
    expect(result.changed).toHaveLength(1);
  });

  it("persists merge history across disk round trips", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "steam-snapshot-"));
    const snapshotPath = path.join(tempDir, "events.json");
    const firstRunAt = new Date("2026-07-30T06:00:00Z");
    const secondRunAt = new Date("2026-07-31T06:00:00Z");

    try {
      const first = mergeSnapshot(
        undefined,
        [event],
        event.sourceUrl,
        firstRunAt,
      );
      await writeSnapshot(snapshotPath, first.snapshot);

      const persisted = await readSnapshot(snapshotPath);
      const second = mergeSnapshot(
        persisted,
        [event],
        event.sourceUrl,
        secondRunAt,
      );
      await writeSnapshot(snapshotPath, second.snapshot);

      const reloaded = await readSnapshot(snapshotPath);
      expect(second.added).toHaveLength(0);
      expect(second.changed).toHaveLength(0);
      expect(reloaded?.events[0].firstSeenAt).toBe(firstRunAt.toISOString());
      expect(reloaded?.events[0].lastSeenAt).toBe(secondRunAt.toISOString());
      expect(reloaded?.generatedAt).toBe(secondRunAt.toISOString());
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });
});
