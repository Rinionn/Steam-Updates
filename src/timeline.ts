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

function monthLabel(month: DateTime): string {
  const label = month.setLocale("tr").toFormat("LLLL yyyy");
  return `${label.charAt(0).toLocaleUpperCase("tr")}${label.slice(1)}`;
}

function eventDayRange(event: SteamEvent, timezone: string): string {
  const start = DateTime.fromISO(event.startAt, { zone: "utc" }).setZone(timezone);
  const end = DateTime.fromISO(event.endAt, { zone: "utc" }).setZone(timezone);
  if (start.hasSame(end, "month")) return `${start.day}–${end.day}`;
  return `${start.setLocale("tr").toFormat("d LLL")}–${end
    .setLocale("tr")
    .toFormat("d LLL")}`;
}

function eventChip(event: SteamEvent, timezone: string): string {
  const label = `${event.name}, ${eventDayRange(event, timezone)}`;
  return `
    <a
      class="timeline-chip ${event.kind}"
      href="#etkinlik-${escapeHtml(event.id)}"
      data-event-id="${escapeHtml(event.id)}"
      aria-label="${escapeHtml(`${label} etkinliğine git`)}"
      title="${escapeHtml(event.name)}"
    >
      <span>${escapeHtml(eventDayRange(event, timezone))}</span>
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
  const label = `${item.event.name} başvuru son tarihi, ${due.toFormat(
    "d LLLL yyyy",
  )}`;
  return `
    <a
      class="timeline-chip deadline"
      href="#etkinlik-${escapeHtml(item.event.id)}"
      data-event-id="${escapeHtml(item.event.id)}"
      aria-label="${escapeHtml(`${label}; etkinliğe git`)}"
      title="${escapeHtml(label)}"
    >
      <span>Başvuru · ${escapeHtml(due.toFormat("d LLL"))}</span>
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
          <h2>${escapeHtml(monthLabel(month))}</h2>
          <div class="timeline-month-items">
            ${events.map((event) => eventChip(event, timezone)).join("")}
            ${deadlines.map((item) => deadlineChip(item, timezone)).join("")}
            ${
              events.length === 0 && deadlines.length === 0
                ? `<span class="timeline-month-empty">Planlanmış etkinlik yok</span>`
                : ""
            }
          </div>
        </section>`;
    })
    .join("");

  const criticalStatus = firstRegistrationDeadline
    ? `
      <span class="timeline-critical">
        En yakın kritik tarih:
        <strong>${escapeHtml(
          DateTime.fromISO(firstRegistrationDeadline.deadline.dueAt, {
            zone: "utc",
          })
            .setZone(timezone)
            .setLocale("tr")
            .toFormat("d LLLL yyyy"),
        )} · ${firstRegistrationDeadline.daysLeft} gün</strong>
      </span>`
    : "";

  return `
    <div class="event-timeline" data-event-timeline>
      <div class="timeline-status">
        <time datetime="${escapeHtml(
          model.generated.setZone(timezone).toISODate() || "",
        )}">Bugün · ${escapeHtml(today)}</time>
        ${criticalStatus}
      </div>
      <div class="timeline-grid" id="timeline-months">${monthColumns}</div>
      <div class="timeline-controls">
        <button
          type="button"
          data-timeline-previous
          aria-label="Önceki ay grubunu göster"
          aria-controls="timeline-months"
          disabled
        ><span aria-hidden="true">←</span> Önceki</button>
        <span data-timeline-range aria-live="polite"></span>
        <button
          type="button"
          data-timeline-next
          aria-label="Sonraki ay grubunu göster"
          aria-controls="timeline-months"
        >Sonraki <span aria-hidden="true">→</span></button>
      </div>
    </div>`;
}
