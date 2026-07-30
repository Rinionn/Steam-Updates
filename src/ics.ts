import { DateTime } from "luxon";
import { config } from "./config.js";
import { deadlineCopy } from "./deadline-copy.js";
import type {
  EventSnapshot,
  SteamDeadline,
  SteamEvent,
} from "./types.js";

const PRODID = "-//Gaming in Turkey//Steam Etkinlik Radari//TR";
const MAX_LINE_OCTETS = 75;

export function escapeIcsText(value: string): string {
  return value
    .replaceAll("\\", "\\\\")
    .replace(/\r\n|\r|\n/g, "\\n")
    .replaceAll(";", "\\;")
    .replaceAll(",", "\\,");
}

export function foldIcsLine(line: string): string[] {
  const folded: string[] = [];
  let current = "";
  let currentOctets = 0;
  let availableOctets = MAX_LINE_OCTETS;
  let prefix = "";

  for (const character of line) {
    const characterOctets = Buffer.byteLength(character, "utf8");
    if (current && currentOctets + characterOctets > availableOctets) {
      folded.push(`${prefix}${current}`);
      current = character;
      currentOctets = characterOctets;
      prefix = " ";
      availableOctets = MAX_LINE_OCTETS - 1;
    } else {
      current += character;
      currentOctets += characterOctets;
    }
  }

  folded.push(`${prefix}${current}`);
  return folded;
}

function utcTimestamp(isoDate: string): string {
  const parsed = DateTime.fromISO(isoDate, { setZone: true });
  if (!parsed.isValid) {
    throw new Error(`Geçersiz takvim tarihi: ${isoDate}`);
  }
  return parsed.toUTC().toFormat("yyyyMMdd'T'HHmmss'Z'");
}

function eventUrl(event: SteamEvent): string {
  return event.registrationUrl || event.detailsUrl || event.sourceUrl;
}

function alarmLines(
  event: SteamEvent,
  deadline: SteamDeadline,
  reminderDays: number[],
): string[] {
  const summary = `${event.name}: ${deadlineCopy(deadline).title}`;
  return reminderDays.flatMap((days) => [
    "BEGIN:VALARM",
    "ACTION:DISPLAY",
    `DESCRIPTION:${escapeIcsText(summary)}`,
    `TRIGGER:${days === 0 ? "PT0S" : `-P${days}D`}`,
    "END:VALARM",
  ]);
}

function deadlineEventLines(
  event: SteamEvent,
  deadline: SteamDeadline,
  generatedAt: string,
  reminderDays: number[],
): string[] {
  const copy = deadlineCopy(deadline);
  const deadlineEnd = DateTime.fromISO(deadline.dueAt, {
    setZone: true,
  }).plus({ minutes: 15 });
  if (!deadlineEnd.isValid || !deadlineEnd.toISO()) {
    throw new Error(`Geçersiz son tarih: ${deadline.dueAt}`);
  }
  return [
    "BEGIN:VEVENT",
    `UID:${escapeIcsText(deadline.id)}`,
    `DTSTAMP:${utcTimestamp(generatedAt)}`,
    `DTSTART:${utcTimestamp(deadline.dueAt)}`,
    `DTEND:${utcTimestamp(deadlineEnd.toISO()!)}`,
    `SUMMARY:${escapeIcsText(`${event.name}: ${copy.title}`)}`,
    `DESCRIPTION:${escapeIcsText(copy.description)}`,
    `URL:${deadline.sourceUrl}`,
    ...alarmLines(event, deadline, reminderDays),
    "END:VEVENT",
  ];
}

function steamEventLines(event: SteamEvent, generatedAt: string): string[] {
  return [
    "BEGIN:VEVENT",
    `UID:${escapeIcsText(event.id)}`,
    `DTSTAMP:${utcTimestamp(generatedAt)}`,
    `DTSTART:${utcTimestamp(event.startAt)}`,
    `DTEND:${utcTimestamp(event.endAt)}`,
    `SUMMARY:${escapeIcsText(event.name)}`,
    `DESCRIPTION:${escapeIcsText(
      event.description || "Steam etkinliği ve operasyon takvimi.",
    )}`,
    `URL:${eventUrl(event)}`,
    "END:VEVENT",
  ];
}

function calendarLines(
  events: SteamEvent[],
  generatedAt: string,
  reminderDays: number[],
): string[] {
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    `PRODID:${PRODID}`,
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    ...events.flatMap((event) => [
      ...steamEventLines(event, generatedAt),
      ...event.deadlines.flatMap((deadline) =>
        deadlineEventLines(event, deadline, generatedAt, reminderDays),
      ),
    ]),
    "END:VCALENDAR",
  ];
}

function serializeCalendar(lines: string[]): string {
  return `${lines.flatMap(foldIcsLine).join("\r\n")}\r\n`;
}

export function createCalendarIcs(
  snapshot: EventSnapshot,
  reminderDays = config.reminderDays,
): string {
  return serializeCalendar(
    calendarLines(snapshot.events, snapshot.generatedAt, reminderDays),
  );
}

export function createEventIcs(
  event: SteamEvent,
  generatedAt: string,
  reminderDays = config.reminderDays,
): string {
  return serializeCalendar(calendarLines([event], generatedAt, reminderDays));
}
