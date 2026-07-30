import { Buffer } from "node:buffer";
import { describe, expect, it } from "vitest";
import {
  createCalendarIcs,
  createEventIcs,
  escapeIcsText,
  foldIcsLine,
} from "../src/ics.js";
import type { EventSnapshot } from "../src/types.js";

const snapshot: EventSnapshot = {
  generatedAt: "2026-07-30T09:30:00+03:00",
  sourceUrl: "https://example.com/calendar",
  events: [
    {
      id: "test-fest",
      name: "Test, Fest; Takvim\\Denemesi",
      kind: "themed_fest",
      startAt: "2026-08-03T10:00:00-07:00",
      endAt: "2026-08-10T10:00:00-07:00",
      sourceUrl: "https://example.com/event",
      matchTags: [],
      description:
        "Çok uzun açıklama, takvim satırının UTF-8 karakterlerle güvenli biçimde katlandığını doğrular.\nİkinci satır.",
      deadlines: [
        {
          id: "test-registration",
          kind: "registration",
          label: "Registration deadline",
          dueAt: "2026-08-01T10:00:00-07:00",
          sourceUrl: "https://example.com/deadline",
        },
      ],
    },
  ],
};

function unfold(ics: string): string {
  return ics.replace(/\r\n[ \t]/g, "");
}

describe("ICS export", () => {
  it("folds every physical line at 75 UTF-8 octets", () => {
    const line =
      "DESCRIPTION:Türkçe karakterlerle çok uzun bir açıklama, güvenli katlama testi için devam ediyor.";
    const folded = foldIcsLine(line);

    expect(folded.length).toBeGreaterThan(1);
    expect(folded.slice(1).every((item) => item.startsWith(" "))).toBe(true);
    expect(
      folded.every((item) => Buffer.byteLength(item, "utf8") <= 75),
    ).toBe(true);
    expect(
      folded[0] + folded.slice(1).map((item) => item.slice(1)).join(""),
    ).toBe(line);
  });

  it("escapes commas, semicolons, backslashes and line breaks", () => {
    expect(escapeIcsText("A,B;C\\D\nE")).toBe(
      "A\\,B\\;C\\\\D\\nE",
    );
    const ics = unfold(createCalendarIcs(snapshot, [30, 0]));

    expect(ics).toContain("SUMMARY:Test\\, Fest\\; Takvim\\\\Denemesi");
    expect(ics).toContain("\\nİkinci satır.");
  });

  it("converts event and deadline timestamps to UTC and adds alarms", () => {
    const ics = unfold(createCalendarIcs(snapshot, [30, 0]));

    expect(ics).toContain("DTSTAMP:20260730T063000Z");
    expect(ics).toContain("DTSTART:20260803T170000Z");
    expect(ics).toContain("DTEND:20260810T170000Z");
    expect(ics).toContain("DTSTART:20260801T170000Z");
    expect(ics).toContain("TRIGGER:-P30D");
    expect(ics).toContain("TRIGGER:PT0S");
    expect(ics.match(/BEGIN:VALARM/g)).toHaveLength(2);
    expect(ics.endsWith("\r\n")).toBe(true);

    const singleEvent = unfold(
      createEventIcs(snapshot.events[0], snapshot.generatedAt, [7]),
    );
    expect(singleEvent.match(/BEGIN:VEVENT/g)).toHaveLength(2);
    expect(singleEvent.match(/BEGIN:VALARM/g)).toHaveLength(1);
    expect(singleEvent).toContain("TRIGGER:-P7D");
  });
});
