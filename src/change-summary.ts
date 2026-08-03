import { DateTime } from "luxon";
import type { ChangeKind, ChangeRecord } from "./types.js";

export interface VerifiedChangeItem {
  kind: ChangeKind;
  field?: string;
  before: string;
  after: string;
}

export interface VerifiedChangeGroup {
  detectedAt: string;
  eventId: string;
  eventName: string;
  items: VerifiedChangeItem[];
}

function isDateChange(kind: ChangeKind): boolean {
  return kind === "date_shifted" || kind === "deadline_changed";
}

function isVerifiedChange(record: ChangeRecord): record is ChangeRecord & {
  before: string;
  after: string;
} {
  if (!record.before?.trim() || !record.after?.trim()) return false;

  if (isDateChange(record.kind)) {
    const before = DateTime.fromISO(record.before, { zone: "utc" });
    const after = DateTime.fromISO(record.after, { zone: "utc" });
    return before.isValid && after.isValid && before.toMillis() !== after.toMillis();
  }

  return record.before !== record.after;
}

function itemOrder(item: VerifiedChangeItem): string {
  const field = item.field || "";
  if (field === "name") return "0-name";
  if (field === "startAt") return "1-start";
  if (field === "endAt") return "2-end";
  if (item.kind === "deadline_changed") return `3-${field}`;
  return `4-${field}`;
}

export function summarizeVerifiedChanges(
  records: ChangeRecord[],
): VerifiedChangeGroup[] {
  const groups = new Map<string, VerifiedChangeGroup>();

  for (const record of records) {
    if (!isVerifiedChange(record)) continue;
    if (!DateTime.fromISO(record.detectedAt, { zone: "utc" }).isValid) continue;

    const groupKey = `${record.eventId}\u0000${record.detectedAt}`;
    const group = groups.get(groupKey) || {
      detectedAt: record.detectedAt,
      eventId: record.eventId,
      eventName: record.eventName,
      items: [],
    };
    const item: VerifiedChangeItem = {
      kind: record.kind,
      field: record.field,
      before: record.before,
      after: record.after,
    };
    const duplicate = group.items.some(
      (existing) =>
        existing.kind === item.kind &&
        existing.field === item.field &&
        existing.before === item.before &&
        existing.after === item.after,
    );
    if (!duplicate) group.items.push(item);
    groups.set(groupKey, group);
  }

  return [...groups.values()]
    .map((group) => ({
      ...group,
      items: group.items.sort((left, right) =>
        itemOrder(left).localeCompare(itemOrder(right)),
      ),
    }))
    .sort((left, right) => right.detectedAt.localeCompare(left.detectedAt));
}
