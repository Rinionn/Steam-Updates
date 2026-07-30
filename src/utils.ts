import { createHash } from "node:crypto";
import { DateTime } from "luxon";

export const STEAM_ZONE = "America/Los_Angeles";

export const MONTHS: Record<string, number> = {
  january: 1,
  jan: 1,
  february: 2,
  feb: 2,
  march: 3,
  mar: 3,
  april: 4,
  apr: 4,
  may: 5,
  june: 6,
  jun: 6,
  july: 7,
  jul: 7,
  august: 8,
  aug: 8,
  september: 9,
  sep: 9,
  sept: 9,
  october: 10,
  oct: 10,
  november: 11,
  nov: 11,
  december: 12,
  dec: 12,
};

export function compact(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export function slugify(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function stableId(...parts: string[]): string {
  const readable = slugify(parts[0] || "steam-event").slice(0, 54);
  const hash = createHash("sha1").update(parts.join("|")).digest("hex").slice(0, 9);
  return `${readable}-${hash}`;
}

export function steamDate(
  year: number,
  month: number,
  day: number,
  hour = 10,
  minute = 0,
): DateTime {
  return DateTime.fromObject(
    { year, month, day, hour, minute, second: 0, millisecond: 0 },
    { zone: STEAM_ZONE },
  );
}

export function parseClock(text: string, defaultHour: number): {
  hour: number;
  minute: number;
} {
  const match = text.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i);
  if (!match) return { hour: defaultHour, minute: defaultHour === 23 ? 59 : 0 };
  let hour = Number(match[1]) % 12;
  if (match[3].toLowerCase() === "pm") hour += 12;
  return { hour, minute: Number(match[2] || 0) };
}

export function iso(date: DateTime): string {
  const value = date.toUTC().toISO({ suppressMilliseconds: true });
  if (!value) throw new Error("Geçersiz tarih oluşturuldu.");
  return value;
}

export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
