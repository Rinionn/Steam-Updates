import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type {
  ChangeRecord,
  EventSnapshot,
  SteamDeadline,
  SteamEvent,
  SyncResult,
} from "./types.js";

function deadlineKey(deadline: SteamDeadline): string {
  return `${deadline.kind}:${deadline.label.trim().toLocaleLowerCase("tr")}`;
}

function sameEventIdentity(previous: SteamEvent, current: SteamEvent): boolean {
  if (previous.kind !== current.kind) return false;
  if (
    current.registrationUrl &&
    previous.registrationUrl === current.registrationUrl
  ) {
    return true;
  }
  if (current.detailsUrl && previous.detailsUrl === current.detailsUrl) {
    return true;
  }
  return (
    previous.startAt === current.startAt &&
    previous.endAt === current.endAt &&
    previous.sourceUrl === current.sourceUrl
  );
}

function diffEvent(
  previous: SteamEvent,
  current: SteamEvent,
  eventId: string,
  detectedAt: string,
): ChangeRecord[] {
  const changes: ChangeRecord[] = [];
  const base = {
    detectedAt,
    eventId,
    eventName: current.name,
  };

  if (previous.name !== current.name) {
    changes.push({
      ...base,
      kind: "renamed",
      field: "name",
      before: previous.name,
      after: current.name,
    });
  }

  for (const field of ["startAt", "endAt"] as const) {
    if (previous[field] !== current[field]) {
      changes.push({
        ...base,
        kind: "date_shifted",
        field,
        before: previous[field],
        after: current[field],
      });
    }
  }

  const previousDeadlines = new Map(
    previous.deadlines.map((deadline) => [deadlineKey(deadline), deadline]),
  );
  const currentDeadlines = new Map(
    current.deadlines.map((deadline) => [deadlineKey(deadline), deadline]),
  );
  const deadlineKeys = new Set([
    ...previousDeadlines.keys(),
    ...currentDeadlines.keys(),
  ]);
  for (const key of deadlineKeys) {
    const before = previousDeadlines.get(key);
    const after = currentDeadlines.get(key);
    if (before?.dueAt === after?.dueAt) continue;
    changes.push({
      ...base,
      kind: "deadline_changed",
      field: `deadlines.${after?.id || before?.id || key}.dueAt`,
      before: before?.dueAt,
      after: after?.dueAt,
    });
  }

  return changes;
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
  const matchedPreviousIds = new Set<string>();
  const added: SteamEvent[] = [];
  const changed: SteamEvent[] = [];
  const changes: ChangeRecord[] = [];

  const merged = currentEvents.map((event) => {
    const directMatch = previousById.get(event.id);
    const old =
      directMatch ||
      (previous?.events || []).find(
        (candidate) =>
          !matchedPreviousIds.has(candidate.id) &&
          sameEventIdentity(candidate, event),
      );
    const eventId = old?.id || event.id;
    const value: SteamEvent = {
      ...event,
      id: eventId,
      firstSeenAt: old?.firstSeenAt || nowIso,
      lastSeenAt: event.lastSeenAt || old?.lastSeenAt || nowIso,
    };

    if (!old) {
      added.push(value);
      changes.push({
        detectedAt: nowIso,
        eventId,
        eventName: value.name,
        kind: "added",
      });
    } else {
      matchedPreviousIds.add(old.id);
      const eventChanges = diffEvent(old, value, eventId, nowIso);
      if (eventChanges.length > 0) changed.push(value);
      changes.push(...eventChanges);
    }
    return value;
  });

  const removed = (previous?.events || []).filter(
    (event) => !matchedPreviousIds.has(event.id),
  );
  changes.push(
    ...removed.map(
      (event): ChangeRecord => ({
        detectedAt: nowIso,
        eventId: event.id,
        eventName: event.name,
        kind: "removed",
      }),
    ),
  );

  const sortedEvents = merged.sort((a, b) =>
    a.startAt.localeCompare(b.startAt),
  );
  const snapshotChanged =
    !previous ||
    previous.sourceUrl !== sourceUrl ||
    JSON.stringify(previous.events) !== JSON.stringify(sortedEvents);

  return {
    snapshot: {
      generatedAt: snapshotChanged ? nowIso : previous.generatedAt,
      sourceUrl,
      events: sortedEvents,
    },
    added,
    changed,
    removed,
    changes,
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
