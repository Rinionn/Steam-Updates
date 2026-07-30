import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import type { EventSnapshot, SteamEvent, SyncResult } from "./types.js";

function comparable(event: SteamEvent): Omit<
  SteamEvent,
  "firstSeenAt" | "lastSeenAt"
> {
  const { firstSeenAt: _first, lastSeenAt: _last, ...rest } = event;
  return rest;
}

function fingerprint(event: SteamEvent): string {
  return createHash("sha256")
    .update(JSON.stringify(comparable(event)))
    .digest("hex");
}

export async function readSnapshot(
  snapshotPath: string,
): Promise<EventSnapshot | undefined> {
  try {
    const raw = await readFile(snapshotPath, "utf8");
    return JSON.parse(raw) as EventSnapshot;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

export async function writeSnapshot(
  snapshotPath: string,
  snapshot: EventSnapshot,
): Promise<void> {
  await mkdir(path.dirname(snapshotPath), { recursive: true });
  await writeFile(snapshotPath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
}

export function mergeSnapshot(
  previous: EventSnapshot | undefined,
  currentEvents: SteamEvent[],
  sourceUrl: string,
  now = new Date(),
): SyncResult {
  const nowIso = now.toISOString();
  const previousById = new Map(
    (previous?.events || []).map((event) => [event.id, event]),
  );
  const currentIds = new Set(currentEvents.map((event) => event.id));
  const added: SteamEvent[] = [];
  const changed: SteamEvent[] = [];

  const merged = currentEvents.map((event) => {
    const old = previousById.get(event.id);
    const value: SteamEvent = {
      ...event,
      firstSeenAt: old?.firstSeenAt || nowIso,
      lastSeenAt: nowIso,
    };

    if (!old) added.push(value);
    else if (fingerprint(old) !== fingerprint(value)) changed.push(value);
    return value;
  });

  const removed = (previous?.events || []).filter(
    (event) => !currentIds.has(event.id),
  );

  return {
    snapshot: {
      generatedAt: nowIso,
      sourceUrl,
      events: merged.sort((a, b) => a.startAt.localeCompare(b.startAt)),
    },
    added,
    changed,
    removed,
  };
}

interface NotificationState {
  lastDigestDate?: string;
}

export async function readNotificationState(
  statePath: string,
): Promise<NotificationState> {
  try {
    return JSON.parse(await readFile(statePath, "utf8")) as NotificationState;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw error;
  }
}

export async function markDigestSent(
  statePath: string,
  localDate: string,
): Promise<void> {
  await mkdir(path.dirname(statePath), { recursive: true });
  await writeFile(
    statePath,
    `${JSON.stringify({ lastDigestDate: localDate }, null, 2)}\n`,
    "utf8",
  );
}
