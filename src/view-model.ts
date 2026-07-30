import { DateTime } from "luxon";
import type { AppConfig, EventSnapshot, SteamDeadline, SteamEvent } from "./types.js";

export interface DeadlineView {
  deadline: SteamDeadline;
  event: SteamEvent;
  daysLeft: number;
}

export interface ReportModel {
  generated: DateTime;
  events: SteamEvent[];
  deadlines: DeadlineView[];
  urgentDeadlines: DeadlineView[];
}

export function daysUntil(isoDate: string, timezone: string, now: DateTime): number {
  const due = DateTime.fromISO(isoDate, { zone: "utc" }).setZone(timezone);
  return Math.ceil(
    due.startOf("day").diff(now.setZone(timezone).startOf("day"), "days").days,
  );
}

export function createReportModel(
  snapshot: EventSnapshot,
  appConfig: AppConfig,
  now = DateTime.now(),
): ReportModel {
  const localNow = now.setZone(appConfig.timezone);
  const earliest = localNow.minus({ days: 1 });
  const latest = localNow.plus({ days: appConfig.lookaheadDays });
  const events = snapshot.events
    .filter((event) => {
      const end = DateTime.fromISO(event.endAt, { zone: "utc" }).setZone(
        appConfig.timezone,
      );
      const start = DateTime.fromISO(event.startAt, { zone: "utc" }).setZone(
        appConfig.timezone,
      );
      return end >= earliest && start <= latest;
    })
    .sort((a, b) => a.startAt.localeCompare(b.startAt));

  const deadlines = events
    .flatMap((event) =>
      event.deadlines.map((deadline) => ({
        deadline,
        event,
        daysLeft: daysUntil(deadline.dueAt, appConfig.timezone, localNow),
      })),
    )
    .filter(({ daysLeft }) => daysLeft >= -1 && daysLeft <= appConfig.lookaheadDays)
    .sort((a, b) => a.deadline.dueAt.localeCompare(b.deadline.dueAt));

  const urgentDeadlines = deadlines.filter(({ daysLeft }) => daysLeft <= 30);

  return { generated: localNow, events, deadlines, urgentDeadlines };
}
