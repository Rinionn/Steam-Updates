import { DateTime } from "luxon";
import { deadlineCopy } from "./deadline-copy.js";
import type { SteamEvent } from "./types.js";
import { escapeHtml } from "./utils.js";
import type { ReportModel } from "./view-model.js";

const MONTH_COUNT = 12;
const SHORT_NAME_LENGTH = 26;

function shortName(name: string): string {
  if (name.length <= SHORT_NAME_LENGTH) return name;
  return `${name.slice(0, SHORT_NAME_LENGTH - 1).trimEnd()}…`;
}

function monthLabel(month: DateTime, locale: "tr" | "en"): string {
  const label = month.setLocale(locale).toFormat("LLLL yyyy");
  return `${label.charAt(0).toLocaleUpperCase(locale)}${label.slice(1)}`;
}

function eventDayRange(
  event: SteamEvent,
  timezone: string,
  locale: "tr" | "en" = "tr",
): string {
  const start = DateTime.fromISO(event.startAt, { zone: "utc" }).setZone(timezone);
  const end = DateTime.fromISO(event.endAt, { zone: "utc" }).setZone(timezone);
  if (start.hasSame(end, "month")) return `${start.day}–${end.day}`;
  return `${start.setLocale(locale).toFormat("d LLL")}–${end
    .setLocale(locale)
    .toFormat("d LLL")}`;
}

function eventChip(event: SteamEvent, timezone: string): string {
  const label = `${event.name}, ${eventDayRange(event, timezone)}`;
  const rangeTr = eventDayRange(event, timezone, "tr");
  const rangeEn = eventDayRange(event, timezone, "en");
  return `
    <a
      class="timeline-chip ${event.kind}"
      href="#etkinlik-${escapeHtml(event.id)}"
      data-event-id="${escapeHtml(event.id)}"
      aria-label="${escapeHtml(`${label} etkinliğine git`)}"
      data-copy-aria-tr="${escapeHtml(`${label} etkinliğine git`)}"
      data-copy-aria-en="${escapeHtml(`Go to ${event.name}, ${eventDayRange(event, timezone, "en")}`)}"
      title="${escapeHtml(event.name)}"
    >
      <span data-copy-tr="${escapeHtml(rangeTr)}" data-copy-en="${escapeHtml(rangeEn)}">${escapeHtml(rangeTr)}</span>
      <strong>${escapeHtml(shortName(event.name))}</strong>
    </a>`;
}

function deadlineChip(
  item: ReportModel["deadlines"][number],
  timezone: string,
): string {
  const due = DateTime.fromISO(item.deadline.dueAt, { zone: "utc" })
    .setZone(timezone)
    .setLocale("tr");
  const dueEn = due.setLocale("en");
  const label = `${item.event.name} başvuru son tarihi, ${due.toFormat(
    "d LLLL yyyy",
  )}`;
  return `
    <a
      class="timeline-chip deadline"
      href="#etkinlik-${escapeHtml(item.event.id)}"
      data-event-id="${escapeHtml(item.event.id)}"
      aria-label="${escapeHtml(`${label}; etkinliğe git`)}"
      data-copy-aria-tr="${escapeHtml(`${label}; etkinliğe git`)}"
      data-copy-aria-en="${escapeHtml(`Go to ${item.event.name} registration deadline, ${dueEn.toFormat("d LLLL yyyy")}`)}"
      title="${escapeHtml(label)}"
    >
      <span><span data-i18n="registration">Başvuru</span> · <span data-copy-tr="${escapeHtml(
        due.toFormat("d LLL"),
      )}" data-copy-en="${escapeHtml(dueEn.toFormat("d LLL"))}">${escapeHtml(
        due.toFormat("d LLL"),
      )}</span></span>
      <strong>${escapeHtml(shortName(item.event.name))}</strong>
    </a>`;
}

export function renderTimeline(
  model: ReportModel,
  timezone: string,
): string {
  const firstMonth = model.generated.setZone(timezone).startOf("month");
  const months = Array.from({ length: MONTH_COUNT }, (_, index) =>
    firstMonth.plus({ months: index }),
  );
  const firstRegistrationDeadline = model.deadlines.find(
    ({ deadline }) => deadlineCopy(deadline).category === "Başvuru",
  );
  const today = model.generated
    .setZone(timezone)
    .setLocale("tr")
    .toFormat("d LLLL yyyy");
  const todayEn = model.generated
    .setZone(timezone)
    .setLocale("en")
    .toFormat("d LLLL yyyy");

  const monthColumns = months
    .map((month, index) => {
      const events = model.events.filter((event) => {
        const start = DateTime.fromISO(event.startAt, { zone: "utc" }).setZone(
          timezone,
        );
        return start.hasSame(month, "month");
      });
      const deadlines = model.deadlines.filter(({ deadline, daysLeft }) => {
        const due = DateTime.fromISO(deadline.dueAt, { zone: "utc" }).setZone(
          timezone,
        );
        return (
          daysLeft <= 30 &&
          deadlineCopy(deadline).category === "Başvuru" &&
          due.hasSame(month, "month")
        );
      });

      return `
        <section class="timeline-month" data-timeline-month="${index}"${
          index >= 2 ? " hidden" : ""
        }>
          <h2
            data-month-tr="${escapeHtml(monthLabel(month, "tr"))}"
            data-month-en="${escapeHtml(monthLabel(month, "en"))}"
          >${escapeHtml(monthLabel(month, "tr"))}</h2>
          <div class="timeline-month-items">
            ${events.map((event) => eventChip(event, timezone)).join("")}
            ${deadlines.map((item) => deadlineChip(item, timezone)).join("")}
            ${
              events.length === 0 && deadlines.length === 0
                ? `<span class="timeline-month-empty" data-i18n="noPlannedEvents">Planlanmış etkinlik yok</span>`
                : ""
            }
          </div>
        </section>`;
    })
    .join("");

  const criticalDateTr = firstRegistrationDeadline
    ? DateTime.fromISO(firstRegistrationDeadline.deadline.dueAt, {
        zone: "utc",
      })
        .setZone(timezone)
        .setLocale("tr")
        .toFormat("d LLLL yyyy")
    : "";
  const criticalDateEn = firstRegistrationDeadline
    ? DateTime.fromISO(firstRegistrationDeadline.deadline.dueAt, {
        zone: "utc",
      })
        .setZone(timezone)
        .setLocale("en")
        .toFormat("d LLLL yyyy")
    : "";
  const criticalStatus = firstRegistrationDeadline
    ? `
      <span class="timeline-critical">
        <span data-i18n="nearestCritical">En yakın kritik tarih:</span>
        <strong><span data-copy-tr="${escapeHtml(
          criticalDateTr,
        )}" data-copy-en="${escapeHtml(criticalDateEn)}">${escapeHtml(
          criticalDateTr,
        )}</span> · ${firstRegistrationDeadline.daysLeft} <span data-i18n="days">gün</span></strong>
      </span>`
    : "";

  return `
    <div class="event-timeline" data-event-timeline>
      <div class="timeline-status">
        <time datetime="${escapeHtml(
          model.generated.setZone(timezone).toISODate() || "",
        )}"><span data-i18n="today">Bugün</span> · <span data-copy-tr="${escapeHtml(
          today,
        )}" data-copy-en="${escapeHtml(todayEn)}">${escapeHtml(today)}</span></time>
        ${criticalStatus}
      </div>
      <div class="timeline-grid" id="timeline-months">${monthColumns}</div>
      <div class="timeline-controls">
        <button
          type="button"
          data-timeline-previous
          aria-label="Önceki ay grubunu göster"
          data-copy-aria-tr="Önceki ay grubunu göster"
          data-copy-aria-en="Show previous group of months"
          aria-controls="timeline-months"
          disabled
        ><span aria-hidden="true">←</span> <span data-i18n="previous">Önceki</span></button>
        <span data-timeline-range aria-live="polite"></span>
        <button
          type="button"
          data-timeline-next
          aria-label="Sonraki ay grubunu göster"
          data-copy-aria-tr="Sonraki ay grubunu göster"
          data-copy-aria-en="Show next group of months"
          aria-controls="timeline-months"
        ><span data-i18n="next">Sonraki</span> <span aria-hidden="true">→</span></button>
      </div>
    </div>`;
}
