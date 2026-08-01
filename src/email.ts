import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import nodemailer from "nodemailer";
import { DateTime } from "luxon";
import { readChangelog } from "./changelog.js";
import { config, paths } from "./config.js";
import { deadlineCopy } from "./deadline-copy.js";
import { buildEventTasks } from "./event-tasks.js";
import {
  markDigestSent,
  readNotificationState,
} from "./storage.js";
import type {
  ChangeKind,
  ChangeRecord,
  EventSnapshot,
  SteamEvent,
} from "./types.js";
import { escapeHtml } from "./utils.js";
import { createReportModel, daysUntil } from "./view-model.js";

const kindLabels: Record<SteamEvent["kind"], string> = {
  seasonal_sale: "Sezon indirimi",
  themed_fest: "Temalı festival",
  next_fest: "Next Fest",
};

const changeKindLabels: Record<ChangeKind, string> = {
  added: "Etkinlik eklendi",
  removed: "Etkinlik kaldırıldı",
  date_shifted: "Tarih değişti",
  deadline_changed: "Son tarih değişti",
  renamed: "Adı değişti",
};

const EMAIL_COLORS = {
  canvas: "#f3eef7",
  surface: "#ffffff",
  surfaceInk: "#21152d",
  surfaceMuted: "#65566f",
  surfaceSubtle: "#6f6079",
  surfaceLine: "#e4d9ea",
  surfaceRule: "#eee5f3",
  chipBackground: "#f3edf7",
  chipInk: "#5e5069",
  emptyBorder: "#d8cce0",
  hero: "#090512",
  heroAlt: "#160923",
  heroGlow: "rgba(255,62,150,.28)",
  heroMuted: "#c8bdd4",
  brandPink: "#ff3e96",
  brandPurple: "#b02bf2",
  brandViolet: "#8e25cb",
  brandFuchsia: "#a823d6",
  brandPinkDark: "#a91659",
  brandPurpleDark: "#6f24a4",
  brandDeepPurple: "#7c25b1",
  criticalSurface: "#fff0f5",
  criticalBorder: "#ffb7d4",
  weekSurface: "#f8edff",
  weekBorder: "#dfc1fb",
  monthSurface: "#fff4fa",
  monthBorder: "#ffc4dd",
  monthInk: "#a82065",
  planSurface: "#f5effa",
  planBorder: "#dbcce7",
  planInk: "#5b4968",
  seasonalSurface: "#ffe8f2",
  nextFestSurface: "#f2e7ff",
  nextFestInk: "#7a34c8",
  themedSurface: "#f5e8ff",
  prioritySurface: "#fff2f8",
  priorityBorder: "#ffc2df",
  priorityInk: "#3b1830",
  priorityMuted: "#745568",
  darkCanvas: "#090512",
  darkSurface: "#160d20",
  darkBorder: "#493751",
  darkInk: "#ffffff",
  darkMuted: "#e2d6e8",
  darkSubtle: "#c8bdd4",
  darkSoft: "#2b1934",
  darkAccent: "#f2a7d1",
  darkPriority: "#321425",
  darkPriorityBorder: "#70425a",
  darkPriorityInk: "#fff4fa",
  darkPriorityMuted: "#f0cfe0",
  transparent: "transparent",
} as const;

export interface DigestResult {
  sent: boolean;
  skippedReason?: string;
  provider?: "resend" | "smtp";
  messageId?: string;
  htmlPreview: string;
  textPreview: string;
}

function localDate(isoDate: string, withTime = false): string {
  return DateTime.fromISO(isoDate, { zone: "utc" })
    .setZone(config.timezone)
    .setLocale("tr")
    .toFormat(withTime ? "d LLLL yyyy, HH:mm" : "d LLLL yyyy");
}

function safeSubject(value: string): string {
  return value.replace(/[\r\n]+/g, " ").trim().slice(0, 180);
}

function countdown(daysLeft: number): string {
  if (daysLeft < 0) return "süresi geçti";
  if (daysLeft === 0) return "bugün";
  if (daysLeft === 1) return "yarın";
  return `${daysLeft} gün kaldı`;
}

function urgencyMeta(daysLeft: number): {
  label: string;
  background: string;
  border: string;
  color: string;
} {
  if (daysLeft <= 1) {
    return {
      label: "KRİTİK",
      background: EMAIL_COLORS.criticalSurface,
      border: EMAIL_COLORS.criticalBorder,
      color: EMAIL_COLORS.brandPinkDark,
    };
  }
  if (daysLeft <= 7) {
    return {
      label: "BU HAFTA",
      background: EMAIL_COLORS.weekSurface,
      border: EMAIL_COLORS.weekBorder,
      color: EMAIL_COLORS.brandPurpleDark,
    };
  }
  if (daysLeft <= 30) {
    return {
      label: "YAKLAŞIYOR",
      background: EMAIL_COLORS.monthSurface,
      border: EMAIL_COLORS.monthBorder,
      color: EMAIL_COLORS.monthInk,
    };
  }
  return {
    label: "PLANLA",
    background: EMAIL_COLORS.planSurface,
    border: EMAIL_COLORS.planBorder,
    color: EMAIL_COLORS.planInk,
  };
}

function shortCountdown(daysLeft: number): string {
  if (daysLeft < 0) return "Geçti";
  if (daysLeft === 0) return "Bugün";
  if (daysLeft === 1) return "Yarın";
  return `${daysLeft} gün`;
}

function changeValue(record: ChangeRecord, value: string): string {
  if (
    record.kind === "date_shifted" ||
    record.kind === "deadline_changed"
  ) {
    const parsed = DateTime.fromISO(value, { zone: "utc" });
    if (parsed.isValid) return localDate(value, true);
  }
  return value;
}

function changeValues(record: ChangeRecord): string {
  const before = record.before
    ? changeValue(record, record.before)
    : undefined;
  const after = record.after ? changeValue(record, record.after) : undefined;
  if (before && after) return `${before} → ${after}`;
  if (after) return `Yeni: ${after}`;
  if (before) return `Önceki: ${before}`;
  return "";
}

function emailChangeRow(record: ChangeRecord): string {
  const values = changeValues(record);
  return `
    <tr>
      <td class="event-rule" colspan="2" style="padding:12px 0;border-bottom:1px solid ${EMAIL_COLORS.surfaceRule}">
        <span class="surface-subtle" style="display:block;color:${EMAIL_COLORS.surfaceSubtle};font-size:10px">${escapeHtml(localDate(record.detectedAt, true))}</span>
        <strong class="surface-ink" style="display:block;margin-top:4px;color:${EMAIL_COLORS.surfaceInk};font-size:14px;line-height:1.3">${escapeHtml(record.eventName)}</strong>
        <span class="soft-chip" style="display:inline-block;margin-top:6px;padding:4px 7px;border-radius:999px;background:${EMAIL_COLORS.chipBackground};color:${EMAIL_COLORS.chipInk};font-size:10px;font-weight:800">${escapeHtml(changeKindLabels[record.kind])}</span>
        ${values ? `<span class="surface-muted" style="display:block;margin-top:6px;color:${EMAIL_COLORS.surfaceMuted};font-size:11px;line-height:1.4">${escapeHtml(values)}</span>` : ""}
      </td>
    </tr>`;
}

export function renderDigest(
  snapshot: EventSnapshot,
  changelog: ChangeRecord[] = [],
  subjectTemplate?: string,
): {
  subject: string;
  html: string;
  text: string;
} {
  const model = createReportModel(snapshot, config);
  const changeCutoff = model.generated.minus({ hours: 24 }).toMillis();
  const generatedAt = model.generated.toMillis();
  const recentChanges = changelog
    .filter((record) => {
      const detectedAt = DateTime.fromISO(record.detectedAt, {
        zone: "utc",
      }).toMillis();
      return (
        Number.isFinite(detectedAt) &&
        detectedAt >= changeCutoff &&
        detectedAt <= generatedAt
      );
    })
    .sort((left, right) => right.detectedAt.localeCompare(left.detectedAt));
  const deadlines = model.deadlines
    .filter(
      ({ daysLeft }) =>
        daysLeft >= 0 && daysLeft <= config.emailLookaheadDays,
    );
  const events = model.events.filter((event) => {
    const startsIn = daysUntil(event.startAt, config.timezone, model.generated);
    const endsIn = daysUntil(event.endAt, config.timezone, model.generated);
    return endsIn >= 0 && startsIn <= config.emailLookaheadDays;
  });
  const dueThisWeek = deadlines.filter(
    ({ daysLeft }) => daysLeft >= 0 && daysLeft <= 7,
  ).length;
  const dueThisMonth = deadlines.filter(
    ({ daysLeft }) => daysLeft >= 0 && daysLeft <= 30,
  ).length;
  const nextDeadline = deadlines[0];
  const subject = safeSubject(
    (
      subjectTemplate ||
      "Steam Radar · {{kritik}} kritik tarih · {{etkinlik}} etkinlik"
    )
      .replaceAll("{{kritik}}", String(dueThisWeek))
      .replaceAll("{{etkinlik}}", String(events.length))
      .replaceAll(
        "{{tarih}}",
        model.generated.setLocale("tr").toFormat("d LLLL yyyy"),
      ),
  );
  const preheader = nextDeadline
    ? `${nextDeadline.event.name}: ${deadlineCopy(nextDeadline.deadline).title} için ${countdown(
        nextDeadline.daysLeft,
      )}.`
    : `Önümüzdeki ${config.emailLookaheadDays} gündeki ${events.length} Steam etkinliğinin özeti.`;

  const deadlineHtml =
    deadlines.length > 0
      ? deadlines
          .map(({ deadline, event, daysLeft }) => {
            const copy = deadlineCopy(deadline);
            const urgency = urgencyMeta(daysLeft);
            const actionUrl =
              copy.category === "Başvuru" && event.registrationUrl
                ? event.registrationUrl
                : deadline.sourceUrl;
            const actionLabel = `${event.name}: ${copy.title} görevini aç`;
            return `
              <table role="presentation" class="deadline-card surface" width="100%" cellspacing="0" cellpadding="0" style="width:100%;margin:0 0 10px;border:1px solid ${urgency.border};border-collapse:separate;border-spacing:0;border-radius:12px;background:${EMAIL_COLORS.surface}">
                <tr>
                  <td class="deadline-status" width="100" valign="middle" align="center" bgcolor="${urgency.background}" style="width:100px;padding:16px 10px;border-right:1px solid ${urgency.border};border-radius:11px 0 0 11px">
                    <span style="display:block;color:${urgency.color};font-size:10px;font-weight:800;letter-spacing:.08em">${urgency.label}</span>
                    <strong style="display:block;margin-top:5px;color:${urgency.color};font-size:18px;line-height:1.15">${escapeHtml(shortCountdown(daysLeft))}</strong>
                  </td>
                  <td class="deadline-copy" valign="middle" style="padding:14px 16px;overflow-wrap:anywhere;word-break:break-word">
                    <span class="soft-chip" style="display:inline-block;padding:4px 7px;border-radius:999px;background:${EMAIL_COLORS.chipBackground};color:${EMAIL_COLORS.chipInk};font-size:10px;font-weight:800;letter-spacing:.04em;text-transform:uppercase">${escapeHtml(copy.category)}</span>
                    <strong class="surface-ink" style="display:block;margin-top:7px;color:${EMAIL_COLORS.surfaceInk};font-size:15px;line-height:1.3">${escapeHtml(copy.title)}</strong>
                    <span class="surface-muted" style="display:block;margin-top:3px;color:${EMAIL_COLORS.surfaceMuted};font-size:13px;line-height:1.4">${escapeHtml(event.name)}</span>
                    <span class="surface-subtle" style="display:block;margin-top:5px;color:${EMAIL_COLORS.surfaceSubtle};font-size:11px">${escapeHtml(localDate(deadline.dueAt, true))}</span>
                  </td>
                  <td class="deadline-action-desktop" width="76" valign="middle" align="right" style="width:76px;padding:14px 14px 14px 0">
                    <a class="surface-accent" href="${escapeHtml(actionUrl)}" aria-label="${escapeHtml(actionLabel)}" style="display:inline-block;padding:10px 12px;border:1px solid ${EMAIL_COLORS.weekBorder};border-radius:8px;color:${EMAIL_COLORS.brandDeepPurple};font-size:12px;font-weight:800;text-decoration:none;white-space:nowrap">Aç →</a>
                  </td>
                </tr>
                <tr>
                  <td class="deadline-action-mobile" colspan="3" align="left" style="display:none;max-height:0;overflow:hidden;padding:0;font-size:0;line-height:0">
                    <a href="${escapeHtml(actionUrl)}" aria-label="${escapeHtml(actionLabel)}" style="display:block;padding:11px 14px;border-radius:8px;background:${EMAIL_COLORS.brandPinkDark};background-image:linear-gradient(90deg,${EMAIL_COLORS.brandPurpleDark},${EMAIL_COLORS.brandPinkDark});color:${EMAIL_COLORS.surface};font-size:12px;font-weight:800;line-height:1.2;text-align:center;text-decoration:none">Görevi aç →</a>
                  </td>
                </tr>
              </table>`;
          })
          .join("")
      : `<div class="surface-subtle" style="padding:18px;border:1px dashed ${EMAIL_COLORS.emptyBorder};border-radius:12px;color:${EMAIL_COLORS.surfaceSubtle};text-align:center">Yaklaşan bilinen bir son tarih yok.</div>`;

  const eventHtml = events
    .map((event) => {
      const actionUrl = event.registrationUrl || event.detailsUrl || event.sourceUrl;
      const tasks = buildEventTasks(event);
      const startsIn = daysUntil(event.startAt, config.timezone, model.generated);
      const startLabel =
        startsIn <= 0
          ? "Devam ediyor"
          : startsIn === 1
            ? "Yarın başlıyor"
            : `${startsIn} gün sonra`;
      const kindColor =
        event.kind === "seasonal_sale"
          ? EMAIL_COLORS.brandPinkDark
          : event.kind === "next_fest"
            ? EMAIL_COLORS.nextFestInk
            : EMAIL_COLORS.brandFuchsia;
      const kindBackground =
        event.kind === "seasonal_sale"
          ? EMAIL_COLORS.seasonalSurface
          : event.kind === "next_fest"
            ? EMAIL_COLORS.nextFestSurface
            : EMAIL_COLORS.themedSurface;
      const actionLabel = `${event.name} etkinliğinin ayrıntılarını aç`;
      return `
        <tr>
          <td class="event-rule" width="14" valign="top" style="width:14px;padding:15px 0;border-bottom:1px solid ${EMAIL_COLORS.surfaceRule}">
            <span style="display:block;width:6px;height:38px;border-radius:999px;background:${kindColor};font-size:1px;line-height:1px">&nbsp;</span>
          </td>
          <td class="event-rule" valign="top" style="padding:14px 10px 14px 0;border-bottom:1px solid ${EMAIL_COLORS.surfaceRule};overflow-wrap:anywhere;word-break:break-word">
            <span style="display:inline-block;padding:4px 7px;border-radius:999px;background:${kindBackground};color:${kindColor};font-size:10px;font-weight:800;letter-spacing:.04em;text-transform:uppercase">${escapeHtml(kindLabels[event.kind])}</span>
            <strong class="surface-ink" style="display:block;margin-top:7px;color:${EMAIL_COLORS.surfaceInk};font-size:15px;line-height:1.3">${escapeHtml(event.name)}</strong>
            <span class="surface-subtle" style="display:block;margin-top:5px;color:${EMAIL_COLORS.surfaceSubtle};font-size:12px;line-height:1.4">${escapeHtml(localDate(event.startAt))} – ${escapeHtml(localDate(event.endAt))}</span>
          </td>
          <td class="event-rule" width="112" valign="middle" align="right" style="width:112px;padding:14px 0;border-bottom:1px solid ${EMAIL_COLORS.surfaceRule}">
            <strong class="surface-ink" style="display:block;color:${EMAIL_COLORS.surfaceInk};font-size:12px">${escapeHtml(startLabel)}</strong>
            <span class="surface-subtle" style="display:block;margin-top:4px;color:${EMAIL_COLORS.surfaceSubtle};font-size:11px">${tasks.length} görev</span>
            <a class="surface-accent" href="${escapeHtml(actionUrl)}" aria-label="${escapeHtml(actionLabel)}" style="display:block;margin-top:6px;color:${EMAIL_COLORS.brandPurpleDark};font-size:11px;font-weight:800;text-decoration:none">Ayrıntılar →</a>
          </td>
        </tr>`;
    })
    .join("");

  const priorityHtml = nextDeadline
    ? (() => {
        const copy = deadlineCopy(nextDeadline.deadline);
        const actionUrl =
          copy.category === "Başvuru" && nextDeadline.event.registrationUrl
            ? nextDeadline.event.registrationUrl
            : nextDeadline.deadline.sourceUrl;
        const actionLabel = `${nextDeadline.event.name}: ${copy.title} görevini aç`;
        return `
          <table role="presentation" class="priority-surface" width="100%" cellspacing="0" cellpadding="0" bgcolor="${EMAIL_COLORS.prioritySurface}" style="width:100%;border:1px solid ${EMAIL_COLORS.priorityBorder};border-collapse:separate;border-spacing:0;border-radius:14px;background:${EMAIL_COLORS.prioritySurface}">
            <tr>
              <td class="priority-copy" style="padding:18px 20px">
                <span class="priority-accent" style="display:block;color:${EMAIL_COLORS.monthInk};font-size:10px;font-weight:800;letter-spacing:.1em">İLK BAKILACAK KONU</span>
                <strong class="priority-ink" style="display:block;margin-top:7px;color:${EMAIL_COLORS.priorityInk};font-size:18px;line-height:1.3">${escapeHtml(copy.title)}</strong>
                <span class="priority-muted" style="display:block;margin-top:5px;color:${EMAIL_COLORS.priorityMuted};font-size:13px">${escapeHtml(nextDeadline.event.name)} · ${escapeHtml(localDate(nextDeadline.deadline.dueAt, true))}</span>
              </td>
              <td class="priority-action" width="128" align="center" valign="middle" style="width:128px;padding:18px 18px 18px 0">
                <strong class="priority-accent" style="display:block;color:${EMAIL_COLORS.monthInk};font-size:15px">${escapeHtml(shortCountdown(nextDeadline.daysLeft))}</strong>
                <a href="${escapeHtml(actionUrl)}" aria-label="${escapeHtml(actionLabel)}" style="display:inline-block;margin-top:8px;padding:10px 14px;border-radius:8px;background:${EMAIL_COLORS.brandPinkDark};background-image:linear-gradient(90deg,${EMAIL_COLORS.brandPurpleDark},${EMAIL_COLORS.brandPinkDark});color:${EMAIL_COLORS.surface};font-size:12px;font-weight:800;text-decoration:none">Görevi aç</a>
              </td>
            </tr>
          </table>`;
      })()
    : "";

  const recentChangesHtml =
    recentChanges.length > 0
      ? `
          <tr>
            <td class="surface" bgcolor="${EMAIL_COLORS.surface}" style="padding:22px;margin-top:12px;border:1px solid ${EMAIL_COLORS.surfaceLine};border-radius:16px;background:${EMAIL_COLORS.surface}">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="width:100%;border-collapse:collapse">
                <tr>
                  <td style="padding-bottom:8px">
                    <span class="surface-accent" style="display:block;color:${EMAIL_COLORS.brandPinkDark};font-size:10px;font-weight:800;letter-spacing:.1em">SON 24 SAATTE DEĞİŞENLER</span>
                    <h2 class="surface-ink" style="margin:5px 0 0;color:${EMAIL_COLORS.surfaceInk};font-family:'Space Grotesk',Arial,sans-serif;font-size:20px;line-height:1.2">Valve takvimindeki güncellemeler</h2>
                  </td>
                  <td align="right" valign="bottom" style="padding-bottom:8px">
                    <span class="surface-subtle" style="color:${EMAIL_COLORS.surfaceSubtle};font-size:11px">${recentChanges.length} kayıt</span>
                  </td>
                </tr>
                ${recentChanges.map(emailChangeRow).join("")}
              </table>
            </td>
          </tr>`
      : "";

  const html = `<!doctype html>
<html lang="tr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light dark">
  <meta name="supported-color-schemes" content="light dark">
  <title>${escapeHtml(subject)}</title>
  <style>
    :root {
      color-scheme: light dark;
      supported-color-schemes: light dark;
    }
    @media only screen and (max-width: 620px) {
      .email-shell { width: 100% !important; }
      .mobile-pad { padding-left: 14px !important; padding-right: 14px !important; }
      .stack-cell { display: block !important; width: 100% !important; box-sizing: border-box !important; }
      .header-action { padding: 0 24px 24px !important; text-align: left !important; }
      .kpi-cell { display: block !important; width: 100% !important; box-sizing: border-box !important; margin-bottom: 8px !important; }
      .kpi-gap { display: none !important; }
      .deadline-status { width: 78px !important; padding: 14px 7px !important; }
      .deadline-copy { padding: 12px !important; }
      .deadline-action-desktop { display: none !important; width: 0 !important; max-height: 0 !important; overflow: hidden !important; padding: 0 !important; }
      .deadline-action-mobile { display: table-cell !important; width: 100% !important; max-height: none !important; overflow: visible !important; padding: 0 12px 12px !important; font-size: 12px !important; line-height: 1.2 !important; }
      .priority-copy, .priority-action { display: block !important; width: 100% !important; box-sizing: border-box !important; text-align: left !important; }
      .priority-action { padding: 0 20px 18px !important; }
    }
    @media (prefers-color-scheme: dark) {
      .email-body, .email-canvas { background-color: ${EMAIL_COLORS.darkCanvas} !important; color: ${EMAIL_COLORS.darkInk} !important; }
      .surface { background-color: ${EMAIL_COLORS.darkSurface} !important; border-color: ${EMAIL_COLORS.darkBorder} !important; }
      .surface-ink { color: ${EMAIL_COLORS.darkInk} !important; }
      .surface-muted { color: ${EMAIL_COLORS.darkMuted} !important; }
      .surface-subtle { color: ${EMAIL_COLORS.darkSubtle} !important; }
      .surface-accent { color: ${EMAIL_COLORS.darkAccent} !important; }
      .soft-chip { background-color: ${EMAIL_COLORS.darkSoft} !important; color: ${EMAIL_COLORS.darkInk} !important; }
      .event-rule { border-bottom-color: ${EMAIL_COLORS.darkBorder} !important; }
      .priority-surface { background-color: ${EMAIL_COLORS.darkPriority} !important; border-color: ${EMAIL_COLORS.darkPriorityBorder} !important; }
      .priority-ink { color: ${EMAIL_COLORS.darkPriorityInk} !important; }
      .priority-muted { color: ${EMAIL_COLORS.darkPriorityMuted} !important; }
      .priority-accent { color: ${EMAIL_COLORS.darkAccent} !important; }
    }
    [data-ogsc] .email-canvas { background-color: ${EMAIL_COLORS.darkCanvas} !important; color: ${EMAIL_COLORS.darkInk} !important; }
    [data-ogsc] .surface { background-color: ${EMAIL_COLORS.darkSurface} !important; border-color: ${EMAIL_COLORS.darkBorder} !important; }
    [data-ogsc] .surface-ink { color: ${EMAIL_COLORS.darkInk} !important; }
    [data-ogsc] .surface-muted { color: ${EMAIL_COLORS.darkMuted} !important; }
    [data-ogsc] .surface-subtle { color: ${EMAIL_COLORS.darkSubtle} !important; }
    [data-ogsc] .surface-accent { color: ${EMAIL_COLORS.darkAccent} !important; }
    [data-ogsc] .soft-chip { background-color: ${EMAIL_COLORS.darkSoft} !important; color: ${EMAIL_COLORS.darkInk} !important; }
    [data-ogsc] .event-rule { border-bottom-color: ${EMAIL_COLORS.darkBorder} !important; }
    [data-ogsc] .priority-surface { background-color: ${EMAIL_COLORS.darkPriority} !important; border-color: ${EMAIL_COLORS.darkPriorityBorder} !important; }
    [data-ogsc] .priority-ink { color: ${EMAIL_COLORS.darkPriorityInk} !important; }
    [data-ogsc] .priority-muted { color: ${EMAIL_COLORS.darkPriorityMuted} !important; }
    [data-ogsc] .priority-accent { color: ${EMAIL_COLORS.darkAccent} !important; }
  </style>
</head>
<body class="email-body" bgcolor="${EMAIL_COLORS.canvas}" style="margin:0;padding:0;background:${EMAIL_COLORS.canvas};color:${EMAIL_COLORS.surfaceInk};font-family:'Space Grotesk',Arial,'Helvetica Neue',sans-serif">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${EMAIL_COLORS.transparent}">${escapeHtml(preheader)}</div>
  <table role="presentation" class="email-canvas" width="100%" cellspacing="0" cellpadding="0" bgcolor="${EMAIL_COLORS.canvas}" style="width:100%;background:${EMAIL_COLORS.canvas}">
    <tr>
      <td class="mobile-pad" align="center" style="padding:24px 16px 36px">
        <table role="presentation" class="email-shell" width="100%" cellspacing="0" cellpadding="0" style="width:100%;max-width:640px">
          <tr>
            <td bgcolor="${EMAIL_COLORS.hero}" style="border-radius:18px;background:${EMAIL_COLORS.hero};background-image:radial-gradient(circle at 90% 15%,${EMAIL_COLORS.heroGlow},${EMAIL_COLORS.transparent} 45%),linear-gradient(135deg,${EMAIL_COLORS.heroAlt},${EMAIL_COLORS.hero})">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td class="stack-cell" valign="middle" style="padding:26px 24px">
                    <span style="display:block;color:${EMAIL_COLORS.brandPink};font-size:10px;font-weight:800;letter-spacing:.13em">STEAM RADAR · STEAMWORKS TAKİBİ</span>
                    <h1 style="margin:8px 0 5px;color:${EMAIL_COLORS.surface};font-family:'Space Grotesk',Arial,sans-serif;font-size:27px;font-weight:800;line-height:1.08">Steam Radar</h1>
                    <p style="margin:0;color:${EMAIL_COLORS.heroMuted};font-size:12px;line-height:1.5">${escapeHtml(
                      model.generated.setLocale("tr").toFormat("d LLLL yyyy, HH:mm"),
                    )} · İstanbul</p>
                  </td>
                  <td class="stack-cell header-action" width="190" align="right" valign="middle" style="width:190px;padding:26px 24px 26px 0">
                    <a href="${escapeHtml(config.dashboardUrl)}" aria-label="Canlı Steam etkinlik panelini aç" style="display:inline-block;padding:12px 15px;border-radius:9px;background:${EMAIL_COLORS.brandPinkDark};background-image:linear-gradient(90deg,${EMAIL_COLORS.brandPurpleDark},${EMAIL_COLORS.brandPinkDark});color:${EMAIL_COLORS.surface};font-size:12px;font-weight:800;text-decoration:none">Canlı paneli aç →</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          ${recentChangesHtml}

          <tr>
            <td style="padding-top:12px">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td class="kpi-cell surface" width="202" bgcolor="${EMAIL_COLORS.surface}" style="width:202px;padding:16px;border:1px solid ${EMAIL_COLORS.surfaceLine};border-radius:12px;background:${EMAIL_COLORS.surface}">
                    <strong class="surface-accent" style="display:block;color:${EMAIL_COLORS.brandPink};font-size:25px;line-height:1">${dueThisWeek}</strong>
                    <span class="surface-muted" style="display:block;margin-top:6px;color:${EMAIL_COLORS.surfaceMuted};font-size:11px;font-weight:700">7 gün içindeki tarih</span>
                  </td>
                  <td class="kpi-gap" width="10" style="width:10px">&nbsp;</td>
                  <td class="kpi-cell surface" width="202" bgcolor="${EMAIL_COLORS.surface}" style="width:202px;padding:16px;border:1px solid ${EMAIL_COLORS.surfaceLine};border-radius:12px;background:${EMAIL_COLORS.surface}">
                    <strong class="surface-accent" style="display:block;color:${EMAIL_COLORS.brandPurple};font-size:25px;line-height:1">${dueThisMonth}</strong>
                    <span class="surface-muted" style="display:block;margin-top:6px;color:${EMAIL_COLORS.surfaceMuted};font-size:11px;font-weight:700">30 gün içindeki tarih</span>
                  </td>
                  <td class="kpi-gap" width="10" style="width:10px">&nbsp;</td>
                  <td class="kpi-cell surface" width="202" bgcolor="${EMAIL_COLORS.surface}" style="width:202px;padding:16px;border:1px solid ${EMAIL_COLORS.surfaceLine};border-radius:12px;background:${EMAIL_COLORS.surface}">
                    <strong class="surface-accent" style="display:block;color:${EMAIL_COLORS.brandViolet};font-size:25px;line-height:1">${events.length}</strong>
                    <span class="surface-muted" style="display:block;margin-top:6px;color:${EMAIL_COLORS.surfaceMuted};font-size:11px;font-weight:700">${config.emailLookaheadDays} günlük etkinlik</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          ${
            priorityHtml
              ? `<tr><td style="padding-top:12px">${priorityHtml}</td></tr>`
              : ""
          }

          <tr>
            <td class="surface" bgcolor="${EMAIL_COLORS.surface}" style="padding:22px;margin-top:12px;border:1px solid ${EMAIL_COLORS.surfaceLine};border-radius:16px;background:${EMAIL_COLORS.surface}">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-bottom:14px">
                <tr>
                  <td>
                    <span class="surface-accent" style="display:block;color:${EMAIL_COLORS.brandPurpleDark};font-size:10px;font-weight:800;letter-spacing:.1em">ÖNCELİK SIRASI</span>
                    <h2 class="surface-ink" style="margin:5px 0 0;color:${EMAIL_COLORS.surfaceInk};font-family:'Space Grotesk',Arial,sans-serif;font-size:20px;line-height:1.2">Önümüzdeki ${config.emailLookaheadDays} günün son tarihleri</h2>
                  </td>
                  <td align="right" valign="bottom">
                    <span class="surface-subtle" style="color:${EMAIL_COLORS.surfaceSubtle};font-size:11px">${deadlines.length} kayıt</span>
                  </td>
                </tr>
              </table>
              ${deadlineHtml}
            </td>
          </tr>

          <tr>
            <td class="surface" bgcolor="${EMAIL_COLORS.surface}" style="padding:22px;margin-top:12px;border:1px solid ${EMAIL_COLORS.surfaceLine};border-radius:16px;background:${EMAIL_COLORS.surface}">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-bottom:6px">
                <tr>
                  <td>
                    <span class="surface-accent" style="display:block;color:${EMAIL_COLORS.brandPurpleDark};font-size:10px;font-weight:800;letter-spacing:.1em">TAKVİM</span>
                    <h2 class="surface-ink" style="margin:5px 0 0;color:${EMAIL_COLORS.surfaceInk};font-family:'Space Grotesk',Arial,sans-serif;font-size:20px;line-height:1.2">${config.emailLookaheadDays} günlük etkinlik takvimi</h2>
                  </td>
                  <td align="right" valign="bottom">
                    <span class="surface-subtle" style="color:${EMAIL_COLORS.surfaceSubtle};font-size:11px">${events.length} etkinlik</span>
                  </td>
                </tr>
              </table>
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="width:100%;border-collapse:collapse">${eventHtml}</table>
            </td>
          </tr>

          <tr>
            <td class="surface" align="center" bgcolor="${EMAIL_COLORS.surface}" style="padding:24px;margin-top:12px;border:1px solid ${EMAIL_COLORS.surfaceLine};border-radius:16px;background:${EMAIL_COLORS.surface}">
              <strong class="surface-ink" style="display:block;color:${EMAIL_COLORS.surfaceInk};font-size:17px">Tüm festival, tarih ve görevleri tek yerde görün</strong>
              <span class="surface-subtle" style="display:block;margin-top:6px;color:${EMAIL_COLORS.surfaceSubtle};font-size:12px;line-height:1.5">${config.emailLookaheadDays} gün sonrasındaki takvim, arama, filtreleme ve açılabilir görev listeleri canlı panelde hazır.</span>
              <a href="${escapeHtml(config.dashboardUrl)}" aria-label="Tüm Steam etkinlik takvimini aç" style="display:inline-block;margin-top:14px;padding:13px 18px;border-radius:9px;background:${EMAIL_COLORS.brandPinkDark};background-image:linear-gradient(90deg,${EMAIL_COLORS.brandPurpleDark},${EMAIL_COLORS.brandPinkDark});color:${EMAIL_COLORS.surface};font-size:13px;font-weight:800;text-decoration:none">Tüm takvimi aç →</a>
            </td>
          </tr>

          <tr>
            <td class="surface-subtle" align="center" style="padding:18px 16px 0;color:${EMAIL_COLORS.surfaceSubtle};font-size:10px;line-height:1.5">
              Steam Radar · Kaynak: Valve Steamworks dokümantasyonu. Bot salt okunur çalışır.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const deadlineText =
    deadlines.length > 0
      ? deadlines
          .map(
            ({ deadline, event, daysLeft }) => {
              const copy = deadlineCopy(deadline);
              return `- ${event.name} · ${copy.category}: ${copy.title}\n  ${countdown(daysLeft)} (${localDate(deadline.dueAt, true)})\n  ${copy.description}\n  ${deadline.sourceUrl}`;
            },
          )
          .join("\n")
      : "- Yaklaşan bilinen bir son tarih yok.";

  const eventText = events
    .map((event) => {
      const actionUrl = event.registrationUrl || event.detailsUrl || event.sourceUrl;
      const tasks = buildEventTasks(event);
      return `- ${event.name} · ${kindLabels[event.kind]} · ${localDate(event.startAt)} · ${tasks.length} görev\n  ${actionUrl}`;
    })
    .join("\n");

  const changesText =
    recentChanges.length > 0
      ? `SON 24 SAATTE DEĞİŞENLER
${recentChanges
  .map((record) => {
    const values = changeValues(record);
    return `- ${localDate(record.detectedAt, true)} · ${record.eventName} · ${changeKindLabels[record.kind]}${values ? ` · ${values}` : ""}`;
  })
  .join("\n")}

`
      : "";

  const text = `STEAM ETKİNLİK TAKİBİ
${model.generated.setLocale("tr").toFormat("d LLLL yyyy, HH:mm")} · İstanbul saati

${changesText}HIZLI ÖZET
- 7 gün içindeki son tarihler: ${dueThisWeek}
- 30 gün içindeki son tarihler: ${dueThisMonth}
- Önümüzdeki ${config.emailLookaheadDays} gündeki etkinlikler: ${events.length}

ÖNCELİKLİ SON TARİHLER
${deadlineText}

YAKLAŞAN ETKİNLİKLER
${eventText}

CANLI PANEL
${config.dashboardUrl}

Kaynak: Valve Steamworks dokümantasyonu. Bot salt okunur çalışır.
`;

  return { subject, html, text };
}

async function writePreviews(html: string, text: string): Promise<void> {
  await mkdir(paths.outDir, { recursive: true });
  await Promise.all([
    writeFile(paths.emailPreview, html, "utf8"),
    writeFile(paths.emailTextPreview, text, "utf8"),
  ]);
}

function emailAddresses(value?: string): string[] {
  return String(value || "")
    .split(",")
    .map((address) => address.trim())
    .filter(Boolean);
}

interface EmailDeliverySettings {
  to: string[];
  bcc: string[];
  enabled: boolean;
  sendTime: string;
  timezone: string;
  senderName?: string;
  subjectTemplate?: string;
  lastSentDate?: string;
  managed: boolean;
}

function normalizeManagedAddresses(value: unknown): string[] {
  return Array.isArray(value)
    ? [
        ...new Set(
          value
            .map((item) => String(item).trim())
            .filter(Boolean),
        ),
      ]
    : [];
}

function managedDelivery(
  to: unknown,
  bcc: unknown,
  settings: {
    enabled?: unknown;
    sendTime?: unknown;
    timezone?: unknown;
    senderName?: unknown;
    subjectTemplate?: unknown;
    lastSentDate?: unknown;
  } | undefined,
  fallback: EmailDeliverySettings,
): EmailDeliverySettings {
  const sendTime = String(settings?.sendTime || "");
  return {
    to: normalizeManagedAddresses(to),
    bcc: normalizeManagedAddresses(bcc),
    enabled: settings?.enabled !== 0 && settings?.enabled !== false,
    sendTime: /^(?:[01]\d|2[0-3]):(?:00|30)$/.test(sendTime)
      ? sendTime
      : fallback.sendTime,
    timezone:
      settings?.timezone === "Europe/Istanbul"
        ? "Europe/Istanbul"
        : fallback.timezone,
    senderName:
      String(settings?.senderName || "").trim() || fallback.senderName,
    subjectTemplate: String(settings?.subjectTemplate || "").trim(),
    lastSentDate: /^\d{4}-\d{2}-\d{2}$/.test(
      String(settings?.lastSentDate || ""),
    )
      ? String(settings?.lastSentDate)
      : undefined,
    managed: true,
  };
}

async function queryEmailD1(
  sql: string,
  params: unknown[] = [],
): Promise<Record<string, unknown>[]> {
  const { d1AccountId, d1ApiToken, d1DatabaseId } = config.email;
  if (!d1AccountId || !d1ApiToken || !d1DatabaseId) {
    throw new Error("Cloudflare D1 e-posta bağlantısı eksik yapılandırılmış.");
  }
  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(d1AccountId)}/d1/database/${encodeURIComponent(d1DatabaseId)}/query`,
    {
      method: "POST",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${d1ApiToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ sql, params }),
    },
  );
  const body = (await response.json().catch(() => ({}))) as {
    success?: boolean;
    errors?: Array<{ message?: string }>;
    result?: Array<{
      success?: boolean;
      results?: Record<string, unknown>[];
    }>;
  };
  const query = body.result?.[0];
  if (
    !response.ok ||
    body.success !== true ||
    !query ||
    query.success !== true
  ) {
    const message = body.errors?.map((item) => item.message).filter(Boolean).join("; ");
    throw new Error(
      `Cloudflare D1 e-posta ayarları okunamadı${message ? `: ${message}` : "."}`,
    );
  }
  return Array.isArray(query?.results) ? query.results : [];
}

export async function resolvedEmailDelivery(): Promise<EmailDeliverySettings> {
  const fallback: EmailDeliverySettings = {
    to: emailAddresses(config.email.to),
    bcc: emailAddresses(config.email.bcc),
    enabled: true,
    sendTime: config.email.sendTime,
    timezone: config.timezone,
    senderName: "Steam Radar",
    managed: false,
  };

  const d1Values = [
    config.email.d1AccountId,
    config.email.d1ApiToken,
    config.email.d1DatabaseId,
  ];
  if (d1Values.some(Boolean)) {
    if (!d1Values.every(Boolean)) {
      throw new Error("Cloudflare D1 e-posta bağlantısı eksik yapılandırılmış.");
    }
    const [recipientRows, settingRows] = await Promise.all([
      queryEmailD1(
        `SELECT email, recipient_type AS recipientType
         FROM email_delivery_recipients
         WHERE enabled = 1
         ORDER BY recipient_type DESC, email`,
      ),
      queryEmailD1(
        `SELECT enabled, send_time AS sendTime, timezone,
                sender_name AS senderName,
                subject_template AS subjectTemplate,
                last_sent_date AS lastSentDate
         FROM email_delivery_settings
         WHERE id = 1`,
      ),
    ]);
    if (settingRows.length !== 1) {
      throw new Error(
        "Cloudflare D1 e-posta gönderim ayarı bulunamadı.",
      );
    }
    return managedDelivery(
      recipientRows
        .filter((item) => item.recipientType === "to")
        .map((item) => item.email),
      recipientRows
        .filter((item) => item.recipientType !== "to")
        .map((item) => item.email),
      settingRows[0],
      fallback,
    );
  }

  const apiValues = [
    config.email.recipientApiUrl,
    config.email.recipientApiSecret,
  ];
  if (!apiValues.some(Boolean)) {
    return fallback;
  }
  if (!apiValues.every(Boolean)) {
    throw new Error("Merkezi e-posta API bağlantısı eksik yapılandırılmış.");
  }
  const response = await fetch(config.email.recipientApiUrl as string, {
    headers: {
      accept: "application/json",
      authorization: `Bearer ${config.email.recipientApiSecret}`,
    },
  });
  if (!response.ok) {
    throw new Error(
      `Yönetim paneli e-posta ayarları alınamadı (HTTP ${response.status}).`,
    );
  }
  const body = (await response.json()) as {
    to?: unknown;
    bcc?: unknown;
    settings?: Parameters<typeof managedDelivery>[2];
  };
  return managedDelivery(body.to, body.bcc, body.settings, fallback);
}

async function markManagedDigestSent(localDateKey: string): Promise<void> {
  if (
    config.email.d1AccountId &&
    config.email.d1ApiToken &&
    config.email.d1DatabaseId
  ) {
    await queryEmailD1(
      `UPDATE email_delivery_settings
       SET last_sent_date = ?, updated_at = ?
       WHERE id = 1`,
      [localDateKey, new Date().toISOString()],
    );
    return;
  }
  if (
    !config.email.recipientApiUrl ||
    !config.email.recipientApiSecret
  ) {
    return;
  }
  const response = await fetch(config.email.recipientApiUrl, {
    method: "POST",
    headers: {
      accept: "application/json",
      authorization: `Bearer ${config.email.recipientApiSecret}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ sentDate: localDateKey }),
  });
  if (!response.ok) {
    throw new Error("Merkezi e-posta gönderim durumu kaydedilemedi.");
  }
}

async function sendWithResend(
  from: string,
  subject: string,
  html: string,
  text: string,
  localDateKey: string,
  to: string[],
  bcc: string[],
): Promise<string> {
  const recipientHash = createHash("sha1")
    .update(to.join(","))
    .digest("hex")
    .slice(0, 12);
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${config.email.resendApiKey}`,
      "content-type": "application/json",
      "idempotency-key": `steam-etkinlik-radari-${localDateKey}-${recipientHash}`,
    },
    body: JSON.stringify({
      from,
      to,
      bcc: bcc.length > 0 ? bcc : undefined,
      subject,
      html,
      text,
    }),
  });

  const body = (await response.json()) as { id?: string; message?: string };
  if (!response.ok || !body.id) {
    throw new Error(`Resend gönderimi başarısız: ${body.message || response.status}`);
  }
  return body.id;
}

async function sendWithSmtp(
  from: string,
  subject: string,
  html: string,
  text: string,
  to: string[],
  bcc: string[],
): Promise<string> {
  const transporter = nodemailer.createTransport({
    host: config.email.smtpHost,
    port: config.email.smtpPort,
    secure: config.email.smtpSecure,
    auth:
      config.email.smtpUser && config.email.smtpPass
        ? {
            user: config.email.smtpUser,
            pass: config.email.smtpPass,
          }
        : undefined,
  });
  const result = await transporter.sendMail({
    from,
    to,
    bcc,
    subject,
    html,
    text,
  });
  return result.messageId;
}

export async function sendDigest(
  snapshot: EventSnapshot,
  options: { force?: boolean; previewOnly?: boolean } = {},
): Promise<DigestResult> {
  const delivery = await resolvedEmailDelivery();
  const rendered = renderDigest(
    snapshot,
    await readChangelog(paths.changelog),
    delivery.subjectTemplate,
  );
  await writePreviews(rendered.html, rendered.text);

  if (options.previewOnly) {
    return {
      sent: false,
      skippedReason: "Önizleme modu; gönderim yapılmadı.",
      htmlPreview: paths.emailPreview,
      textPreview: paths.emailTextPreview,
    };
  }

  const localNow = DateTime.now().setZone(delivery.timezone);
  const localDateKey = localNow.toISODate();
  if (!localDateKey) throw new Error("Yerel tarih üretilemedi.");

  if (!options.force && !delivery.enabled) {
    return {
      sent: false,
      skippedReason: "Günlük e-posta yönetim panelinden duraklatılmış.",
      htmlPreview: paths.emailPreview,
      textPreview: paths.emailTextPreview,
    };
  }

  const state = await readNotificationState(paths.notificationState);
  const alreadySent = delivery.managed
    ? delivery.lastSentDate === localDateKey
    : state.lastDigestDate === localDateKey;
  if (!options.force && alreadySent) {
    return {
      sent: false,
      skippedReason: "Bugünün özeti daha önce gönderildi.",
      htmlPreview: paths.emailPreview,
      textPreview: paths.emailTextPreview,
    };
  }

  if (!options.force) {
    const [scheduledHour, scheduledMinute] = delivery.sendTime
      .split(":")
      .map(Number);
    const scheduledMinutes = scheduledHour * 60 + scheduledMinute;
    const currentMinutes = localNow.hour * 60 + localNow.minute;
    const due = delivery.managed
      ? currentMinutes >= scheduledMinutes
      : Math.floor(currentMinutes / 30) * 30 === scheduledMinutes;
    if (!due) {
      return {
        sent: false,
        skippedReason: `Planlanan gönderim saati bekleniyor: ${delivery.sendTime} (${delivery.timezone}).`,
        htmlPreview: paths.emailPreview,
        textPreview: paths.emailTextPreview,
      };
    }
  }

  if (delivery.to.length === 0) {
    throw new Error(
      "Günlük e-posta aktif ancak yönetim panelinde ana alıcı (To) tanımlı değil.",
    );
  }
  if (!config.email.from) {
    throw new Error("EMAIL_FROM ayarı eksik.");
  }

  let provider: DigestResult["provider"];
  let messageId: string;
  const senderAddress =
    config.email.from?.match(/<([^>]+)>/)?.[1] || config.email.from || "";
  const from = delivery.senderName
    ? `${delivery.senderName} <${senderAddress}>`
    : config.email.from || "";
  if (config.email.resendApiKey) {
    provider = "resend";
    messageId = await sendWithResend(
      from,
      rendered.subject,
      rendered.html,
      rendered.text,
      localDateKey,
      delivery.to,
      delivery.bcc,
    );
  } else if (
    config.email.smtpHost &&
    config.email.smtpUser &&
    config.email.smtpPass
  ) {
    provider = "smtp";
    messageId = await sendWithSmtp(
      from,
      rendered.subject,
      rendered.html,
      rendered.text,
      delivery.to,
      delivery.bcc,
    );
  } else if (config.email.smtpHost) {
    return {
      sent: false,
      skippedReason: "SMTP_USER veya SMTP_PASS ayarlı değil.",
      htmlPreview: paths.emailPreview,
      textPreview: paths.emailTextPreview,
    };
  } else {
    return {
      sent: false,
      skippedReason: "RESEND_API_KEY veya SMTP_HOST ayarlı değil.",
      htmlPreview: paths.emailPreview,
      textPreview: paths.emailTextPreview,
    };
  }

  await markDigestSent(paths.notificationState, localDateKey);
  if (delivery.managed) await markManagedDigestSent(localDateKey);
  return {
    sent: true,
    provider,
    messageId,
    htmlPreview: paths.emailPreview,
    textPreview: paths.emailTextPreview,
  };
}
