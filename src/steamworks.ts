import * as cheerio from "cheerio";
import { DateTime } from "luxon";
import type {
  DeadlineKind,
  SteamDeadline,
  SteamEvent,
} from "./types.js";
import {
  MONTHS,
  compact,
  iso,
  parseClock,
  stableId,
  steamDate,
} from "./utils.js";

const MONTH_PATTERN =
  "(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)";

interface DateRange {
  start: DateTime;
  end: DateTime;
}

function parseHeadingRange(text: string): {
  name: string;
  range: DateRange;
} | null {
  const match = compact(text).match(
    new RegExp(
      `^(.*?)\\s*\\|\\s*${MONTH_PATTERN}\\s+(\\d{1,2})\\s*[–-]\\s*(?:${MONTH_PATTERN}\\s+)?(\\d{1,2}),\\s*(\\d{4})$`,
      "i",
    ),
  );
  if (!match) return null;

  const name = compact(match[1]);
  const startMonth = MONTHS[match[2].toLowerCase()];
  const startDay = Number(match[3]);
  const endMonth = MONTHS[(match[4] || match[2]).toLowerCase()];
  const endDay = Number(match[5]);
  const endYear = Number(match[6]);
  const startYear = startMonth > endMonth ? endYear - 1 : endYear;

  return {
    name,
    range: {
      start: steamDate(startYear, startMonth, startDay, 10, 0),
      end: steamDate(endYear, endMonth, endDay, 10, 0),
    },
  };
}

function parseTableRange(text: string, year: number): DateRange | null {
  const matches = [
    ...compact(text).matchAll(new RegExp(`${MONTH_PATTERN}\\s*(\\d{1,2})`, "gi")),
  ];
  if (matches.length < 2) return null;

  const startMonth = MONTHS[matches[0][1].toLowerCase()];
  const startDay = Number(matches[0][2]);
  const endMonth = MONTHS[matches[1][1].toLowerCase()];
  const endDay = Number(matches[1][2]);
  const endYear = endMonth < startMonth ? year + 1 : year;

  return {
    start: steamDate(year, startMonth, startDay, 10, 0),
    end: steamDate(endYear, endMonth, endDay, 10, 0),
  };
}

function calendarEvent(
  name: string,
  kind: SteamEvent["kind"],
  range: DateRange,
  sourceUrl: string,
  extra: Pick<
    SteamEvent,
    "registrationUrl" | "detailsUrl" | "description"
  > = {},
): SteamEvent {
  return {
    id: stableId(name, kind, String(range.start.year)),
    name,
    kind,
    startAt: iso(range.start),
    endAt: iso(range.end),
    sourceUrl,
    registrationUrl: extra.registrationUrl,
    detailsUrl: extra.detailsUrl,
    description: extra.description,
    deadlines: [],
  };
}

export function parseSteamCalendar(html: string, sourceUrl: string): SteamEvent[] {
  const $ = cheerio.load(html);
  const root = $(".documentation_bbcode").first();
  const rootText = compact(root.text());

  if (!root.length || /sorry, an error occurred/i.test(rootText)) {
    throw new Error("Steamworks etkinlik belgesi okunamadı.");
  }

  const allLinks = root
    .find("a[href]")
    .toArray()
    .map((element) => String($(element).attr("href") || ""))
    .filter(Boolean)
    .map((href) => new URL(href, sourceUrl).toString());

  const events: SteamEvent[] = [];

  root.find("h2").each((_, heading) => {
    const parsed = parseHeadingRange($(heading).text());
    if (!parsed) return;

    const lowerName = parsed.name.toLowerCase();
    if (lowerName.includes("next fest")) {
      const monthName = parsed.range.start
        .setLocale("en")
        .toFormat("LLLL")
        .toLowerCase();
      const year = parsed.range.start.year;
      const detailsUrl = allLinks.find((href) =>
        href.includes(`/nextfest/${year}${monthName}`),
      );
      const registrationUrl = allLinks.find(
        (href) =>
          href.includes("/optin/sale/nextfest_") &&
          href.includes(`_${year}`) &&
          href.toLowerCase().includes(monthName),
      );

      events.push(
        calendarEvent(
          `${parsed.name}: ${parsed.range.start.setLocale("en").toFormat("LLLL yyyy")}`,
          "next_fest",
          parsed.range,
          sourceUrl,
          { detailsUrl, registrationUrl },
        ),
      );
      return;
    }

    if (lowerName.includes("sale")) {
      events.push(
        calendarEvent(parsed.name, "seasonal_sale", parsed.range, sourceUrl),
      );
    }
  });

  let themedYear: number | undefined;
  root.find("h2, table").each((_, element) => {
    if (element.tagName.toLowerCase() === "h2") {
      const match = compact($(element).text()).match(/^(\d{4}) Fests$/i);
      themedYear = match ? Number(match[1]) : undefined;
      return;
    }

    if (!themedYear) return;

    $(element)
      .find("tr")
      .each((rowIndex, row) => {
        if (rowIndex === 0) return;
        const cells = $(row).find("th,td");
        if (cells.length < 2) return;

        const range = parseTableRange($(cells[0]).text(), themedYear as number);
        const name = compact($(cells[1]).text());
        if (!range || !name) return;

        const registrationHref = $(row)
          .find('a[href*="/optin/sale/"]')
          .first()
          .attr("href");
        const detailsHref = $(row)
          .find('a[href*="/doc/marketing/upcoming_events/"]')
          .first()
          .attr("href");
        const notes = cells.length >= 4 ? compact($(cells[3]).text()) : "";

        events.push(
          calendarEvent(name, "themed_fest", range, sourceUrl, {
            registrationUrl: registrationHref
              ? new URL(registrationHref, sourceUrl).toString()
              : undefined,
            detailsUrl: detailsHref
              ? new URL(detailsHref, sourceUrl).toString()
              : undefined,
            description: notes || undefined,
          }),
        );
      });
  });

  const unique = new Map<string, SteamEvent>();
  for (const event of events) unique.set(event.id, event);
  return [...unique.values()].sort((a, b) => a.startAt.localeCompare(b.startAt));
}

function classifyDeadline(text: string): DeadlineKind {
  if (/registration deadline|deadline.*registration/i.test(text)) {
    return "registration";
  }
  if (/review|submitted|submit/i.test(text)) return "review";
  if (/trailer|marketing|material/i.test(text)) return "marketing";
  return "milestone";
}

function actionableDate(text: string): boolean {
  return /deadline|register|registration|review|submit|submitted|must be|opt out|pulls? trailers?|press preview|set your demo live/i.test(
    text,
  );
}

export function parseEventDeadlines(
  html: string,
  event: SteamEvent,
  sourceUrl: string,
): SteamDeadline[] {
  const $ = cheerio.load(html);
  const root = $(".documentation_bbcode").first();
  const rootText = compact(root.text());
  if (!root.length || /sorry, an error occurred/i.test(rootText)) return [];

  const eventYear = DateTime.fromISO(event.startAt).setZone("utc").year;
  const deadlines: SteamDeadline[] = [];

  root.find("li").each((_, item) => {
    const text = compact($(item).text());
    if (!text || !actionableDate(text)) return;

    const match = text.match(
      new RegExp(`^${MONTH_PATTERN}\\s+(\\d{1,2})(?:,\\s*(\\d{4}))?\\b`, "i"),
    );
    if (!match) return;

    const month = MONTHS[match[1].toLowerCase()];
    const day = Number(match[2]);
    const year = Number(match[3] || eventYear);
    const defaultHour = /deadline|must be|submitted|submit/i.test(text) ? 23 : 10;
    const clock = parseClock(text, defaultHour);
    const due = steamDate(year, month, day, clock.hour, clock.minute);
    const kind = classifyDeadline(text);

    deadlines.push({
      id: stableId(event.id, kind, iso(due), text),
      kind,
      label: text,
      dueAt: iso(due),
      sourceUrl,
    });
  });

  const unique = new Map<string, SteamDeadline>();
  for (const deadline of deadlines) unique.set(deadline.id, deadline);
  return [...unique.values()].sort((a, b) => a.dueAt.localeCompare(b.dueAt));
}

export async function enrichWithDeadlines(
  events: SteamEvent[],
  loadHtml: (url: string) => Promise<string>,
): Promise<SteamEvent[]> {
  const enriched = [...events];
  const candidates = enriched
    .map((event, index) => ({ event, index }))
    .filter(({ event }) => event.detailsUrl);
  const concurrency = 4;
  let cursor = 0;

  async function worker(): Promise<void> {
    while (cursor < candidates.length) {
      const current = candidates[cursor++];
      const detailsUrl = current.event.detailsUrl;
      if (!detailsUrl) continue;

      try {
        const html = await loadHtml(detailsUrl);
        enriched[current.index] = {
          ...current.event,
          deadlines: parseEventDeadlines(html, current.event, detailsUrl),
        };
      } catch {
        // Tek bir detay sayfası bozulduğunda ana takvimi kaybetme.
      }
    }
  }

  await Promise.all(
    Array.from(
      { length: Math.min(concurrency, candidates.length || 1) },
      () => worker(),
    ),
  );

  return enriched;
}
