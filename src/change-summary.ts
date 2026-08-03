import { DateTime } from "luxon";
import type { ChangeKind, ChangeRecord } from "./types.js";

export interface CalendarChangeItem {
  kind: ChangeKind;
  field?: string;
  before?: string;
  after?: string;
}

export interface CalendarChangeGroup {
  detectedAt: string;
  eventId: string;
  eventName: string;
  items: CalendarChangeItem[];
}

function isDateChange(kind: ChangeKind): boolean {
  return kind === "date_shifted" || kind === "deadline_changed";
}

function isValidDate(value: string | undefined): value is string {
  return Boolean(
    value?.trim() && DateTime.fromISO(value, { zone: "utc" }).isValid,
  );
}

function isVerifiedChange(record: ChangeRecord): record is ChangeRecord & {
  before: string;
  after: string;
} {
  if (!record.before?.trim() || !record.after?.trim()) return false;

  if (isDateChange(record.kind)) {
    if (!isValidDate(record.before) || !isValidDate(record.after)) return false;
    return (
      DateTime.fromISO(record.before, { zone: "utc" }).toMillis() !==
      DateTime.fromISO(record.after, { zone: "utc" }).toMillis()
    );
  }

  return record.before !== record.after;
}

function isOneSidedDateObservation(record: ChangeRecord): boolean {
  if (!isDateChange(record.kind)) return false;
  const hasBefore = isValidDate(record.before);
  const hasAfter = isValidDate(record.after);
  return hasBefore !== hasAfter;
}

function itemOrder(item: CalendarChangeItem): string {
  const field = item.field || "";
  if (field === "name") return "0-name";
  if (field === "startAt") return "1-start";
  if (field === "endAt") return "2-end";
  if (item.kind === "deadline_changed") return `3-${field}`;
  return `4-${field}`;
}

function uniqueItems(records: ChangeRecord[]): CalendarChangeItem[] {
  const items: CalendarChangeItem[] = [];
  for (const record of records) {
    const item: CalendarChangeItem = {
      kind: record.kind,
      field: record.field,
      before: record.before,
      after: record.after,
    };
    const duplicate = items.some(
      (existing) =>
        existing.kind === item.kind &&
        existing.field === item.field &&
        existing.before === item.before &&
        existing.after === item.after,
    );
    if (!duplicate) items.push(item);
  }
  return items.sort((left, right) =>
    itemOrder(left).localeCompare(itemOrder(right)),
  );
}

export function summarizeCalendarChanges(
  records: ChangeRecord[],
): CalendarChangeGroup[] {
  const recordsByEvent = new Map<string, ChangeRecord[]>();

  for (const record of records) {
    if (!DateTime.fromISO(record.detectedAt, { zone: "utc" }).isValid) continue;
    const eventRecords = recordsByEvent.get(record.eventId) || [];
    eventRecords.push(record);
    recordsByEvent.set(record.eventId, eventRecords);
  }

  const summaries: CalendarChangeGroup[] = [];
  for (const [eventId, eventRecords] of recordsByEvent) {
    const verified = eventRecords.filter(
      (record) => isDateChange(record.kind) && isVerifiedChange(record),
    );
    const candidates = verified.length
      ? verified
      : eventRecords.filter(isOneSidedDateObservation);
    if (!candidates.length) continue;

    const latestDetectedAt = candidates.reduce(
      (latest, record) =>
        record.detectedAt > latest ? record.detectedAt : latest,
      candidates[0].detectedAt,
    );
    const latestRecords = candidates.filter(
      (record) => record.detectedAt === latestDetectedAt,
    );
    summaries.push({
      detectedAt: latestDetectedAt,
      eventId,
      eventName: latestRecords[0].eventName,
      items: uniqueItems(latestRecords),
    });
  }

  return summaries.sort((left, right) =>
    right.detectedAt.localeCompare(left.detectedAt),
  );
}
