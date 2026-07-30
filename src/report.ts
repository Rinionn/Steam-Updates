import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { DateTime } from "luxon";
import { readChangelog } from "./changelog.js";
import { config, paths } from "./config.js";
import { deadlineCopy } from "./deadline-copy.js";
import { buildEventTasks, type EventTask } from "./event-tasks.js";
import { createCalendarIcs, createEventIcs } from "./ics.js";
import { renderTimeline } from "./timeline.js";
import type {
  ChangeKind,
  ChangeRecord,
  EventSnapshot,
  SteamEvent,
} from "./types.js";
import { escapeHtml, stableId } from "./utils.js";
import { createReportModel, type DeadlineView } from "./view-model.js";

const kindLabels: Record<SteamEvent["kind"], string> = {
  seasonal_sale: "Sezon İndirimi",
  themed_fest: "Temalı Festival",
  next_fest: "Next Fest",
};

const kindIcons: Record<SteamEvent["kind"], string> = {
  seasonal_sale: "％",
  themed_fest: "✦",
  next_fest: "▶",
};

const changeKindLabels: Record<ChangeKind, string> = {
  added: "Etkinlik eklendi",
  removed: "Etkinlik kaldırıldı",
  date_shifted: "Tarih değişti",
  deadline_changed: "Son tarih değişti",
  renamed: "Adı değişti",
};
const changeKindLabelsEn: Record<ChangeKind, string> = {
  added: "Event added",
  removed: "Event removed",
  date_shifted: "Date changed",
  deadline_changed: "Deadline changed",
  renamed: "Name changed",
};

function localDate(isoDate: string, withTime = false): string {
  const date = DateTime.fromISO(isoDate, { zone: "utc" })
    .setZone(config.timezone)
    .setLocale("tr");
  return date.toFormat(withTime ? "d LLLL yyyy, HH:mm" : "d LLL yyyy");
}

function localDateEn(isoDate: string, withTime = false): string {
  return DateTime.fromISO(isoDate, { zone: "utc" })
    .setZone(config.timezone)
    .setLocale("en")
    .toFormat(withTime ? "d LLLL yyyy, HH:mm" : "d LLL yyyy");
}

function localizedText(tr: string, en: string): string {
  return `<span data-copy-tr="${escapeHtml(tr)}" data-copy-en="${escapeHtml(en)}">${escapeHtml(tr)}</span>`;
}

function urgencyText(daysLeft: number): string {
  if (daysLeft < 0) return "Süre geçti";
  if (daysLeft === 0) return "Bugün";
  if (daysLeft === 1) return "Yarın";
  return `${daysLeft} gün kaldı`;
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

function changeRow(record: ChangeRecord): string {
  const before = record.before
    ? escapeHtml(changeValue(record, record.before))
    : "";
  const after = record.after
    ? escapeHtml(changeValue(record, record.after))
    : "";
  const values =
    before && after
      ? `${before} <span aria-hidden="true">→</span> ${after}`
      : after
        ? `${localizedText("Yeni:", "New:")} ${after}`
        : before
          ? `${localizedText("Önceki:", "Previous:")} ${before}`
          : "";
  return `
    <div class="change-row">
      <time datetime="${escapeHtml(record.detectedAt)}">${localizedText(
        localDate(record.detectedAt, true),
        localDateEn(record.detectedAt, true),
      )}</time>
      <strong>${escapeHtml(record.eventName)}</strong>
      <span class="change-type">${localizedText(
        changeKindLabels[record.kind],
        changeKindLabelsEn[record.kind],
      )}</span>
      ${values ? `<span class="change-values">${values}</span>` : ""}
    </div>`;
}

function deadlineTimelineItem(item: DeadlineView): string {
  const { deadline, event, daysLeft } = item;
  const copy = deadlineCopy(deadline);
  return `
    <div class="timeline-item ${daysLeft <= 3 ? "critical" : ""}">
      <div class="timeline-date">
        <strong>${localizedText(localDate(deadline.dueAt, true), localDateEn(deadline.dueAt, true))}</strong>
        <span class="countdown" data-days-left="${daysLeft}">${escapeHtml(urgencyText(daysLeft))}</span>
      </div>
      <div class="timeline-body">
        <span class="pill">${localizedText(copy.category, copy.categoryEn)}</span>
        <h4>${localizedText(copy.title, copy.titleEn)}</h4>
        <p>${localizedText(copy.description, copy.descriptionEn)}</p>
      </div>
      <a
        class="timeline-source"
        href="${escapeHtml(deadline.sourceUrl)}"
        target="_blank"
        rel="noreferrer"
        aria-label="${escapeHtml(`${event.name} için kaynak sayfasını aç (yeni sekme)`)}"
        data-copy-aria-tr="${escapeHtml(`${event.name} için kaynak sayfasını aç (yeni sekme)`)}"
        data-copy-aria-en="${escapeHtml(`Open the source page for ${event.name} (new tab)`)}"
      ><span data-i18n="source">Kaynak</span> <span aria-hidden="true">↗</span></a>
    </div>`;
}

function deadlineTimelineGroup(
  event: SteamEvent,
  items: DeadlineView[],
): string {
  return `
    <article class="deadline-group">
      <div class="deadline-group-head">
        <div>
          <span class="event-kind ${event.kind}">${escapeHtml(kindLabels[event.kind])}</span>
          <h3>${escapeHtml(event.name)}</h3>
        </div>
        <span>${localizedText(
          `${localDate(event.startAt)} – ${localDate(event.endAt)}`,
          `${localDateEn(event.startAt)} – ${localDateEn(event.endAt)}`,
        )}</span>
      </div>
      <div class="timeline">${items.map(deadlineTimelineItem).join("")}</div>
    </article>`;
}

function taskMigrationAliases(
  event: SteamEvent,
  task: EventTask,
  changelog: ChangeRecord[],
): string[] {
  const aliases = new Set(task.legacyIds);
  if (!task.dueAt) return [...aliases];

  for (const record of changelog) {
    if (
      record.eventId !== event.id ||
      record.kind !== "deadline_changed" ||
      record.after !== task.dueAt ||
      !record.field?.startsWith("deadlines.") ||
      !record.field.endsWith(".dueAt")
    ) {
      continue;
    }
    const previousDeadlineId = record.field.slice(
      "deadlines.".length,
      -".dueAt".length,
    );
    if (previousDeadlineId) {
      aliases.add(stableId(event.id, "task", previousDeadlineId));
    }
  }

  aliases.delete(task.id);
  return [...aliases];
}

function eventRow(
  event: SteamEvent,
  generatedAt: string,
  changelog: ChangeRecord[],
  openTasks = false,
): string {
  const tasks = buildEventTasks(event);
  const search = `${event.name} ${kindLabels[event.kind]} ${event.description || ""} ${event.descriptionTr || ""}`.toLocaleLowerCase(
    "tr",
  );
  const generatedAtMillis = DateTime.fromISO(generatedAt).toMillis();
  const registrationOpen = event.deadlines.some(
    (deadline) =>
      deadlineCopy(deadline).category === "Başvuru" &&
      DateTime.fromISO(deadline.dueAt).toMillis() >= generatedAtMillis,
  );
  const descriptionEn = event.description || event.descriptionTr || "";
  const descriptionTr = event.descriptionTr || descriptionEn;
  const actionUrl = event.registrationUrl || event.detailsUrl || event.sourceUrl;
  const calendarPayload = JSON.stringify({
    filename: `${event.id}.ics`,
    content: createEventIcs(event, generatedAt),
  });
  return `
    <article
      id="etkinlik-${escapeHtml(event.id)}"
      class="event-row"
      data-kind="${event.kind}"
      data-search="${escapeHtml(search)}"
      data-match-tags="${escapeHtml(JSON.stringify(event.matchTags || []))}"
      data-game-match="false"
      data-registration-open="${registrationOpen}"
      data-has-tasks="${tasks.length > 0}"
    >
      <div class="event-date">
        <strong>${localizedText(localDate(event.startAt), localDateEn(event.startAt))}</strong>
        <span>${localizedText(localDate(event.endAt), localDateEn(event.endAt))}</span>
      </div>
      <div class="event-main">
        <div class="event-heading">
          <span class="event-kind ${event.kind}"><span aria-hidden="true">${kindIcons[event.kind]}</span> <span data-i18n="${event.kind === "themed_fest" ? "themedFestival" : event.kind === "next_fest" ? "nextFest" : "seasonalSale"}">${escapeHtml(kindLabels[event.kind])}</span></span>
          <h3>${escapeHtml(event.name)}</h3>
        </div>
        ${
          descriptionEn
            ? `<p
                lang="tr"
                data-event-description
                data-description-tr="${escapeHtml(descriptionTr)}"
                data-description-en="${escapeHtml(descriptionEn)}"
              >${escapeHtml(descriptionTr)}</p>`
            : ""
        }
        ${
          event.deadlines.length > 0
            ? `<div class="mini-deadlines">${event.deadlines
                .slice(0, 3)
                .map(
                  (deadline) =>
                    `<span>⏱ ${localizedText(
                      localDate(deadline.dueAt),
                      localDateEn(deadline.dueAt),
                    )} · ${localizedText(
                      deadlineCopy(deadline).category,
                      deadlineCopy(deadline).categoryEn,
                    )}</span>`,
                )
                .join("")}</div>`
            : ""
        }
        <div class="game-match-result" data-game-match-result hidden></div>
        <div class="game-match-warning" data-game-match-warning role="status" hidden></div>
      </div>
      <div class="event-actions">
        <a
          class="event-action"
          href="${escapeHtml(actionUrl)}"
          target="_blank"
          rel="noreferrer"
          aria-label="${escapeHtml(`${event.name} için ${event.registrationUrl ? "kayıt sayfasını" : "detayları"} aç (yeni sekme)`)}"
          data-copy-aria-tr="${escapeHtml(`${event.name} için ${event.registrationUrl ? "kayıt sayfasını" : "detayları"} aç (yeni sekme)`)}"
          data-copy-aria-en="${escapeHtml(`Open ${event.registrationUrl ? "the registration page" : "details"} for ${event.name} (new tab)`)}"
        >
          <span data-i18n="${event.registrationUrl ? "registrationPage" : "details"}">${event.registrationUrl ? "Kayıt sayfası" : "Detaylar"}</span> <span aria-hidden="true">↗</span>
        </a>
        <button
          class="event-ics"
          type="button"
          data-ics="${escapeHtml(calendarPayload)}"
          aria-label="${escapeHtml(`${event.name} etkinliğini ICS olarak indir`)}"
          data-copy-aria-tr="${escapeHtml(`${event.name} etkinliğini ICS olarak indir`)}"
          data-copy-aria-en="${escapeHtml(`Download ${event.name} as an ICS event`)}"
        ><span data-i18n="addToCalendar">Takvime ekle</span> <span aria-hidden="true">↓</span></button>
      </div>
      ${applicationWorkflow(event)}
      ${
        tasks.length
          ? eventTaskDetails(event, tasks, changelog, openTasks)
          : ""
      }
    </article>`;
}

function eventTaskItem(task: EventTask, aliases: string[]): string {
  const due = task.dueAt
    ? `<time>${localizedText(localDate(task.dueAt, true), localDateEn(task.dueAt, true))}</time>`
    : "";
  const levelEn =
    task.level === "Gerekli"
      ? "Required"
      : task.level === "İsteğe bağlı"
        ? "Optional"
        : "Recommended";
  return `
    <div class="task-item">
      <input
        type="checkbox"
        id="${escapeHtml(task.id)}"
        data-task-id="${escapeHtml(task.id)}"
        data-task-aliases="${escapeHtml(JSON.stringify(aliases))}"
      >
      <label for="${escapeHtml(task.id)}">
        <span class="task-title">
          <strong>${localizedText(task.title, task.titleEn)}</strong>
          <span class="task-level ${task.level === "Gerekli" ? "required" : ""}">${localizedText(task.level, levelEn)}</span>
          ${due}
        </span>
        <span class="task-description">${localizedText(task.description, task.descriptionEn)}</span>
      </label>
      <a
        href="${escapeHtml(task.href)}"
        target="_blank"
        rel="noreferrer"
        aria-label="${escapeHtml(`${task.title} görev bağlantısını aç (yeni sekme)`)}"
        data-copy-aria-tr="${escapeHtml(`${task.title} görev bağlantısını aç (yeni sekme)`)}"
        data-copy-aria-en="${escapeHtml(`Open the ${task.titleEn} task link (new tab)`)}"
      ><span data-i18n="open">Aç</span> <span aria-hidden="true">↗</span></a>
    </div>`;
}

function eventTaskDetails(
  event: SteamEvent,
  tasks: EventTask[],
  changelog: ChangeRecord[],
  openTasks: boolean,
): string {
  return `
    <details class="event-tasks" data-event-tasks="${escapeHtml(event.id)}"${openTasks ? " open" : ""}>
      <summary>
        <span data-i18n="tasks">Görevler</span>
        <span class="task-progress" data-task-progress aria-live="polite" data-task-total="${tasks.length}">0/${tasks.length} tamamlandı</span>
      </summary>
      <div class="task-list">${tasks
        .map((task) =>
          eventTaskItem(
            task,
            taskMigrationAliases(event, task, changelog),
          ),
        )
        .join("")}</div>
    </details>`;
}

function applicationWorkflow(event: SteamEvent): string {
  return `
    <details class="application-workflow" data-application-workflow data-event-id="${escapeHtml(event.id)}">
      <summary>
        <span>${localizedText("Başvuru takibi", "Application tracking")}</span>
        <span class="application-summary" data-application-summary>${localizedText("Durum girilmedi", "No status")}</span>
      </summary>
      <div class="application-form">
        <label>
          ${localizedText("Oyun", "Game")}
          <select data-application-game></select>
        </label>
        <label>
          ${localizedText("Durum", "Status")}
          <select data-application-status>
            <option value="not_started">${localizedText("Başlanmadı", "Not started")}</option>
            <option value="preparing">${localizedText("Hazırlanıyor", "Preparing")}</option>
            <option value="submitted">${localizedText("Gönderildi", "Submitted")}</option>
            <option value="accepted">${localizedText("Kabul edildi", "Accepted")}</option>
            <option value="rejected">${localizedText("Reddedildi", "Rejected")}</option>
            <option value="not_applicable">${localizedText("Uygun değil", "Not applicable")}</option>
          </select>
        </label>
        <label>
          ${localizedText("Sorumlu", "Owner")}
          <input type="text" data-application-owner maxlength="80" placeholder="Batuhan / Yayın Ekibi">
        </label>
        <label class="application-note">
          ${localizedText("Not", "Note")}
          <textarea data-application-note maxlength="800" rows="2"></textarea>
        </label>
        <div class="application-actions">
          <button type="button" data-application-save>${localizedText("Başvuruyu kaydet", "Save application")}</button>
          <span data-application-message role="status" aria-live="polite"></span>
        </div>
      </div>
    </details>`;
}

export function renderReport(
  snapshot: EventSnapshot,
  changelog: ChangeRecord[] = [],
): string {
  const model = createReportModel(snapshot, config);
  const changeCutoff = model.generated.minus({ days: 90 }).toMillis();
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
  const featuredDeadlines = model.deadlines.slice(0, 8);
  const groupedDeadlines = new Map<
    string,
    { event: SteamEvent; items: DeadlineView[] }
  >();
  for (const item of featuredDeadlines) {
    const group = groupedDeadlines.get(item.event.id);
    if (group) group.items.push(item);
    else {
      groupedDeadlines.set(item.event.id, {
        event: item.event,
        items: [item],
      });
    }
  }
  const html = `<!doctype html>
<html lang="tr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light dark">
  <title>Steam Etkinlik Radarı</title>
  <style>
    :root {
      color-scheme: light;
      --color-background: #f7f3fa;
      --color-ink: #281a32;
      --color-muted: #6d6076;
      --color-panel: #ffffff;
      --color-panel-subtle: #fbf8fc;
      --color-line: #ded5e4;
      --color-control: #ffffff;
      --color-control-text: #4e3e59;
      --color-accent-pink: #ff3e96;
      --color-accent-purple: #b02bf2;
      --color-accent-purple-mid: #d631ce;
      --color-accent-pink-deep: #d52bb6;
      --color-amber: #f6b94a;
      --color-amber-text: #815100;
      --color-danger: #ad124c;
      --color-link: #71218f;
      --color-action-purple: #6f1688;
      --color-action-magenta: #871e82;
      --color-action-pink: #a51656;
      --color-action-pink-deep: #8d174a;
      --color-transparent: transparent;
      --color-on-accent: #ffffff;
      --color-on-amber: #2b1600;
      --color-hero-copy: #c8bdd4;
      --color-hero-muted: #aaa0b9;
      --color-hero-start: rgba(24, 11, 40, .98);
      --color-hero-end: rgba(9, 5, 18, .96);
      --color-hero-line: rgba(255, 255, 255, .12);
      --color-hero-card: rgba(255, 255, 255, .05);
      --color-background-glow-purple: rgba(176, 43, 242, .12);
      --color-background-glow-pink: rgba(255, 62, 150, .08);
      --color-hero-glow: rgba(255, 62, 150, .18);
      --color-shadow: rgba(37, 12, 55, .16);
      --color-shadow-glow: rgba(176, 43, 242, .08);
      --color-soft: rgba(40, 26, 50, .06);
      --color-soft-text: #594b63;
      --color-task-panel: rgba(176, 43, 242, .045);
      --color-task-text: #5f5168;
      --color-level: #685b72;
      --color-footer: #75677e;
      --gradient-brand: linear-gradient(90deg, var(--color-action-purple), var(--color-action-pink));
      --gradient-festival: linear-gradient(90deg, var(--color-action-purple), var(--color-action-magenta));
      --gradient-seasonal: linear-gradient(90deg, var(--color-action-pink-deep), var(--color-action-pink));
    }
    @media (prefers-color-scheme: dark) {
      :root {
        color-scheme: dark;
        --color-background: #090512;
        --color-ink: #ffffff;
        --color-muted: #aaa0b9;
        --color-panel: rgba(19, 10, 31, .94);
        --color-panel-subtle: rgba(255, 255, 255, .025);
        --color-line: rgba(255, 255, 255, .11);
        --color-control: #140c20;
        --color-control-text: #d2c8db;
        --color-amber-text: #f6b94a;
        --color-danger: #ff7ca7;
        --color-link: #dc9aff;
        --color-background-glow-purple: rgba(176, 43, 242, .24);
        --color-background-glow-pink: rgba(255, 62, 150, .16);
        --color-shadow: rgba(0, 0, 0, .42);
        --color-soft: rgba(255, 255, 255, .055);
        --color-soft-text: #d2d9e0;
        --color-task-panel: rgba(4, 9, 14, .22);
        --color-task-text: #d6dee6;
        --color-level: #aab7c4;
        --color-footer: #81758f;
      }
    }
    * { box-sizing: border-box; }
    html { overflow-x: hidden; }
    body {
      margin: 0;
      min-height: 100vh;
      overflow-x: hidden;
      color: var(--color-ink);
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
      background:
        radial-gradient(circle at 12% 3%, var(--color-background-glow-purple), var(--color-transparent) 34rem),
        radial-gradient(circle at 88% 18%, var(--color-background-glow-pink), var(--color-transparent) 30rem),
        var(--color-background);
    }
    a { color: inherit; }
    a, button, input, select, summary { -webkit-tap-highlight-color: var(--color-transparent); }
    a:focus-visible,
    button:focus-visible,
    input:focus-visible,
    select:focus-visible,
    summary:focus-visible {
      outline: 3px solid var(--color-accent-pink);
      outline-offset: 3px;
    }
    .sr-only {
      position: absolute;
      width: 1px;
      height: 1px;
      padding: 0;
      margin: -1px;
      overflow: hidden;
      clip: rect(0, 0, 0, 0);
      white-space: nowrap;
      border: 0;
    }
    .shell { width: min(calc(100% - 20px), 1180px); margin: 0 auto; padding: 20px 0 56px; }
    .hero {
      position: relative;
      overflow: hidden;
      padding: 24px;
      color: var(--color-on-accent);
      border: 1px solid var(--color-hero-line);
      border-radius: 26px;
      background:
        radial-gradient(circle at 88% 12%, var(--color-hero-glow), var(--color-transparent) 22rem),
        linear-gradient(135deg, var(--color-hero-start), var(--color-hero-end));
      box-shadow: 0 24px 80px var(--color-shadow), 0 0 56px var(--color-shadow-glow);
    }
    .language-switch { display:flex; width:max-content; max-width:100%; gap:5px; margin:0 0 14px auto; padding:4px; border:1px solid var(--color-hero-line); border-radius:999px; background:var(--color-hero-card); }
    .language-switch button { min-width:42px; min-height:34px; padding:6px 9px; color:var(--color-hero-copy); border-color:var(--color-transparent); background:var(--color-transparent); font-size:10px; font-weight:900; }
    .language-switch button.active { color:var(--color-on-accent); background:var(--gradient-brand); }
    .eyebrow { color: var(--color-accent-pink); font-weight: 800; letter-spacing: .14em; text-transform: uppercase; font-size: 12px; }
    h1 { margin: 12px 0 10px; overflow-wrap: anywhere; font-family: Montserrat, Inter, sans-serif; font-size: clamp(34px, 12vw, 70px); font-weight: 900; line-height: .98; letter-spacing: -.045em; text-transform: uppercase; }
    .hero p { max-width: 690px; color: var(--color-hero-copy); font-size: 16px; line-height: 1.65; margin: 0; }
    .event-timeline { margin-top:28px; overflow:hidden; border:1px solid var(--color-hero-line); border-radius:20px; background:var(--color-hero-card); }
    .timeline-status { display:flex; align-items:flex-start; justify-content:space-between; gap:10px; padding:13px 14px; border-bottom:1px solid var(--color-hero-line); color:var(--color-hero-copy); font-size:11px; }
    .timeline-status time { flex:0 1 42%; font-weight:800; }
    .timeline-critical { flex:0 1 58%; color:var(--color-hero-muted); text-align:right; }
    .timeline-critical strong { color:var(--color-on-accent); }
    .timeline-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); }
    .timeline-month { min-width:0; padding:13px 10px 14px; border-right:1px solid var(--color-hero-line); }
    .timeline-month:nth-child(2n) { border-right:0; }
    .timeline-month[hidden] { display:none; }
    .timeline-month h2 { margin:0 0 10px; color:var(--color-hero-copy); font-size:12px; letter-spacing:.02em; }
    .timeline-month-items { display:grid; gap:7px; }
    .timeline-chip { display:block; min-width:0; padding:8px; border-radius:10px; color:var(--color-on-accent); background:var(--gradient-festival); text-decoration:none; }
    .timeline-chip.seasonal_sale { color:var(--color-on-accent); background:var(--gradient-seasonal); }
    .timeline-chip.next_fest { color:var(--color-on-amber); background:var(--color-amber); }
    .timeline-chip.deadline { color:var(--color-on-accent); background:var(--color-danger); }
    .timeline-chip.game-match { box-shadow:inset 0 0 0 2px var(--color-accent-pink); }
    .timeline-game-match { margin-top:5px; color:inherit; font-size:9px; font-weight:900; text-transform:none; }
    .timeline-chip.tasks-complete { opacity:.52; filter:saturate(.45); }
    .timeline-chip.tasks-complete::after { content:attr(data-complete-label); display:block; margin-top:4px; font-size:9px; font-weight:800; }
    .timeline-chip span,.timeline-chip strong { display:block; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .timeline-chip span { font-size:9px; font-weight:800; letter-spacing:.03em; text-transform:uppercase; }
    .timeline-chip strong { margin-top:3px; font-size:11px; }
    .timeline-month-empty { color:var(--color-hero-muted); font-size:10px; line-height:1.4; }
    .timeline-controls { display:grid; grid-template-columns:auto minmax(0,1fr) auto; align-items:center; gap:8px; padding:10px; border-top:1px solid var(--color-hero-line); }
    .timeline-controls button { min-height:40px; padding:8px 10px; color:var(--color-on-accent); border-color:var(--color-hero-line); background:var(--color-hero-card); font-size:11px; }
    .timeline-controls button:disabled { cursor:not-allowed; opacity:.42; }
    .timeline-controls [data-timeline-range] { color:var(--color-hero-muted); font-size:10px; text-align:center; }
    .section { margin-top: 38px; }
    .section-title { display:flex; align-items:flex-start; flex-direction:column; justify-content:space-between; gap:8px; margin-bottom:15px; }
    .section-title h2 { margin:0; overflow-wrap:anywhere; font-size:26px; letter-spacing:-.025em; }
    .section-title p { margin:0; color:var(--color-muted); font-size:13px; }
    .operations-grid,.metric-grid { display:grid; grid-template-columns:1fr; gap:10px; }
    .operation-card,.metric-card,.admin-panel { padding:16px; border:1px solid var(--color-line); border-radius:16px; background:var(--color-panel); }
    .operation-card strong,.metric-card strong { display:block; font-size:22px; }
    .operation-card span,.metric-card span { display:block; margin-top:5px; color:var(--color-muted); font-size:12px; line-height:1.45; }
    .operation-card.critical { border-color:var(--color-danger); }
    .operation-inbox { display:grid; gap:8px; margin-top:12px; }
    .operation-item { display:flex; align-items:flex-start; justify-content:space-between; gap:12px; padding:10px 0; border-top:1px solid var(--color-line); font-size:12px; }
    .operation-item:first-child { border-top:0; }
    .operation-item a { color:var(--color-link); font-weight:800; text-decoration:none; }
    .application-workflow { grid-column:1; min-width:0; border:1px solid var(--color-line); border-radius:13px; background:var(--color-panel-subtle); }
    .application-workflow summary { display:flex; justify-content:space-between; gap:12px; padding:11px 13px; cursor:pointer; font-size:12px; font-weight:800; list-style:none; }
    .application-workflow summary::-webkit-details-marker { display:none; }
    .application-summary { color:var(--color-muted); font-weight:600; }
    .application-form { display:grid; grid-template-columns:1fr; gap:10px; padding:13px; border-top:1px solid var(--color-line); }
    .application-form label { display:grid; gap:5px; min-width:0; color:var(--color-muted); font-size:11px; font-weight:700; }
    .application-form select,.application-form input,.application-form textarea { width:100%; min-width:0; padding:9px 10px; border:1px solid var(--color-line); border-radius:9px; color:var(--color-ink); background:var(--color-control); font:inherit; }
    .application-note { grid-column:1 / -1; }
    .application-actions { display:flex; align-items:center; gap:10px; flex-wrap:wrap; grid-column:1 / -1; }
    .application-actions button { color:var(--color-on-accent); border-color:var(--color-transparent); background:var(--gradient-brand); font-size:11px; font-weight:800; }
    .application-actions span { color:var(--color-muted); font-size:11px; }
    .admin-panel { display:grid; gap:14px; }
    .admin-status { display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
    .sync-badge { padding:5px 9px; border-radius:999px; color:var(--color-muted); background:var(--color-soft); font-size:11px; font-weight:800; }
    .sync-badge.online { color:var(--color-link); }
    .notification-settings { display:grid; grid-template-columns:1fr; gap:8px; }
    .notification-settings label { display:flex; align-items:center; gap:8px; color:var(--color-muted); font-size:12px; }
    .games-panel { padding:18px 16px; border:1px solid var(--color-line); border-radius:20px; background:var(--color-panel); }
    .game-form { display:grid; grid-template-columns:1fr; gap:12px; }
    .game-field { display:grid; gap:6px; min-width:0; color:var(--color-muted); font-size:12px; font-weight:700; }
    .game-field input,.game-field select { min-width:0; width:100%; min-height:44px; padding:10px 12px; border:1px solid var(--color-line); border-radius:11px; color:var(--color-ink); background:var(--color-control); }
    .steam-game-search { position:relative; min-width:0; }
    .steam-game-results { position:absolute; top:calc(100% + 6px); left:0; right:0; z-index:20; max-height:310px; overflow-y:auto; padding:6px; border:1px solid var(--color-line); border-radius:13px; background:var(--color-panel); box-shadow:0 16px 42px var(--color-shadow); }
    .steam-game-results[hidden] { display:none; }
    .steam-game-option { display:grid; grid-template-columns:56px minmax(0,1fr); align-items:center; width:100%; min-height:58px; gap:10px; padding:7px; border:0; border-radius:9px; text-align:left; }
    .steam-game-option:hover,.steam-game-option:focus-visible { background:var(--color-soft); }
    .steam-game-option img { width:56px; height:32px; border-radius:6px; object-fit:cover; background:var(--color-soft); }
    .steam-game-option strong,.steam-game-option small { display:block; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .steam-game-option strong { color:var(--color-ink); font-size:12px; }
    .steam-game-option small { margin-top:3px; color:var(--color-muted); font-size:10px; }
    .steam-search-status { min-height:1.4em; margin-top:5px; color:var(--color-muted); font-size:10px; font-weight:500; }
    .game-field-wide { grid-column:1 / -1; }
    .game-form-actions { display:flex; align-items:center; flex-wrap:wrap; gap:8px; grid-column:1 / -1; }
    .game-form-actions button:first-child { color:var(--color-on-accent); border-color:var(--color-transparent); background:var(--gradient-brand); font-weight:800; }
    .game-help,.game-match-summary { margin:10px 0 0; color:var(--color-muted); font-size:12px; line-height:1.5; }
    .game-list { display:grid; gap:9px; margin-top:16px; }
    .game-profile { display:grid; grid-template-columns:72px minmax(0,1fr); gap:12px; padding:12px; border:1px solid var(--color-line); border-radius:13px; background:var(--color-panel-subtle); }
    .game-capsule { width:72px; aspect-ratio:2 / 3; object-fit:cover; border:1px solid var(--color-line); border-radius:9px; background:var(--color-soft); }
    .game-capsule-fallback { display:grid; place-items:center; width:72px; aspect-ratio:2 / 3; padding:7px; border:1px solid var(--color-line); border-radius:9px; color:var(--color-muted); background:var(--color-soft); font-size:9px; font-weight:800; text-align:center; overflow-wrap:anywhere; }
    .game-profile-body { min-width:0; }
    .game-profile strong,.game-profile small { display:block; overflow-wrap:anywhere; }
    .game-profile small { margin-top:4px; color:var(--color-muted); line-height:1.45; }
    .game-profile-actions { display:flex; align-items:flex-start; flex-wrap:wrap; gap:6px; margin-top:9px; }
    .game-profile-actions button { min-height:36px; padding:7px 10px; font-size:11px; }
    .game-profile-actions [data-game-delete] { color:var(--color-danger); }
    .game-match-result { display:grid; grid-template-columns:repeat(auto-fill,minmax(96px,1fr)); gap:8px; margin-top:12px; }
    .game-match-result[hidden],.game-match-warning[hidden] { display:none; }
    .game-match-card { display:grid; grid-template-columns:40px minmax(0,1fr); gap:7px; align-items:center; min-width:0; padding:7px; border:1px solid var(--color-line); border-radius:10px; color:var(--color-soft-text); background:var(--color-soft); }
    .game-match-card .game-capsule,.game-match-card .game-capsule-fallback { width:40px; border-radius:6px; }
    .game-match-card strong,.game-match-card small { display:block; min-width:0; overflow:hidden; text-overflow:ellipsis; }
    .game-match-card strong { font-size:10px; white-space:nowrap; }
    .game-match-card small { margin-top:3px; color:var(--color-muted); font-size:9px; line-height:1.3; }
    .next-fest-history { margin-top:8px; padding:8px; border-left:3px solid var(--color-amber); border-radius:7px; color:var(--color-muted); background:var(--color-soft); font-size:10px; line-height:1.4; }
    .next-fest-history a { color:var(--color-link); font-weight:800; }
    .game-match-badge { max-width:100%; padding:6px 9px; overflow-wrap:anywhere; border:1px solid var(--color-line); border-radius:999px; color:var(--color-link); background:var(--color-soft); font-size:11px; font-weight:800; }
    .game-match-warning { margin-top:10px; padding:9px 10px; overflow-wrap:anywhere; border:1px solid var(--color-danger); border-radius:10px; color:var(--color-danger); background:var(--color-soft); font-size:12px; line-height:1.45; }
    .deadline-groups { display:grid; gap:14px; }
    .deadline-group { overflow:hidden; border:1px solid var(--color-line); border-radius:20px; background:var(--color-panel); }
    .deadline-group-head { display:flex; align-items:flex-start; flex-direction:column; justify-content:space-between; gap:12px; padding:18px 16px; background:var(--color-panel-subtle); border-bottom:1px solid var(--color-line); }
    .deadline-group-head > div { display:flex; align-items:center; gap:10px; flex-wrap:wrap; }
    .deadline-group-head h3 { min-width:0; margin:0; overflow-wrap:anywhere; font-size:21px; }
    .deadline-group-head > span { color:var(--color-muted); font-size:13px; }
    .timeline { padding:0 16px; }
    .timeline-item { display:grid; grid-template-columns:1fr; gap:10px; align-items:center; padding:18px 0; border-bottom:1px solid var(--color-line); }
    .timeline-item:last-child { border-bottom:0; }
    .timeline-date strong,.timeline-date span { display:block; }
    .timeline-date strong { font-size:14px; }
    .timeline-date .countdown { margin-top:5px; }
    .timeline-body { min-width:0; }
    .timeline-body h4 { margin:8px 0 4px; overflow-wrap:anywhere; font-size:16px; }
    .timeline-body p { margin:0; overflow-wrap:anywhere; color:var(--color-muted); font-size:13px; line-height:1.45; }
    .timeline-source { justify-self:start; color:var(--color-link); text-decoration:none; font-size:12px; }
    .timeline-item.critical .countdown { color:var(--color-danger); }
    .event-heading,.toolbar { display:flex; align-items:center; gap:10px; }
    .pill,.event-kind { border-radius:999px; padding:5px 9px; font-size:11px; font-weight:800; letter-spacing:.05em; text-transform:uppercase; }
    .pill { color:var(--color-on-amber); background:var(--color-amber); }
    .countdown { color:var(--color-amber-text); font-weight:800; }
    .toolbar { margin-bottom:14px; flex-wrap:wrap; }
    .search {
      flex:1 1 100%; width:100%; min-width:0; padding:12px 14px; border:1px solid var(--color-line);
      border-radius:12px; color:var(--color-ink); background:var(--color-control); outline:none;
    }
    .filters,.status-filters { display:flex; width:100%; gap:8px; flex-wrap:wrap; }
    .games-only-filter { width:100%; }
    .task-state-toolbar { display:flex; align-items:flex-start; flex-direction:column; gap:8px; margin:-2px 0 14px; }
    .task-state-actions { display:flex; gap:7px; flex-wrap:wrap; }
    .task-state-actions button { min-height:40px; padding:8px 11px; font-size:11px; }
    .task-state-actions [data-task-reset] { color:var(--color-danger); }
    .task-state-status { min-height:1.4em; color:var(--color-muted); font-size:11px; }
    button { min-height:44px; border:1px solid var(--color-line); border-radius:999px; padding:10px 13px; color:var(--color-control-text); background:var(--color-control); cursor:pointer; }
    button.active { color:var(--color-on-accent); border-color:var(--color-transparent); background:var(--gradient-brand); font-weight:800; }
    .event-list { border:1px solid var(--color-line); border-radius:20px; overflow:hidden; background:var(--color-panel); }
    .event-row { display:grid; grid-template-columns:1fr; gap:12px; align-items:center; padding:18px 16px; border-bottom:1px solid var(--color-line); border-left:4px solid var(--color-action-magenta); }
    .event-row[data-kind="seasonal_sale"] { border-left-color:var(--color-action-pink); }
    .event-row[data-kind="next_fest"] { border-left-color:var(--color-amber); }
    .event-row:last-child { border-bottom:0; }
    .event-row[hidden] { display:none; }
    .event-row.tasks-complete { opacity:.58; }
    .event-row.timeline-highlight { animation:timeline-row-highlight 2s ease-out; }
    @keyframes timeline-row-highlight {
      0%,35% { background:var(--color-task-panel); box-shadow:inset 4px 0 var(--color-accent-pink); }
      100% { background:var(--color-transparent); box-shadow:inset 0 0 var(--color-transparent); }
    }
    .event-date strong,.event-date span { display:block; }
    .event-date strong { color:var(--color-ink); font-size:14px; }
    .event-date span { margin-top:4px; color:var(--color-muted); font-size:12px; }
    .event-main { min-width:0; }
    .event-heading { align-items:baseline; flex-wrap:wrap; }
    .event-heading h3 { min-width:0; margin:0; overflow-wrap:anywhere; font-size:19px; }
    .event-kind { color:var(--color-on-accent); background:var(--gradient-festival); }
    .event-kind.seasonal_sale { color:var(--color-on-accent); background:var(--gradient-seasonal); }
    .event-kind.next_fest { color:var(--color-on-amber); background:var(--color-amber); }
    .event-main p { margin:8px 0 0; overflow-wrap:anywhere; color:var(--color-muted); font-size:14px; line-height:1.45; }
    .mini-deadlines { display:flex; gap:8px; flex-wrap:wrap; margin-top:10px; }
    .mini-deadlines span { max-width:100%; padding:5px 8px; overflow-wrap:anywhere; border-radius:8px; color:var(--color-soft-text); background:var(--color-soft); font-size:11px; }
    .event-actions { display:flex; align-items:stretch; flex-wrap:wrap; gap:7px; justify-self:start; max-width:100%; }
    .event-action,.event-ics { max-width:100%; padding:10px 12px; overflow-wrap:anywhere; border:1px solid var(--color-line); border-radius:10px; color:var(--color-link); background:var(--color-transparent); text-decoration:none; font-size:13px; }
    .event-ics { min-height:0; cursor:pointer; }
    .event-tasks { grid-column:1; min-width:0; margin-top:-4px; border:1px solid var(--color-line); border-radius:13px; background:var(--color-task-panel); }
    .event-tasks summary { display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:12px; padding:11px 13px; color:var(--color-task-text); font-size:13px; font-weight:800; cursor:pointer; list-style:none; }
    .event-tasks summary::-webkit-details-marker { display:none; }
    .event-tasks summary::before { content:"＋"; color:var(--color-accent-pink); }
    .event-tasks[open] summary::before { content:"−"; }
    .event-tasks summary > span:first-of-type { margin-right:auto; }
    .task-progress { color:var(--color-muted); font-size:11px; font-weight:600; }
    .task-list { min-width:0; padding:0 13px 4px; border-top:1px solid var(--color-line); }
    .task-item { display:grid; grid-template-columns:auto minmax(0,1fr); gap:11px; align-items:start; padding:13px 0; border-bottom:1px solid var(--color-line); }
    .task-item:last-child { border-bottom:0; }
    .task-item input { width:17px; height:17px; margin:2px 0 0; accent-color:var(--color-accent-pink); }
    .task-item label { min-width:0; cursor:pointer; }
    .task-title { display:flex; align-items:center; gap:7px; flex-wrap:wrap; }
    .task-title strong { overflow-wrap:anywhere; font-size:13px; }
    .task-title time { color:var(--color-amber-text); font-size:11px; font-weight:700; }
    .task-level { padding:3px 6px; border-radius:999px; color:var(--color-level); background:var(--color-soft); font-size:9px; font-weight:800; letter-spacing:.04em; text-transform:uppercase; }
    .task-level.required { color:var(--color-on-amber); background:var(--color-amber); }
    .task-description { display:block; margin-top:4px; overflow-wrap:anywhere; color:var(--color-muted); font-size:12px; line-height:1.4; }
    .task-item > a { grid-column:2; justify-self:start; padding-top:2px; color:var(--color-link); text-decoration:none; font-size:11px; }
    .task-item:has(input:checked) label { opacity:.55; }
    .task-item:has(input:checked) .task-title strong { text-decoration:line-through; }
    .change-log { overflow:hidden; border:1px solid var(--color-line); border-radius:20px; background:var(--color-panel); }
    .change-log > summary { display:flex; align-items:center; flex-wrap:wrap; gap:12px; padding:18px 16px; color:var(--color-ink); font-size:15px; font-weight:800; cursor:pointer; list-style:none; }
    .change-log > summary::-webkit-details-marker { display:none; }
    .change-log > summary::before { content:"＋"; color:var(--color-accent-pink); }
    .change-log[open] > summary::before { content:"−"; }
    .change-log > summary > span:first-of-type { margin-right:auto; }
    .change-count { color:var(--color-muted); font-size:12px; font-weight:700; }
    .change-list { border-top:1px solid var(--color-line); }
    .change-row { display:grid; grid-template-columns:1fr; gap:7px; padding:14px 16px; border-bottom:1px solid var(--color-line); }
    .change-row:last-child { border-bottom:0; }
    .change-row time { color:var(--color-muted); font-size:11px; }
    .change-row strong { min-width:0; overflow-wrap:anywhere; font-size:13px; }
    .change-type { justify-self:start; padding:4px 7px; border-radius:999px; color:var(--color-soft-text); background:var(--color-soft); font-size:10px; font-weight:800; }
    .change-values { min-width:0; overflow-wrap:anywhere; color:var(--color-muted); font-size:12px; line-height:1.4; }
    .empty { padding:24px; color:var(--color-muted); text-align:center; border:1px dashed var(--color-line); border-radius:16px; }
    footer { margin-top:28px; color:var(--color-footer); font-size:12px; text-align:center; }
    @media (min-width: 761px) {
      .shell { width:min(calc(100% - 32px), 1180px); padding:48px 0 72px; }
      .hero { padding:34px; }
      h1 { font-size:clamp(36px, 7vw, 70px); }
      .hero p { font-size:17px; }
      .timeline-status { align-items:center; padding:13px 16px; font-size:12px; }
      .timeline-grid { grid-template-columns:repeat(6,minmax(0,1fr)); }
      .timeline-month { padding:14px 11px 16px; }
      .timeline-month:nth-child(2n) { border-right:1px solid var(--color-hero-line); }
      .timeline-month:nth-child(6n) { border-right:0; }
      .timeline-controls { padding:10px 14px; }
      .section-title { align-items:flex-end; flex-direction:row; gap:16px; }
      .deadline-group-head { align-items:center; flex-direction:row; gap:18px; padding:20px; }
      .deadline-group-head > span { white-space:nowrap; }
      .timeline { padding:0 20px; }
      .timeline-item { grid-template-columns:190px minmax(0,1fr) auto; gap:20px; }
      .timeline-source { white-space:nowrap; }
      .search { flex:1 1 260px; width:auto; }
      .filters,.status-filters { width:auto; }
      .games-only-filter { width:auto; }
      .game-form { grid-template-columns:repeat(3,minmax(0,1fr)); }
      .operations-grid { grid-template-columns:repeat(3,minmax(0,1fr)); }
      .metric-grid { grid-template-columns:repeat(4,minmax(0,1fr)); }
      .application-form { grid-template-columns:repeat(3,minmax(0,1fr)); }
      .game-profile { grid-template-columns:84px minmax(0,1fr); }
      .game-profile .game-capsule,.game-profile .game-capsule-fallback { width:84px; }
      .task-state-toolbar { align-items:center; flex-direction:row; justify-content:space-between; }
      .task-state-status { text-align:right; }
      .event-row { grid-template-columns:145px minmax(0,1fr) auto; gap:20px; padding:20px; }
      .event-actions { justify-self:auto; flex-direction:column; }
      .event-action,.event-ics { white-space:nowrap; }
      .event-tasks { grid-column:2 / 4; }
      .application-workflow { grid-column:2 / 4; }
      .task-item { grid-template-columns:auto minmax(0,1fr) auto; }
      .task-item > a { grid-column:auto; justify-self:auto; white-space:nowrap; }
      .change-log > summary { padding:18px 20px; }
      .change-row { grid-template-columns:150px minmax(180px,1fr) auto minmax(220px,auto); align-items:center; gap:16px; padding:14px 20px; }
      .change-values { text-align:right; }
    }
    @media (prefers-reduced-motion: reduce) {
      html { scroll-behavior:auto; }
      .event-row.timeline-highlight { animation:none; box-shadow:inset 4px 0 var(--color-accent-pink); }
    }
  </style>
</head>
<body>
  <main class="shell">
    <section class="hero">
      <div class="language-switch" role="group" aria-label="Arayüz dili" data-i18n-aria-label="languageLabel">
        <button class="active" type="button" data-language="tr" aria-pressed="true">TR</button>
        <button type="button" data-language="en" aria-pressed="false">EN</button>
      </div>
      <span class="eyebrow" data-i18n="eyebrow">Joygame Select · Steamworks Operasyonları</span>
      <h1 data-i18n-html="title">Steam Etkinlik<br>Radarı</h1>
      <p data-i18n="heroDescription">Steam’in resmî takvimindeki festivalleri, sezon indirimlerini ve başvuru kilometre taşlarını Joygame Select operasyon görünümünde tek yerde takip et.</p>
      ${renderTimeline(model, config.timezone)}
    </section>

    <section class="section" aria-labelledby="operations-heading">
      <div class="section-title">
        <h2 id="operations-heading">${localizedText("Bugün ne yapmalıyız?", "What should we do today?")}</h2>
        <p>${localizedText("Kritik tarihler, açık işler ve ekip başvuruları tek operasyon kuyruğunda.", "Critical dates, open work and team applications in one operational queue.")}</p>
      </div>
      <div class="operations-grid">
        <article class="operation-card critical">
          <strong data-operation-critical>${model.deadlines.filter((item) => item.daysLeft >= 0 && item.daysLeft <= 7).length}</strong>
          <span>${localizedText("7 gün içindeki kritik tarih", "critical dates within 7 days")}</span>
        </article>
        <article class="operation-card">
          <strong data-operation-tasks>0</strong>
          <span>${localizedText("tamamlanmamış görev", "incomplete tasks")}</span>
        </article>
        <article class="operation-card">
          <strong data-operation-applications>0</strong>
          <span>${localizedText("aktif başvuru", "active applications")}</span>
        </article>
      </div>
      <div class="operation-card operation-inbox" data-operation-inbox></div>
    </section>

    <section class="section" aria-labelledby="games-heading">
      <div class="section-title">
        <h2 id="games-heading" data-i18n="myGames">Oyunlarım</h2>
        <p data-i18n="gamesIntro">Etiketleri birebir karşılaştırarak uygun olabilecek temalı festivalleri gösterir.</p>
      </div>
      <div class="games-panel">
        <form class="game-form" data-game-form>
          <input type="hidden" data-game-id>
          <div class="game-field">
            <label for="game-name" data-i18n="gameName">Oyun adı</label>
            <div class="steam-game-search">
              <input
                id="game-name"
                type="search"
                data-game-name
                maxlength="100"
                required
                autocomplete="off"
                role="combobox"
                aria-autocomplete="list"
                aria-expanded="false"
                aria-controls="steam-game-results"
              >
              <div
                class="steam-game-results"
                id="steam-game-results"
                data-steam-game-results
                role="listbox"
                aria-label="Steam oyun sonuçları"
                hidden
              ></div>
              <div class="steam-search-status" data-steam-search-status role="status" aria-live="polite" data-i18n="typeTwoChars">En az 2 karakter yazın.</div>
            </div>
          </div>
          <label class="game-field">
            Steam App ID <span data-i18n="optional">(opsiyonel)</span>
            <input type="text" data-game-app-id inputmode="numeric" pattern="[0-9]*" maxlength="12" autocomplete="off">
          </label>
          <label class="game-field game-field-wide">
            <span data-i18n="steamTags">Steam etiketleri</span>
            <input type="text" data-game-tags placeholder="Örn. Cyberpunk, Sci-fi, RPG" data-i18n-placeholder="tagsPlaceholder" autocomplete="off">
          </label>
          <label class="game-field">
            <span data-i18n="demoStatus">Demo durumu</span>
            <select data-game-demo-status>
              <option value="none" data-i18n="none">Yok</option>
              <option value="preparing" data-i18n="preparing">Hazırlanıyor</option>
              <option value="live" data-i18n="live">Yayında</option>
            </select>
          </label>
          <label class="game-field">
            <span data-i18n="releaseStatus">Çıkış durumu</span>
            <select data-game-release-status>
              <option value="unreleased" data-i18n="unreleased">Yayınlanmadı</option>
              <option value="early_access" data-i18n="earlyAccess">Erken erişim</option>
              <option value="released" data-i18n="live">Yayında</option>
            </select>
          </label>
          <label class="game-field">
            <span data-i18n="localMultiplayer">Yerel çok oyunculu</span>
            <select data-game-local-multiplayer>
              <option value="no" data-i18n="no">Hayır</option>
              <option value="yes" data-i18n="yes">Evet</option>
            </select>
          </label>
          <div class="game-form-actions">
            <button type="submit" data-game-submit data-i18n="saveGame">Oyunu kaydet</button>
            <button type="button" data-game-cancel hidden data-i18n="cancel">Vazgeç</button>
          </div>
        </form>
        <p class="game-help" data-i18n="gameHelp">Etiket adlarını oyunun Steam mağaza sayfasındaki biçimiyle, virgülle ayırarak girin. Benzer kelimeler veya tahminler eşleşme sayılmaz.</p>
        <div class="game-list" data-games-list></div>
        <p class="game-match-summary" data-game-match-summary role="status" aria-live="polite" data-i18n="addGamePrompt">Eşleşme için oyun ekleyin.</p>
      </div>
    </section>

    <section class="section">
      <details class="change-log">
        <summary>
          <span data-i18n="changesTitle">Son 90 günde ne değişti</span>
          <span class="change-count">${recentChanges.length} <span data-i18n="records">kayıt</span></span>
        </summary>
        ${
          recentChanges.length
            ? `<div class="change-list">${recentChanges.map(changeRow).join("")}</div>`
            : `<div class="empty">Son 90 günde kaydedilmiş bir değişiklik yok.</div>`
        }
      </details>
    </section>

    <section class="section">
      <div class="section-title">
        <h2 data-i18n="upcomingDeadlines">Yaklaşan son tarihler</h2>
        <p data-i18n="deadlinesIntro">Etkinlik bazında yapılacaklar · İstanbul saatine göre</p>
      </div>
      ${
        featuredDeadlines.length
          ? `<div class="deadline-groups">${[...groupedDeadlines.values()]
              .map(({ event, items }) => deadlineTimelineGroup(event, items))
              .join("")}</div>`
          : `<div class="empty">Yaklaşan bilinen bir son tarih yok.</div>`
      }
    </section>

    <section class="section">
      <div class="section-title">
        <h2 data-i18n="eventCalendar">Etkinlik takvimi</h2>
        <p><span data-i18n="lastUpdated">Son güncelleme:</span> ${localizedText(
          model.generated.setLocale("tr").toFormat("d LLLL yyyy, HH:mm"),
          model.generated.setLocale("en").toFormat("d LLLL yyyy, HH:mm"),
        )}</p>
      </div>
      <div class="toolbar">
        <label class="sr-only" for="search" data-i18n="searchEvents">Etkinlik ara</label>
        <input class="search" id="search" type="search" placeholder="Etkinlik ara…" data-i18n-placeholder="searchEventsPlaceholder" autocomplete="off">
        <div class="filters" role="group" aria-label="Etkinlik filtresi">
          <button class="active" type="button" data-filter="all" aria-pressed="true" data-i18n="all">Tümü</button>
          <button type="button" data-filter="themed_fest" aria-pressed="false" data-i18n="festivals">Festivaller</button>
          <button type="button" data-filter="next_fest" aria-pressed="false">Next Fest</button>
          <button type="button" data-filter="seasonal_sale" aria-pressed="false" data-i18n="sales">İndirimler</button>
        </div>
        <div class="status-filters" role="group" aria-label="Durum filtresi">
          <button type="button" data-registration-filter aria-pressed="false" data-i18n="openRegistration">Başvurusu hâlâ açık olanlar</button>
          <button type="button" data-incomplete-filter aria-pressed="false" data-i18n="incompleteTasks">Tamamlanmamış görevi olanlar</button>
          <button class="games-only-filter" type="button" data-games-filter aria-pressed="false" data-i18n="matchingGamesOnly">★ Sadece oyunlarımla eşleşenler</button>
        </div>
      </div>
      <div class="task-state-toolbar">
        <div class="task-state-actions" role="group" aria-label="Görev durumunu yönet">
          <button type="button" data-task-export data-i18n="exportState">Durumu dışa aktar</button>
          <button type="button" data-task-import data-i18n="importState">Durumu içe aktar</button>
          <button type="button" data-task-reset data-i18n="resetAll">Tümünü sıfırla</button>
          <input
            type="file"
            accept=".json,application/json"
            data-task-import-file
            aria-label="Görev durumu JSON dosyasını seç"
            hidden
          >
        </div>
        <span class="task-state-status" data-task-state-status role="status" aria-live="polite"></span>
      </div>
      <div class="event-list" id="events">${model.events
        .map((event, index) =>
          eventRow(
            event,
            snapshot.generatedAt,
            changelog,
            index === 0,
          ),
        )
        .join("")}</div>
      <div class="empty" id="no-results" role="status" aria-live="polite" hidden data-i18n="noResults">Bu filtrelerle eşleşen etkinlik yok.</div>
    </section>

    <section class="section" aria-labelledby="metrics-heading">
      <div class="section-title">
        <h2 id="metrics-heading">${localizedText("Operasyon metrikleri", "Operational metrics")}</h2>
        <p>${localizedText("Takvimin büyüklüğünü değil, ekibin ilerlemesini gösterir.", "Measures team progress rather than calendar size.")}</p>
      </div>
      <div class="metric-grid">
        <article class="metric-card"><strong data-metric-completion>0%</strong><span>${localizedText("görev tamamlama", "task completion")}</span></article>
        <article class="metric-card"><strong data-metric-submitted>0</strong><span>${localizedText("gönderilen başvuru", "submitted applications")}</span></article>
        <article class="metric-card"><strong data-metric-accepted>0</strong><span>${localizedText("kabul edilen başvuru", "accepted applications")}</span></article>
        <article class="metric-card"><strong data-metric-games>0</strong><span>${localizedText("takip edilen oyun", "tracked games")}</span></article>
      </div>
    </section>

    <section class="section" aria-labelledby="admin-heading">
      <div class="section-title">
        <h2 id="admin-heading">${localizedText("Yönetim", "Administration")}</h2>
        <p>${localizedText("Ekip verisi, bildirim tercihleri ve senkronizasyon durumu.", "Team data, notification preferences and sync status.")}</p>
      </div>
      <div class="admin-panel">
        <div class="admin-status">
          <span class="sync-badge" data-team-sync>${localizedText("Yerel çalışma modu", "Local working mode")}</span>
          <span data-team-user></span>
          <button type="button" data-team-refresh>${localizedText("Ekip verisini yenile", "Refresh team data")}</button>
        </div>
        <div class="notification-settings">
          <strong>${localizedText("Akıllı panel uyarıları", "Smart dashboard alerts")}</strong>
          <label><input type="checkbox" data-notification-deadlines checked> ${localizedText("7 gün içindeki son tarihleri öne çıkar", "Highlight deadlines within 7 days")}</label>
          <label><input type="checkbox" data-notification-changes checked> ${localizedText("Son 24 saatteki Valve değişikliklerini göster", "Show Valve changes from the last 24 hours")}</label>
          <label><input type="checkbox" data-notification-overdue checked> ${localizedText("Açık görevleri operasyon kuyruğuna ekle", "Add open tasks to the operations queue")}</label>
        </div>
      </div>
    </section>
    <footer data-i18n="footer">Joygame Select · Steam Operasyonları · Kaynak: Valve Steamworks dokümantasyonu · Bu rapor salt okunur çalışır.</footer>
  </main>
  <script>
    const buttons = [...document.querySelectorAll("[data-filter]")];
    const rows = [...document.querySelectorAll(".event-row")];
    const search = document.querySelector("#search");
    const empty = document.querySelector("#no-results");
    const gamesFilter = document.querySelector("[data-games-filter]");
    const registrationFilter = document.querySelector(
      "[data-registration-filter]",
    );
    const incompleteFilter = document.querySelector(
      "[data-incomplete-filter]",
    );
    const hashState = new URLSearchParams(location.hash.slice(1));
    const allowedFilters = new Set([
      "all",
      "themed_fest",
      "next_fest",
      "seasonal_sale",
    ]);
    let filter = allowedFilters.has(hashState.get("filter"))
      ? hashState.get("filter")
      : "all";
    let gamesOnly = hashState.get("games") === "1";
    let registrationOnly = hashState.get("registration") === "1";
    let incompleteOnly = hashState.get("incomplete") === "1";
    let timelineOffset = Math.max(
      0,
      Number.parseInt(hashState.get("month") || "0", 10) || 0,
    );
    let activeEventId = hashState.get("event") || "";
    search.value = hashState.get("q") || "";

    function writeUrlState() {
      const state = new URLSearchParams();
      if (filter !== "all") state.set("filter", filter);
      if (search.value.trim()) state.set("q", search.value.trim());
      if (gamesOnly) state.set("games", "1");
      if (registrationOnly) state.set("registration", "1");
      if (incompleteOnly) state.set("incomplete", "1");
      if (timelineOffset > 0) state.set("month", String(timelineOffset));
      if (activeEventId) state.set("event", activeEventId);
      const hash = state.toString();
      history.replaceState(
        null,
        "",
        location.pathname + location.search + (hash ? "#" + hash : ""),
      );
    }

    function setToggleState(button, active) {
      button?.classList.toggle("active", active);
      button?.setAttribute("aria-pressed", String(active));
    }

    buttons.forEach((button) => {
      const active = button.dataset.filter === filter;
      setToggleState(button, active);
    });
    setToggleState(gamesFilter, gamesOnly);
    setToggleState(registrationFilter, registrationOnly);
    setToggleState(incompleteFilter, incompleteOnly);

    function apply() {
      const query = search.value.trim().toLocaleLowerCase("tr");
      let visible = 0;
      rows.forEach((row) => {
        const matchKind = filter === "all" || row.dataset.kind === filter;
        const matchQuery = !query || row.dataset.search.includes(query);
        const matchGame = !gamesOnly || row.dataset.gameMatch === "true";
        const matchRegistration =
          !registrationOnly || row.dataset.registrationOpen === "true";
        const hasIncompleteTasks =
          row.dataset.hasTasks === "true" &&
          !row.classList.contains("tasks-complete");
        const matchIncomplete = !incompleteOnly || hasIncompleteTasks;
        row.hidden = !(
          matchKind &&
          matchQuery &&
          matchGame &&
          matchRegistration &&
          matchIncomplete
        );
        if (!row.hidden) visible++;
      });
      empty.hidden = visible !== 0;
      writeUrlState();
    }
    buttons.forEach((button) => button.addEventListener("click", () => {
      buttons.forEach((item) => {
        item.classList.remove("active");
        item.setAttribute("aria-pressed", "false");
      });
      button.classList.add("active");
      button.setAttribute("aria-pressed", "true");
      filter = button.dataset.filter;
      apply();
    }));
    search.addEventListener("input", () => {
      activeEventId = "";
      apply();
    });
    gamesFilter?.addEventListener("click", () => {
      gamesOnly = !gamesOnly;
      setToggleState(gamesFilter, gamesOnly);
      apply();
    });
    registrationFilter?.addEventListener("click", () => {
      registrationOnly = !registrationOnly;
      setToggleState(registrationFilter, registrationOnly);
      apply();
    });
    incompleteFilter?.addEventListener("click", () => {
      incompleteOnly = !incompleteOnly;
      setToggleState(incompleteFilter, incompleteOnly);
      apply();
    });

    const languageStorageKey = "steam-etkinlik-radari-dil-v1";
    const languageButtons = [
      ...document.querySelectorAll("[data-language]"),
    ];
    let descriptionLanguage = "tr";
    try {
      descriptionLanguage =
        localStorage.getItem(languageStorageKey) === "en" ? "en" : "tr";
    } catch {}

    const uiCopy = {
      languageLabel: { tr: "Arayüz dili", en: "Interface language" },
      eyebrow: {
        tr: "Joygame Select · Steamworks Operasyonları",
        en: "Joygame Select · Steamworks Operations",
      },
      title: { tr: "Steam Etkinlik<br>Radarı", en: "Steam Event<br>Radar" },
      heroDescription: {
        tr: "Steam’in resmî takvimindeki festivalleri, sezon indirimlerini ve başvuru kilometre taşlarını Joygame Select operasyon görünümünde tek yerde takip et.",
        en: "Track festivals, seasonal sales, and registration milestones from Steam’s official calendar in one Joygame Select operations view.",
      },
      myGames: { tr: "Oyunlarım", en: "My Games" },
      gamesIntro: {
        tr: "Etiketleri birebir karşılaştırarak uygun olabilecek temalı festivalleri gösterir.",
        en: "Shows potentially relevant themed festivals by matching tags exactly.",
      },
      gameName: { tr: "Oyun adı", en: "Game name" },
      typeTwoChars: {
        tr: "En az 2 karakter yazın.",
        en: "Enter at least 2 characters.",
      },
      optional: { tr: "(opsiyonel)", en: "(optional)" },
      steamTags: { tr: "Steam etiketleri", en: "Steam tags" },
      tagsPlaceholder: {
        tr: "Örn. Cyberpunk, Sci-fi, RPG",
        en: "E.g. Cyberpunk, Sci-fi, RPG",
      },
      demoStatus: { tr: "Demo durumu", en: "Demo status" },
      none: { tr: "Yok", en: "None" },
      preparing: { tr: "Hazırlanıyor", en: "In preparation" },
      live: { tr: "Yayında", en: "Live" },
      releaseStatus: { tr: "Çıkış durumu", en: "Release status" },
      unreleased: { tr: "Yayınlanmadı", en: "Unreleased" },
      earlyAccess: { tr: "Erken erişim", en: "Early access" },
      localMultiplayer: {
        tr: "Yerel çok oyunculu",
        en: "Local multiplayer",
      },
      no: { tr: "Hayır", en: "No" },
      yes: { tr: "Evet", en: "Yes" },
      saveGame: { tr: "Oyunu kaydet", en: "Save game" },
      cancel: { tr: "Vazgeç", en: "Cancel" },
      gameHelp: {
        tr: "Etiket adlarını oyunun Steam mağaza sayfasındaki biçimiyle, virgülle ayırarak girin. Benzer kelimeler veya tahminler eşleşme sayılmaz.",
        en: "Enter tag names exactly as shown on the game’s Steam store page, separated by commas. Similar words and guesses do not count as matches.",
      },
      addGamePrompt: {
        tr: "Eşleşme için oyun ekleyin.",
        en: "Add a game to find matches.",
      },
      changesTitle: {
        tr: "Son 90 günde ne değişti",
        en: "What changed in the last 90 days",
      },
      records: { tr: "kayıt", en: "records" },
      registration: { tr: "Başvuru", en: "Registration" },
      noPlannedEvents: {
        tr: "Planlanmış etkinlik yok",
        en: "No events scheduled",
      },
      nearestCritical: {
        tr: "En yakın kritik tarih:",
        en: "Nearest critical deadline:",
      },
      days: { tr: "gün", en: "days" },
      today: { tr: "Bugün", en: "Today" },
      previous: { tr: "Önceki", en: "Previous" },
      next: { tr: "Sonraki", en: "Next" },
      upcomingDeadlines: {
        tr: "Yaklaşan son tarihler",
        en: "Upcoming deadlines",
      },
      deadlinesIntro: {
        tr: "Etkinlik bazında yapılacaklar · İstanbul saatine göre",
        en: "Tasks by event · Istanbul time",
      },
      eventCalendar: { tr: "Etkinlik takvimi", en: "Event calendar" },
      lastUpdated: { tr: "Son güncelleme:", en: "Last updated:" },
      searchEvents: { tr: "Etkinlik ara", en: "Search events" },
      searchEventsPlaceholder: {
        tr: "Etkinlik ara…",
        en: "Search events…",
      },
      all: { tr: "Tümü", en: "All" },
      festivals: { tr: "Festivaller", en: "Festivals" },
      sales: { tr: "İndirimler", en: "Sales" },
      themedFestival: { tr: "Temalı festival", en: "Themed festival" },
      nextFest: { tr: "Next Fest", en: "Next Fest" },
      seasonalSale: { tr: "Sezon indirimi", en: "Seasonal sale" },
      registrationPage: {
        tr: "Kayıt sayfası",
        en: "Registration page",
      },
      details: { tr: "Detaylar", en: "Details" },
      addToCalendar: { tr: "Takvime ekle", en: "Add to calendar" },
      source: { tr: "Kaynak", en: "Source" },
      open: { tr: "Aç", en: "Open" },
      tasks: { tr: "Görevler", en: "Tasks" },
      openRegistration: {
        tr: "Başvurusu hâlâ açık olanlar",
        en: "Registration still open",
      },
      incompleteTasks: {
        tr: "Tamamlanmamış görevi olanlar",
        en: "With incomplete tasks",
      },
      matchingGamesOnly: {
        tr: "★ Sadece oyunlarımla eşleşenler",
        en: "★ Matches for my games only",
      },
      exportState: { tr: "Durumu dışa aktar", en: "Export state" },
      importState: { tr: "Durumu içe aktar", en: "Import state" },
      resetAll: { tr: "Tümünü sıfırla", en: "Reset all" },
      noResults: {
        tr: "Bu filtrelerle eşleşen etkinlik yok.",
        en: "No events match these filters.",
      },
      footer: {
        tr: "Joygame Select · Steam Operasyonları · Kaynak: Valve Steamworks dokümantasyonu · Bu rapor salt okunur çalışır.",
        en: "Joygame Select · Steam Operations · Source: Valve Steamworks documentation · This report is read-only.",
      },
    };

    function translate(key) {
      return uiCopy[key]?.[descriptionLanguage] || "";
    }

    function localized(tr, en) {
      return descriptionLanguage === "en" ? en : tr;
    }

    function applyDescriptionLanguage() {
      document.documentElement.lang = descriptionLanguage;
      document.querySelectorAll("[data-event-description]").forEach((copy) => {
        copy.textContent =
          descriptionLanguage === "en"
            ? copy.dataset.descriptionEn
            : copy.dataset.descriptionTr;
        copy.lang = descriptionLanguage;
      });
      document.querySelectorAll("[data-i18n]").forEach((element) => {
        element.textContent = translate(element.dataset.i18n);
      });
      document.querySelectorAll("[data-i18n-html]").forEach((element) => {
        element.innerHTML = translate(element.dataset.i18nHtml);
      });
      document
        .querySelectorAll("[data-i18n-placeholder]")
        .forEach((element) => {
          element.placeholder = translate(element.dataset.i18nPlaceholder);
        });
      document
        .querySelectorAll("[data-i18n-aria-label]")
        .forEach((element) => {
          element.setAttribute(
            "aria-label",
            translate(element.dataset.i18nAriaLabel),
          );
        });
      document.querySelectorAll("[data-month-tr]").forEach((element) => {
        element.textContent =
          descriptionLanguage === "en"
            ? element.dataset.monthEn
            : element.dataset.monthTr;
      });
      document.querySelectorAll("[data-copy-tr]").forEach((element) => {
        element.textContent =
          descriptionLanguage === "en"
            ? element.dataset.copyEn
            : element.dataset.copyTr;
      });
      document.querySelectorAll("[data-copy-aria-tr]").forEach((element) => {
        element.setAttribute(
          "aria-label",
          descriptionLanguage === "en"
            ? element.dataset.copyAriaEn
            : element.dataset.copyAriaTr,
        );
      });
      document.querySelectorAll("[data-days-left]").forEach((element) => {
        const daysLeft = Number(element.dataset.daysLeft);
        element.textContent =
          descriptionLanguage === "en"
            ? daysLeft < 0
              ? "Passed"
              : daysLeft === 0
                ? "Today"
                : daysLeft === 1
                  ? "Tomorrow"
                  : daysLeft + " days left"
            : daysLeft < 0
              ? "Süre geçti"
              : daysLeft === 0
                ? "Bugün"
                : daysLeft === 1
                  ? "Yarın"
                  : daysLeft + " gün kaldı";
      });
      document.querySelectorAll("[data-task-progress]").forEach((progress) => {
        const group = progress.closest("[data-event-tasks]");
        const total = Number(progress.dataset.taskTotal || 0);
        const done = group
          ? group.querySelectorAll("[data-task-id]:checked").length
          : 0;
        progress.textContent =
          done +
          "/" +
          total +
          localized(" tamamlandı", " completed");
      });
      document.querySelectorAll(".timeline-chip.tasks-complete").forEach((chip) => {
        chip.dataset.completeLabel = localized("✓ Tamamlandı", "✓ Completed");
      });
      languageButtons.forEach((button) => {
        setToggleState(
          button,
          button.dataset.language === descriptionLanguage,
        );
      });
    }

    languageButtons.forEach((button) => {
      button.addEventListener("click", () => {
        descriptionLanguage = button.dataset.language === "en" ? "en" : "tr";
        try {
          localStorage.setItem(languageStorageKey, descriptionLanguage);
        } catch {}
        applyDescriptionLanguage();
        renderGames();
        updateGameMatches();
        window.dispatchEvent(new Event("resize"));
      });
    });
    applyDescriptionLanguage();

    document.querySelectorAll("[data-ics]").forEach((button) => {
      button.addEventListener("click", () => {
        const payload = JSON.parse(button.dataset.ics);
        const blob = new Blob([payload.content], {
          type: "text/calendar;charset=utf-8",
        });
        const objectUrl = URL.createObjectURL(blob);
        const download = document.createElement("a");
        download.href = objectUrl;
        download.download = payload.filename;
        document.body.append(download);
        download.click();
        download.remove();
        window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
      });
    });

    let teamStateEnabled = false;
    let teamStateRecords = [];
    let teamUser = "";
    const teamSyncBadge = document.querySelector("[data-team-sync]");
    const teamUserLabel = document.querySelector("[data-team-user]");

    async function loadTeamState() {
      if (location.protocol === "file:") return [];
      try {
        const response = await fetch("/api/team-state", {
          headers: { accept: "application/json" },
        });
        if (!response.ok) throw new Error("team state unavailable");
        const body = await response.json();
        teamStateEnabled = body.enabled === true;
        teamStateRecords = Array.isArray(body.records) ? body.records : [];
        teamUser = String(body.user || "");
        teamSyncBadge.classList.toggle("online", teamStateEnabled);
        teamSyncBadge.textContent = teamStateEnabled
          ? localized("Ekip senkronizasyonu açık", "Team sync enabled")
          : localized("Yerel çalışma modu", "Local working mode");
        teamUserLabel.textContent = teamUser;
        return teamStateRecords;
      } catch {
        teamStateEnabled = false;
        teamSyncBadge.classList.remove("online");
        teamSyncBadge.textContent = localized(
          "Yerel çalışma modu",
          "Local working mode",
        );
        return [];
      }
    }

    async function upsertTeamState(key, type, payload) {
      if (!teamStateEnabled) return;
      try {
        const response = await fetch("/api/team-state", {
          method: "PUT",
          headers: {
            accept: "application/json",
            "content-type": "application/json",
          },
          body: JSON.stringify({ key, type, payload }),
        });
        if (!response.ok) throw new Error("team state write failed");
        const body = await response.json();
        const record = body.record;
        teamStateRecords = teamStateRecords.filter(
          (item) => item.key !== record.key,
        );
        teamStateRecords.push(record);
      } catch {
        teamSyncBadge.textContent = localized(
          "Senkronizasyon bekliyor",
          "Sync pending",
        );
      }
    }

    async function removeTeamState(key) {
      if (!teamStateEnabled) return;
      try {
        const response = await fetch(
          "/api/team-state?key=" + encodeURIComponent(key),
          { method: "DELETE", headers: { accept: "application/json" } },
        );
        if (!response.ok) throw new Error("team state delete failed");
        teamStateRecords = teamStateRecords.filter((item) => item.key !== key);
      } catch {
        teamSyncBadge.textContent = localized(
          "Senkronizasyon bekliyor",
          "Sync pending",
        );
      }
    }

    const gamesStorageKey = "steam-etkinlik-radari-oyunlar-v1";
    const gameForm = document.querySelector("[data-game-form]");
    const gameIdInput = document.querySelector("[data-game-id]");
    const gameNameInput = document.querySelector("[data-game-name]");
    const gameAppIdInput = document.querySelector("[data-game-app-id]");
    const gameTagsInput = document.querySelector("[data-game-tags]");
    const gameDemoInput = document.querySelector("[data-game-demo-status]");
    const gameReleaseInput = document.querySelector("[data-game-release-status]");
    const gameLocalInput = document.querySelector("[data-game-local-multiplayer]");
    const gameCancel = document.querySelector("[data-game-cancel]");
    const gamesList = document.querySelector("[data-games-list]");
    const gameMatchSummary = document.querySelector("[data-game-match-summary]");
    const steamGameResults = document.querySelector(
      "[data-steam-game-results]",
    );
    const steamSearchStatus = document.querySelector(
      "[data-steam-search-status]",
    );
    let steamSearchTimer = 0;
    let steamSearchController;
    let steamDetailController;
    let steamOptions = [];
    let selectedSteamDetails = null;

    function safeSteamImage(value) {
      try {
        const url = new URL(value);
        return url.protocol === "https:" &&
          url.hostname.endsWith(".steamstatic.com")
          ? url.toString()
          : "";
      } catch {
        return "";
      }
    }

    function closeSteamResults() {
      steamGameResults.hidden = true;
      gameNameInput.setAttribute("aria-expanded", "false");
    }

    async function selectSteamGame(option) {
      gameNameInput.value = option.name;
      gameAppIdInput.value = option.appId;
      gameNameInput.dataset.selectedSteamName = option.name;
      gameNameInput.dataset.selectedSteamAppId = option.appId;
      closeSteamResults();
      steamSearchStatus.textContent =
        option.name +
        localized(
          " seçildi · Steam bilgileri alınıyor…",
          " selected · Loading Steam details…",
        );
      steamDetailController?.abort();
      steamDetailController = new AbortController();
      try {
        const response = await fetch(
          "/api/steam-app?appid=" +
            encodeURIComponent(option.appId) +
            "&v=4",
          {
            signal: steamDetailController.signal,
            headers: { accept: "application/json" },
          },
        );
        if (!response.ok) throw new Error("steam app details failed");
        const details = await response.json();
        if (
          gameNameInput.dataset.selectedSteamAppId !== option.appId ||
          gameAppIdInput.value !== option.appId
        ) {
          return;
        }
        if (Array.isArray(details.tags)) {
          gameTagsInput.value = details.tags
            .filter((tag) => typeof tag === "string")
            .slice(0, 20)
            .join(", ");
        }
        if (["none", "live"].includes(details.demoStatus)) {
          gameDemoInput.value = details.demoStatus;
        }
        if (
          ["unreleased", "early_access", "released"].includes(
            details.releaseStatus,
          )
        ) {
          gameReleaseInput.value = details.releaseStatus;
        }
        if (typeof details.localMultiplayer === "boolean") {
          gameLocalInput.value = details.localMultiplayer ? "yes" : "no";
        }
        selectedSteamDetails = {
          capsuleImageUrl: safeSteamImage(details.capsuleImageUrl),
          nextFestHistory: normalizeNextFestHistory(
            details.nextFestHistory,
          ),
        };
        steamSearchStatus.textContent =
          option.name +
          localized(
            " seçildi · Steam bilgileri dolduruldu.",
            " selected · Steam details filled in.",
          );
      } catch (error) {
        if (error?.name === "AbortError") return;
        steamSearchStatus.textContent =
          option.name +
          localized(
            " seçildi · Ayrıntılar alınamadı; manuel düzenleyebilirsiniz.",
            " selected · Details unavailable; you can edit them manually.",
          );
      } finally {
        gameTagsInput.focus();
      }
    }

    function renderSteamOptions(options) {
      steamOptions = options;
      steamGameResults.replaceChildren();
      options.forEach((option, index) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "steam-game-option";
        button.dataset.steamOptionIndex = String(index);
        button.setAttribute("role", "option");

        const image = document.createElement("img");
        const imageUrl = safeSteamImage(option.imageUrl);
        if (imageUrl) image.src = imageUrl;
        image.alt = "";
        image.loading = "lazy";

        const copy = document.createElement("span");
        const name = document.createElement("strong");
        name.textContent = option.name;
        const appId = document.createElement("small");
        appId.textContent = "Steam App ID · " + option.appId;
        copy.append(name, appId);
        button.append(image, copy);
        steamGameResults.append(button);
      });
      steamGameResults.hidden = options.length === 0;
      gameNameInput.setAttribute(
        "aria-expanded",
        String(options.length > 0),
      );
    }

    async function searchSteamGames(query) {
      if (location.protocol === "file:") {
        closeSteamResults();
        steamSearchStatus.textContent =
          localized(
            "Steam araması Cloudflare üzerindeki çevrimiçi panelde çalışır.",
            "Steam search works in the online Cloudflare dashboard.",
          );
        return;
      }
      steamSearchController?.abort();
      steamSearchController = new AbortController();
      steamSearchStatus.textContent = localized(
        "Steam’de aranıyor…",
        "Searching Steam…",
      );
      try {
        const response = await fetch(
          "/api/steam-search?q=" + encodeURIComponent(query),
          {
            signal: steamSearchController.signal,
            headers: { accept: "application/json" },
          },
        );
        if (!response.ok) throw new Error("steam search failed");
        const payload = await response.json();
        const options = Array.isArray(payload.results)
          ? payload.results
              .filter(
                (item) =>
                  item &&
                  typeof item.name === "string" &&
                  /^\\d+$/.test(String(item.appId)),
              )
              .map((item) => ({
                name: item.name.trim().slice(0, 100),
                appId: String(item.appId),
                imageUrl: String(item.imageUrl || ""),
              }))
          : [];
        renderSteamOptions(options);
        steamSearchStatus.textContent = options.length
          ? options.length +
            localized(" Steam sonucu bulundu.", " Steam results found.")
          : localized(
              "Steam’de eşleşen oyun bulunamadı.",
              "No matching game found on Steam.",
            );
      } catch (error) {
        if (error?.name === "AbortError") return;
        closeSteamResults();
        steamSearchStatus.textContent =
          localized(
            "Steam araması şu anda kullanılamıyor; manuel giriş yapabilirsiniz.",
            "Steam search is currently unavailable; you can enter the game manually.",
          );
      }
    }

    gameNameInput?.addEventListener("input", () => {
      const query = gameNameInput.value.trim();
      if (
        gameNameInput.dataset.selectedSteamName &&
        query !== gameNameInput.dataset.selectedSteamName
      ) {
        if (
          gameAppIdInput.value ===
          gameNameInput.dataset.selectedSteamAppId
        ) {
          gameAppIdInput.value = "";
        }
        delete gameNameInput.dataset.selectedSteamName;
        delete gameNameInput.dataset.selectedSteamAppId;
        selectedSteamDetails = null;
      }
      window.clearTimeout(steamSearchTimer);
      steamSearchController?.abort();
      steamDetailController?.abort();
      if (query.length < 2) {
        closeSteamResults();
        steamSearchStatus.textContent = translate("typeTwoChars");
        return;
      }
      steamSearchTimer = window.setTimeout(
        () => searchSteamGames(query),
        300,
      );
    });

    gameNameInput?.addEventListener("keydown", (event) => {
      if (
        event.key === "ArrowDown" &&
        !steamGameResults.hidden &&
        steamOptions.length > 0
      ) {
        event.preventDefault();
        steamGameResults
          .querySelector("[data-steam-option-index='0']")
          ?.focus();
      }
      if (event.key === "Escape") closeSteamResults();
    });

    steamGameResults?.addEventListener("keydown", (event) => {
      const button = event.target.closest("[data-steam-option-index]");
      if (!button) return;
      const index = Number(button.dataset.steamOptionIndex);
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        const direction = event.key === "ArrowDown" ? 1 : -1;
        const nextIndex =
          (index + direction + steamOptions.length) % steamOptions.length;
        steamGameResults
          .querySelector(
            "[data-steam-option-index='" + nextIndex + "']",
          )
          ?.focus();
      }
      if (event.key === "Escape") {
        closeSteamResults();
        gameNameInput.focus();
      }
    });

    steamGameResults?.addEventListener("click", (event) => {
      const button = event.target.closest("[data-steam-option-index]");
      if (!button) return;
      const option = steamOptions[Number(button.dataset.steamOptionIndex)];
      if (option) selectSteamGame(option);
    });

    gameNameInput?.addEventListener("blur", () => {
      window.setTimeout(() => {
        if (!steamGameResults.contains(document.activeElement)) {
          closeSteamResults();
        }
      }, 150);
    });

    const demoLabels = {
      tr: {
        none: "Demo yok",
        preparing: "Demo hazırlanıyor",
        live: "Demo yayında",
      },
      en: {
        none: "No demo",
        preparing: "Demo in preparation",
        live: "Demo live",
      },
    };
    const releaseLabels = {
      tr: {
        unreleased: "Yayınlanmadı",
        early_access: "Erken erişim",
        released: "Yayında",
      },
      en: {
        unreleased: "Unreleased",
        early_access: "Early access",
        released: "Released",
      },
    };

    function normalizeTags(value) {
      const source = Array.isArray(value) ? value : String(value || "").split(",");
      const seen = new Set();
      return source
        .map((tag) => String(tag).trim())
        .filter((tag) => {
          const key = tag.toLocaleLowerCase("en-US");
          if (!key || seen.has(key)) return false;
          seen.add(key);
          return true;
        });
    }

    function normalizeNextFestHistory(value) {
      if (!Array.isArray(value)) return [];
      return value
        .filter((item) => item && typeof item === "object")
        .map((item) => {
          let url = "";
          try {
            const parsed = new URL(String(item.url || ""));
            if (
              parsed.protocol === "https:" &&
              (parsed.hostname.endsWith(".steampowered.com") ||
                parsed.hostname.endsWith(".steamcommunity.com"))
            ) {
              url = parsed.toString();
            }
          } catch {}
          return {
            title: String(item.title || "Steam Next Fest")
              .trim()
              .slice(0, 180),
            publishedAt: /^\\d{4}-\\d{2}-\\d{2}T/.test(
              String(item.publishedAt || ""),
            )
              ? String(item.publishedAt)
              : "",
            url,
          };
        })
        .filter((item) => item.title && item.url)
        .slice(0, 5);
    }

    function normalizeGames(value) {
      if (!Array.isArray(value)) return [];
      return value
        .filter((game) => game && typeof game === "object")
        .map((game, index) => ({
          id:
            typeof game.id === "string" && game.id
              ? game.id
              : "imported-game-" + index,
          name: String(game.name || "").trim().slice(0, 100),
          appId: String(game.appId || "").replace(/\\D/g, "").slice(0, 12),
          tags: normalizeTags(game.tags),
          demoStatus: ["none", "preparing", "live"].includes(game.demoStatus)
            ? game.demoStatus
            : "none",
          releaseStatus: [
            "unreleased",
            "early_access",
            "released",
          ].includes(game.releaseStatus)
            ? game.releaseStatus
            : "unreleased",
          localMultiplayer: game.localMultiplayer === true,
          capsuleImageUrl: safeSteamImage(game.capsuleImageUrl),
          nextFestHistory: normalizeNextFestHistory(
            game.nextFestHistory,
          ),
          steamDetailsCheckedAt: /^\\d{4}-\\d{2}-\\d{2}T/.test(
            String(game.steamDetailsCheckedAt || ""),
          )
            ? String(game.steamDetailsCheckedAt)
            : "",
          steamImageVersion: Number(game.steamImageVersion || 0),
        }))
        .filter((game) => game.name);
    }

    function readGames() {
      try {
        return normalizeGames(
          JSON.parse(localStorage.getItem(gamesStorageKey) || "[]"),
        );
      } catch {
        return [];
      }
    }

    function writeGames() {
      try {
        localStorage.setItem(gamesStorageKey, JSON.stringify(games));
      } catch {}
    }

    function createGameId() {
      if (window.crypto?.randomUUID) return window.crypto.randomUUID();
      return (
        "game-" +
        Date.now() +
        "-" +
        Math.random().toString(36).slice(2, 10)
      );
    }

    function gameMeta(game) {
      const parts = [];
      if (game.appId) parts.push("App ID " + game.appId);
      parts.push(demoLabels[descriptionLanguage][game.demoStatus]);
      parts.push(releaseLabels[descriptionLanguage][game.releaseStatus]);
      parts.push(
        game.localMultiplayer
          ? localized(
              "Yerel çok oyunculu: Evet",
              "Local multiplayer: Yes",
            )
          : localized(
              "Yerel çok oyunculu: Hayır",
              "Local multiplayer: No",
            ),
      );
      return parts.join(" · ");
    }

    function createGameCapsule(game) {
      const imageUrl = safeSteamImage(game.capsuleImageUrl);
      if (!imageUrl) {
        const fallback = document.createElement("span");
        fallback.className = "game-capsule-fallback";
        fallback.textContent = game.name;
        return fallback;
      }
      const image = document.createElement("img");
      image.className = "game-capsule";
      image.src = imageUrl;
      image.alt = game.name + localized(" dikey kapsülü", " vertical capsule");
      image.loading = "lazy";
      image.addEventListener(
        "error",
        () => {
          const fallback = document.createElement("span");
          fallback.className = "game-capsule-fallback";
          fallback.textContent = game.name;
          image.replaceWith(fallback);
        },
        { once: true },
      );
      return image;
    }

    function nextFestHistoryBlock(game) {
      if (!game.nextFestHistory.length) return null;
      const box = document.createElement("div");
      box.className = "next-fest-history";
      const lead = document.createElement("strong");
      lead.textContent = localized(
        "Steam duyurularında geçmiş Next Fest kaydı bulundu.",
        "A previous Next Fest record was found in Steam announcements.",
      );
      const link = document.createElement("a");
      const record = game.nextFestHistory[0];
      link.href = record.url;
      link.target = "_blank";
      link.rel = "noreferrer";
      const date = record.publishedAt
        ? new Intl.DateTimeFormat(
            descriptionLanguage === "en" ? "en-GB" : "tr-TR",
            { dateStyle: "medium" },
          ).format(new Date(record.publishedAt))
        : "";
      link.textContent = (date ? date + " · " : "") + record.title;
      const note = document.createElement("span");
      note.textContent = localized(
        " Bu kayıt gelecekteki Next Fest uygunluğunu garanti etmez.",
        " This record does not guarantee eligibility for a future Next Fest.",
      );
      box.append(lead, document.createElement("br"), link, note);
      return box;
    }

    let focusedGameId = "";

    function renderGames() {
      gamesList.replaceChildren();
      games.forEach((game) => {
        const item = document.createElement("article");
        item.className = "game-profile";

        const body = document.createElement("div");
        body.className = "game-profile-body";
        const name = document.createElement("strong");
        name.textContent = game.name;
        const meta = document.createElement("small");
        meta.textContent = gameMeta(game);
        const tags = document.createElement("small");
        tags.textContent = game.tags.length
          ? localized("Etiketler: ", "Tags: ") + game.tags.join(", ")
          : localized("Etiket girilmedi", "No tags entered");
        body.append(name, meta, tags);
        const history = nextFestHistoryBlock(game);
        if (history) body.append(history);

        const actions = document.createElement("div");
        actions.className = "game-profile-actions";
        const edit = document.createElement("button");
        edit.type = "button";
        edit.dataset.gameEdit = game.id;
        edit.textContent = localized("Düzenle", "Edit");
        edit.setAttribute(
          "aria-label",
          game.name + localized(" oyununu düzenle", " edit game"),
        );
        const remove = document.createElement("button");
        remove.type = "button";
        remove.dataset.gameDelete = game.id;
        remove.textContent = localized("Sil", "Delete");
        remove.setAttribute(
          "aria-label",
          game.name + localized(" oyununu sil", " delete game"),
        );
        const focus = document.createElement("button");
        focus.type = "button";
        focus.dataset.gameFocus = game.id;
        focus.classList.toggle("active", focusedGameId === game.id);
        focus.textContent =
          focusedGameId === game.id
            ? localized("Tüm etkinlikler", "All events")
            : localized("Bu oyunun işleri", "This game's work");
        focus.setAttribute(
          "aria-label",
          game.name + localized(" için operasyon görünümü", " operations view"),
        );
        actions.append(focus, edit, remove);
        body.append(actions);
        item.append(createGameCapsule(game), body);
        gamesList.append(item);
      });
    }

    function resetGameForm() {
      gameForm.reset();
      gameIdInput.value = "";
      delete gameNameInput.dataset.selectedSteamName;
      delete gameNameInput.dataset.selectedSteamAppId;
      selectedSteamDetails = null;
      closeSteamResults();
      steamSearchStatus.textContent = translate("typeTwoChars");
      gameCancel.hidden = true;
      gameForm.querySelector("[data-game-submit]").textContent =
        translate("saveGame");
    }

    function matchingGamesForRow(row) {
      const candidateGames = focusedGameId
        ? games.filter((game) => game.id === focusedGameId)
        : games;
      if (row.dataset.kind === "next_fest") {
        return candidateGames
          .filter((game) => game.releaseStatus === "unreleased")
          .map((game) => ({ game, score: 0, nextFest: true }));
      }
      let eventTags = [];
      try {
        eventTags = normalizeTags(JSON.parse(row.dataset.matchTags || "[]"));
      } catch {}
      const eventTagKeys = new Set(
        eventTags.map((tag) => tag.toLocaleLowerCase("en-US")),
      );
      return candidateGames
        .map((game) => ({
          game,
          score: new Set(
            game.tags
              .map((tag) => tag.toLocaleLowerCase("en-US"))
              .filter((tag) => eventTagKeys.has(tag)),
          ).size,
          nextFest: false,
        }))
        .filter((match) => match.score > 0);
    }

    function appendMatchBadge(container, match) {
      const badge = document.createElement("div");
      badge.className = "game-match-card";
      const copy = document.createElement("span");
      const name = document.createElement("strong");
      name.textContent = "★ " + match.game.name;
      const detail = document.createElement("small");
      detail.textContent = match.nextFest
        ? localized("Next Fest adayı", "Next Fest candidate")
        : match.score +
          localized(" etiket eşleşmesi", match.score === 1 ? " tag match" : " tag matches");
      copy.append(name, detail);
      badge.append(createGameCapsule(match.game), copy);
      badge.setAttribute(
        "aria-label",
        match.nextFest
          ? match.game.name +
            localized(
              " Next Fest çıkış kuralını karşılıyor",
              " meets the Next Fest release-status rule",
            )
          : match.game.name +
            ", " +
            match.score +
            localized(" birebir etiket eşleşmesi", " exact tag matches"),
      );
      container.append(badge);
    }

    function refreshTimelineChipAria(chip) {
      if (!chip.dataset.originalAriaLabel) {
        chip.dataset.originalAriaLabel = chip.getAttribute("aria-label") || "";
      }
      chip.setAttribute(
        "aria-label",
        chip.dataset.originalAriaLabel +
          (chip.dataset.gameAriaSuffix || "") +
          (chip.dataset.taskAriaSuffix || ""),
      );
    }

    function updateGameMatches() {
      let matchedEventCount = 0;
      rows.forEach((row) => {
        const matches = matchingGamesForRow(row);
        const result = row.querySelector("[data-game-match-result]");
        const warning = row.querySelector("[data-game-match-warning]");
        result.replaceChildren();
        warning.textContent = "";
        matches.forEach((match) => appendMatchBadge(result, match));
        result.hidden = matches.length === 0;

        if (row.dataset.kind === "next_fest" && games.length > 0) {
          const ineligible = games.filter(
            (game) => game.releaseStatus !== "unreleased",
          );
          if (ineligible.length > 0) {
            warning.textContent = ineligible
              .map(
                (game) =>
                  game.name +
                  localized(
                    ": Next Fest için çıkış durumu “Yayınlanmadı” olmalı.",
                    ": release status must be “Unreleased” for Next Fest.",
                  ),
              )
              .join(" ");
          }
        }
        warning.hidden = !warning.textContent;
        row.dataset.gameMatch = String(matches.length > 0);
        if (matches.length > 0) matchedEventCount++;

        document
          .querySelectorAll(
            '.timeline-chip[data-event-id="' + row.id.slice("etkinlik-".length) + '"]',
          )
          .forEach((chip) => {
            chip.querySelector("[data-game-chip-match]")?.remove();
            chip.classList.toggle("game-match", matches.length > 0);
            chip.dataset.gameAriaSuffix =
              matches.length > 0
                ? "; " +
                  matches.map((match) => match.game.name).join(", ") +
                  " oyunuyla eşleşiyor"
                : "";
            refreshTimelineChipAria(chip);
            if (matches.length === 0) return;
            const marker = document.createElement("span");
            marker.className = "timeline-game-match";
            marker.dataset.gameChipMatch = "";
            marker.textContent =
              "★ " +
              matches[0].game.name +
              (matches.length > 1 ? " +" + (matches.length - 1) : "");
            chip.append(marker);
          });
      });

      if (games.length === 0) {
        gameMatchSummary.textContent = translate("addGamePrompt");
      } else if (matchedEventCount === 0) {
        gameMatchSummary.textContent = localized(
          "Eşleşme bulunamadı.",
          "No matches found.",
        );
      } else {
        gameMatchSummary.textContent =
          matchedEventCount +
          localized(
            " etkinlikte eşleşme bulundu.",
            " matching events found.",
          );
      }
      apply();
    }

    async function refreshSavedGameDetails() {
      if (location.protocol === "file:") return;
      const refreshCutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
      const pending = games.filter(
        (game) =>
          game.appId &&
          (!game.steamDetailsCheckedAt ||
            Date.parse(game.steamDetailsCheckedAt) < refreshCutoff ||
            game.steamImageVersion < 4),
      );
      let changed = false;
      for (const game of pending) {
        try {
          const response = await fetch(
            "/api/steam-app?appid=" +
              encodeURIComponent(game.appId) +
              "&v=4",
            { headers: { accept: "application/json" } },
          );
          if (!response.ok) continue;
          const details = await response.json();
          if (Array.isArray(details.tags) && details.tags.length > 0) {
            game.tags = normalizeTags(details.tags);
          }
          if (["none", "live"].includes(details.demoStatus)) {
            game.demoStatus = details.demoStatus;
          }
          if (
            ["unreleased", "early_access", "released"].includes(
              details.releaseStatus,
            )
          ) {
            game.releaseStatus = details.releaseStatus;
          }
          if (typeof details.localMultiplayer === "boolean") {
            game.localMultiplayer = details.localMultiplayer;
          }
          game.capsuleImageUrl =
            safeSteamImage(details.capsuleImageUrl) ||
            game.capsuleImageUrl;
          game.nextFestHistory = normalizeNextFestHistory(
            details.nextFestHistory,
          );
          game.steamDetailsCheckedAt = new Date().toISOString();
          game.steamImageVersion = 4;
          changed = true;
        } catch {}
      }
      if (!changed) return;
      writeGames();
      games.forEach((game) =>
        upsertTeamState("game:" + game.id, "game", game),
      );
      renderGames();
      updateGameMatches();
    }

    let applications = {};
    let games = readGames();
    renderGames();
    updateGameMatches();
    refreshSavedGameDetails();
    const teamStatePromise = loadTeamState();
    teamStatePromise.then((records) => {
      const sharedGames = normalizeGames(
        records
          .filter((record) => record.type === "game")
          .map((record) => record.payload),
      );
      if (sharedGames.length > 0) {
        const merged = new Map(games.map((game) => [game.id, game]));
        sharedGames.forEach((game) => merged.set(game.id, game));
        games = [...merged.values()];
        writeGames();
        renderGames();
        updateGameMatches();
      }
      initializeApplicationWorkflows(records);
      renderOperations();
    });

    gameForm?.addEventListener("submit", (event) => {
      event.preventDefault();
      const name = gameNameInput.value.trim();
      if (!name) return;
      const game = {
        id: gameIdInput.value || createGameId(),
        name,
        appId: gameAppIdInput.value.replace(/\\D/g, "").slice(0, 12),
        tags: normalizeTags(gameTagsInput.value),
        demoStatus: gameDemoInput.value,
        releaseStatus: gameReleaseInput.value,
        localMultiplayer: gameLocalInput.value === "yes",
        capsuleImageUrl:
          selectedSteamDetails?.capsuleImageUrl || "",
        nextFestHistory:
          selectedSteamDetails?.nextFestHistory ||
          games.find((item) => item.id === gameIdInput.value)?.nextFestHistory ||
          [],
        steamDetailsCheckedAt: selectedSteamDetails
          ? new Date().toISOString()
          : games.find((item) => item.id === gameIdInput.value)
              ?.steamDetailsCheckedAt || "",
        steamImageVersion: selectedSteamDetails
          ? 4
          : games.find((item) => item.id === gameIdInput.value)
              ?.steamImageVersion || 0,
      };
      const index = games.findIndex((item) => item.id === game.id);
      if (index >= 0) games[index] = game;
      else games.push(game);
      writeGames();
      upsertTeamState("game:" + game.id, "game", game);
      renderGames();
      updateGameMatches();
      initializeApplicationWorkflows(teamStateRecords);
      renderOperations();
      resetGameForm();
    });

    gameCancel?.addEventListener("click", resetGameForm);
    gamesList?.addEventListener("click", (event) => {
      const button = event.target.closest("button");
      if (!button) return;
      const editId = button.dataset.gameEdit;
      const deleteId = button.dataset.gameDelete;
      const focusId = button.dataset.gameFocus;
      if (focusId) {
        focusedGameId = focusedGameId === focusId ? "" : focusId;
        renderGames();
        updateGameMatches();
        document.querySelector("#events")?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
        return;
      }
      if (editId) {
        const game = games.find((item) => item.id === editId);
        if (!game) return;
        gameIdInput.value = game.id;
        gameNameInput.value = game.name;
        gameAppIdInput.value = game.appId;
        gameTagsInput.value = game.tags.join(", ");
        gameDemoInput.value = game.demoStatus;
        gameReleaseInput.value = game.releaseStatus;
        gameLocalInput.value = game.localMultiplayer ? "yes" : "no";
        selectedSteamDetails = {
          capsuleImageUrl: game.capsuleImageUrl,
          nextFestHistory: game.nextFestHistory,
        };
        gameCancel.hidden = false;
        gameForm.querySelector("[data-game-submit]").textContent =
          localized("Değişiklikleri kaydet", "Save changes");
        gameNameInput.focus();
        gameForm.scrollIntoView({ behavior: "smooth", block: "center" });
      }
      if (deleteId) {
        const game = games.find((item) => item.id === deleteId);
        if (
          !game ||
          !window.confirm(
            game.name +
              localized(
                " oyun profili silinsin mi?",
                " game profile should be deleted?",
              ),
          )
        ) {
          return;
        }
        games = games.filter((item) => item.id !== deleteId);
        writeGames();
        removeTeamState("game:" + deleteId);
        renderGames();
        updateGameMatches();
        initializeApplicationWorkflows(teamStateRecords);
        renderOperations();
        if (gameIdInput.value === deleteId) resetGameForm();
      }
    });

    const timeline = document.querySelector("[data-event-timeline]");
    if (timeline) {
      const months = [...timeline.querySelectorAll("[data-timeline-month]")];
      const previous = timeline.querySelector("[data-timeline-previous]");
      const next = timeline.querySelector("[data-timeline-next]");
      const range = timeline.querySelector("[data-timeline-range]");
      let timelinePageSize = 0;

      function updateTimeline() {
        const pageSize = window.matchMedia("(min-width: 761px)").matches ? 6 : 2;
        if (pageSize !== timelinePageSize) {
          timelineOffset = Math.floor(timelineOffset / pageSize) * pageSize;
          timelinePageSize = pageSize;
        }
        const maximumOffset = Math.max(0, months.length - pageSize);
        timelineOffset = Math.min(timelineOffset, maximumOffset);
        months.forEach((month, index) => {
          month.hidden = index < timelineOffset || index >= timelineOffset + pageSize;
        });
        previous.disabled = timelineOffset === 0;
        next.disabled = timelineOffset >= maximumOffset;
        const firstHeading = months[timelineOffset]?.querySelector("h2")?.textContent || "";
        const lastIndex = Math.min(timelineOffset + pageSize - 1, months.length - 1);
        const lastHeading = months[lastIndex]?.querySelector("h2")?.textContent || "";
        range.textContent = firstHeading + " – " + lastHeading;
      }

      previous.addEventListener("click", () => {
        timelineOffset = Math.max(0, timelineOffset - timelinePageSize);
        updateTimeline();
        writeUrlState();
      });
      next.addEventListener("click", () => {
        timelineOffset = Math.min(
          months.length - timelinePageSize,
          timelineOffset + timelinePageSize,
        );
        updateTimeline();
        writeUrlState();
      });
      window.addEventListener("resize", updateTimeline);
      updateTimeline();

      timeline.querySelectorAll(".timeline-chip").forEach((chip) => {
        chip.addEventListener("click", (event) => {
          const targetId = chip.getAttribute("href")?.slice(1);
          const target = targetId ? document.getElementById(targetId) : null;
          if (!target) return;
          event.preventDefault();
          activeEventId = targetId.slice("etkinlik-".length);
          if (target.hidden) {
            search.value = "";
            filter = "all";
            gamesOnly = false;
            registrationOnly = false;
            incompleteOnly = false;
            setToggleState(gamesFilter, false);
            setToggleState(registrationFilter, false);
            setToggleState(incompleteFilter, false);
            buttons.forEach((button) => {
              const active = button.dataset.filter === "all";
              setToggleState(button, active);
            });
            apply();
          }
          target.classList.remove("timeline-highlight");
          void target.offsetWidth;
          target.classList.add("timeline-highlight");
          target.scrollIntoView({
            behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
              ? "auto"
              : "smooth",
            block: "center",
          });
          writeUrlState();
          window.setTimeout(
            () => target.classList.remove("timeline-highlight"),
            2000,
          );
        });
      });
    }

    const applicationStorageKey = "steam-etkinlik-radari-basvurular-v1";
    const applicationWorkflows = [
      ...document.querySelectorAll("[data-application-workflow]"),
    ];
    const applicationStatusLabels = {
      not_started: { tr: "Başlanmadı", en: "Not started" },
      preparing: { tr: "Hazırlanıyor", en: "Preparing" },
      submitted: { tr: "Gönderildi", en: "Submitted" },
      accepted: { tr: "Kabul edildi", en: "Accepted" },
      rejected: { tr: "Reddedildi", en: "Rejected" },
      not_applicable: { tr: "Uygun değil", en: "Not applicable" },
    };

    function readApplications() {
      try {
        const parsed = JSON.parse(
          localStorage.getItem(applicationStorageKey) || "{}",
        );
        return parsed && typeof parsed === "object" && !Array.isArray(parsed)
          ? parsed
          : {};
      } catch {
        return {};
      }
    }

    function writeApplications() {
      try {
        localStorage.setItem(applicationStorageKey, JSON.stringify(applications));
      } catch {}
    }

    function applicationKey(eventId, gameId) {
      return eventId + ":" + gameId;
    }

    function showApplication(workflow) {
      const eventId = workflow.dataset.eventId;
      const gameSelect = workflow.querySelector("[data-application-game]");
      const record = applications[applicationKey(eventId, gameSelect.value)] || {};
      workflow.querySelector("[data-application-status]").value =
        record.status || "not_started";
      workflow.querySelector("[data-application-owner]").value =
        record.owner || "";
      workflow.querySelector("[data-application-note]").value =
        record.note || "";
      const label = applicationStatusLabels[record.status || "not_started"];
      workflow.querySelector("[data-application-summary]").textContent =
        label?.[descriptionLanguage] ||
        localized("Durum girilmedi", "No status");
    }

    function initializeApplicationWorkflows(records = []) {
      applications = readApplications();
      records
        .filter((record) => record.type === "application")
        .forEach((record) => {
          const key = String(record.key || "").slice("application:".length);
          const local = applications[key] || {};
          if (key) applications[key] = { ...local, ...record.payload };
        });
      writeApplications();
      applicationWorkflows.forEach((workflow) => {
        const select = workflow.querySelector("[data-application-game]");
        const previous = select.value;
        select.replaceChildren();
        games.forEach((game) => {
          const option = document.createElement("option");
          option.value = game.id;
          option.textContent = game.name;
          select.append(option);
        });
        workflow.hidden = games.length === 0;
        if (games.some((game) => game.id === previous)) select.value = previous;
        showApplication(workflow);
      });
    }

    applicationWorkflows.forEach((workflow) => {
      workflow
        .querySelector("[data-application-game]")
        ?.addEventListener("change", () => showApplication(workflow));
      workflow
        .querySelector("[data-application-save]")
        ?.addEventListener("click", () => {
          const eventId = workflow.dataset.eventId;
          const gameId = workflow.querySelector("[data-application-game]").value;
          if (!gameId) return;
          const record = {
            eventId,
            gameId,
            status: workflow.querySelector("[data-application-status]").value,
            owner: workflow
              .querySelector("[data-application-owner]")
              .value.trim()
              .slice(0, 80),
            note: workflow
              .querySelector("[data-application-note]")
              .value.trim()
              .slice(0, 800),
          };
          applications[applicationKey(eventId, gameId)] = record;
          writeApplications();
          upsertTeamState(
            "application:" + applicationKey(eventId, gameId),
            "application",
            { eventId, gameId, status: record.status },
          );
          showApplication(workflow);
          workflow.querySelector("[data-application-message]").textContent =
            localized("Kaydedildi.", "Saved.");
          renderOperations();
        });
    });

    const notificationStorageKey =
      "steam-etkinlik-radari-bildirimler-v1";
    const notificationInputs = [
      ...document.querySelectorAll(
        "[data-notification-deadlines], [data-notification-changes], [data-notification-overdue]",
      ),
    ];
    let notificationPreferences = {};
    try {
      notificationPreferences = JSON.parse(
        localStorage.getItem(notificationStorageKey) || "{}",
      );
    } catch {}
    notificationInputs.forEach((input) => {
      const key = input.dataset.notificationDeadlines !== undefined
        ? "deadlines"
        : input.dataset.notificationChanges !== undefined
          ? "changes"
          : "overdue";
      if (typeof notificationPreferences[key] === "boolean") {
        input.checked = notificationPreferences[key];
      }
      input.addEventListener("change", () => {
        notificationPreferences[key] = input.checked;
        try {
          localStorage.setItem(
            notificationStorageKey,
            JSON.stringify(notificationPreferences),
          );
        } catch {}
        renderOperations();
      });
    });

    const taskStorageKey = "steam-etkinlik-radari-gorevler-v1";
    const taskBackupKey = "steam-etkinlik-radari-gorevler-v1-yedek";
    const taskGroups = [...document.querySelectorAll("[data-event-tasks]")];
    const taskBoxes = [...document.querySelectorAll("[data-task-id]")];
    const taskStateStatus = document.querySelector("[data-task-state-status]");
    const taskImportFile = document.querySelector("[data-task-import-file]");

    function normalizeTaskMap(value) {
      if (!value || typeof value !== "object" || Array.isArray(value)) return {};
      return Object.fromEntries(
        Object.entries(value).filter(([, completed]) => completed === true),
      );
    }

    function readTaskMap(key) {
      try {
        return normalizeTaskMap(JSON.parse(localStorage.getItem(key) || "{}"));
      } catch {
        return {};
      }
    }

    function writeTaskMap(key, value) {
      try {
        localStorage.setItem(key, JSON.stringify(value));
      } catch {}
    }

    function mergeTaskBackup(additions) {
      const backup = { ...readTaskMap(taskBackupKey), ...additions };
      if (Object.keys(backup).length > 0) writeTaskMap(taskBackupKey, backup);
      return backup;
    }

    const currentTaskIds = new Set(taskBoxes.map((box) => box.dataset.taskId));
    const aliasToCurrentId = new Map();
    taskBoxes.forEach((box) => {
      try {
        JSON.parse(box.dataset.taskAliases || "[]").forEach((alias) => {
          if (!aliasToCurrentId.has(alias)) {
            aliasToCurrentId.set(alias, box.dataset.taskId);
          }
        });
      } catch {}
    });

    function migrateTaskMap(source) {
      const active = {};
      const unmatched = {};
      let migratedCount = 0;
      Object.entries(normalizeTaskMap(source)).forEach(([taskId]) => {
        if (currentTaskIds.has(taskId)) {
          active[taskId] = true;
          return;
        }
        const currentId = aliasToCurrentId.get(taskId);
        if (currentId) {
          active[currentId] = true;
          migratedCount++;
        } else {
          unmatched[taskId] = true;
        }
      });
      return { active, unmatched, migratedCount };
    }

    const initialMigration = migrateTaskMap(readTaskMap(taskStorageKey));
    let completedTasks = initialMigration.active;
    writeTaskMap(taskStorageKey, completedTasks);
    mergeTaskBackup(initialMigration.unmatched);

    function updateTaskProgress(group) {
      const boxes = [...group.querySelectorAll("[data-task-id]")];
      const done = boxes.filter((box) => box.checked).length;
      const progress = group.querySelector("[data-task-progress]");
      if (progress) {
        progress.textContent =
          done +
          "/" +
          boxes.length +
          localized(" tamamlandı", " completed");
      }
      const allComplete = boxes.length > 0 && done === boxes.length;
      const eventRow = group.closest(".event-row");
      eventRow?.classList.toggle("tasks-complete", allComplete);
      if (eventRow?.id) {
        document.querySelectorAll(".timeline-chip").forEach((chip) => {
          if (chip.getAttribute("href") !== "#" + eventRow.id) return;
          chip.classList.toggle("tasks-complete", allComplete);
          chip.dataset.completeLabel = localized(
            "✓ Tamamlandı",
            "✓ Completed",
          );
          chip.dataset.taskAriaSuffix = allComplete
            ? localized(" (tamamlandı)", " (completed)")
            : "";
          refreshTimelineChipAria(chip);
        });
      }
    }

    function syncTaskUi() {
      taskBoxes.forEach((box) => {
        box.checked = Boolean(completedTasks[box.dataset.taskId]);
      });
      taskGroups.forEach(updateTaskProgress);
      renderOperations();
      apply();
    }

    function renderOperations() {
      const completedCount = Object.keys(completedTasks || {}).length;
      const totalTasks = taskBoxes.length;
      const incompleteCount = Math.max(0, totalTasks - completedCount);
      const activeApplications = Object.values(applications).filter(
        (record) =>
          record && ["preparing", "submitted"].includes(record.status),
      );
      document.querySelector("[data-operation-tasks]").textContent =
        String(incompleteCount);
      document.querySelector("[data-operation-applications]").textContent =
        String(activeApplications.length);
      document.querySelector("[data-metric-completion]").textContent =
        (totalTasks ? Math.round((completedCount / totalTasks) * 100) : 0) + "%";
      document.querySelector("[data-metric-submitted]").textContent = String(
        Object.values(applications).filter(
          (record) => record?.status === "submitted",
        ).length,
      );
      document.querySelector("[data-metric-accepted]").textContent = String(
        Object.values(applications).filter(
          (record) => record?.status === "accepted",
        ).length,
      );
      document.querySelector("[data-metric-games]").textContent =
        String(games.length);

      const inbox = document.querySelector("[data-operation-inbox]");
      inbox.replaceChildren();
      const items = [];
      if (notificationPreferences.deadlines !== false) {
        document
          .querySelectorAll(".timeline-item .countdown[data-days-left]")
          .forEach((countdown) => {
            const days = Number(countdown.dataset.daysLeft);
            if (days < 0 || days > 7 || items.length >= 4) return;
            const group = countdown.closest(".deadline-group");
            items.push({
              title:
                group?.querySelector(".deadline-group-head h3")?.textContent ||
                localized("Kritik tarih", "Critical deadline"),
              href: "#events",
              meta: countdown.textContent || "",
            });
          });
      }
      if (notificationPreferences.changes !== false) {
        document.querySelectorAll(".change-row").forEach((change) => {
          const detectedAt = Date.parse(
            change.querySelector("time")?.getAttribute("datetime") || "",
          );
          if (
            !Number.isFinite(detectedAt) ||
            Date.now() - detectedAt > 24 * 60 * 60 * 1000
          ) {
            return;
          }
          items.push({
            title:
              change.querySelector("strong")?.textContent ||
              localized("Valve takvim değişikliği", "Valve calendar change"),
            href: "#events",
            meta:
              change.querySelector(".change-type")?.textContent || "",
          });
        });
      }
      if (notificationPreferences.overdue !== false) {
        taskBoxes
          .filter((box) => !box.checked)
          .slice(0, 5)
          .forEach((box) => {
            const row = box.closest(".event-row");
            items.push({
              title:
                box.closest(".task-item")?.querySelector(".task-title strong")
                  ?.textContent || "",
              href: "#" + row.id,
              meta:
                row.querySelector(".event-heading h3")?.textContent || "",
            });
          });
      }
      activeApplications.slice(0, 3).forEach((record) => {
        const game = games.find((item) => item.id === record.gameId);
        const row = document.getElementById("etkinlik-" + record.eventId);
        items.push({
          title:
            (game?.name || localized("Oyun", "Game")) +
            localized(" başvurusu", " application"),
          href: row ? "#" + row.id : "#events",
          meta:
            applicationStatusLabels[record.status]?.[descriptionLanguage] || "",
        });
      });
      if (items.length === 0) {
        const message = document.createElement("span");
        message.textContent = localized(
          "Bugün için açık operasyon işi yok.",
          "No open operational work for today.",
        );
        inbox.append(message);
        return;
      }
      items.slice(0, 10).forEach((item) => {
        const operation = document.createElement("div");
        operation.className = "operation-item";
        const link = document.createElement("a");
        link.href = item.href;
        link.textContent = item.title;
        const meta = document.createElement("span");
        meta.textContent = item.meta;
        operation.append(link, meta);
        inbox.append(operation);
      });
    }

    taskGroups.forEach((group) => {
      const boxes = [...group.querySelectorAll("[data-task-id]")];
      boxes.forEach((box) => {
        box.addEventListener("change", () => {
          if (box.checked) completedTasks[box.dataset.taskId] = true;
          else delete completedTasks[box.dataset.taskId];
          writeTaskMap(taskStorageKey, completedTasks);
          upsertTeamState(
            "task:" + box.dataset.taskId,
            "task",
            { completed: box.checked },
          );
          updateTaskProgress(group);
          renderOperations();
          apply();
        });
      });
    });
    syncTaskUi();
    initializeApplicationWorkflows(teamStateRecords);
    renderOperations();
    teamStatePromise.then((records) => {
      records
        .filter((record) => record.type === "task")
        .forEach((record) => {
          const taskId = record.key.slice("task:".length);
          if (record.payload?.completed === true) completedTasks[taskId] = true;
          if (record.payload?.completed === false) delete completedTasks[taskId];
        });
      writeTaskMap(taskStorageKey, completedTasks);
      syncTaskUi();
      renderOperations();
    });

    document
      .querySelector("[data-team-refresh]")
      ?.addEventListener("click", async () => {
        const records = await loadTeamState();
        initializeApplicationWorkflows(records);
        records
          .filter((record) => record.type === "task")
          .forEach((record) => {
            if (record.payload?.completed === true) {
              completedTasks[record.key.slice("task:".length)] = true;
            }
          });
        writeTaskMap(taskStorageKey, completedTasks);
        syncTaskUi();
        renderOperations();
      });

    if (activeEventId) {
      const activeEvent = document.getElementById("etkinlik-" + activeEventId);
      if (activeEvent) {
        window.setTimeout(() => {
          activeEvent.scrollIntoView({
            behavior: "auto",
            block: "center",
          });
          activeEvent.classList.add("timeline-highlight");
          window.setTimeout(
            () => activeEvent.classList.remove("timeline-highlight"),
            2000,
          );
        }, 0);
      }
    }

    const migrationMessages = [];
    if (initialMigration.migratedCount > 0) {
      migrationMessages.push(
        initialMigration.migratedCount + " eski görev durumu taşındı.",
      );
    }
    const unmatchedCount = Object.keys(initialMigration.unmatched).length;
    if (unmatchedCount > 0) {
      migrationMessages.push(unmatchedCount + " kayıt yedekte korundu.");
    }
    taskStateStatus.textContent = migrationMessages.join(" ");

    document.querySelector("[data-task-export]")?.addEventListener("click", () => {
      const payload = {
        version: 2,
        exportedAt: new Date().toISOString(),
        completedTasks,
        backup: readTaskMap(taskBackupKey),
        games,
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], {
        type: "application/json;charset=utf-8",
      });
      const objectUrl = URL.createObjectURL(blob);
      const download = document.createElement("a");
      download.href = objectUrl;
      download.download =
        "steam-gorev-durumu-" + new Date().toISOString().slice(0, 10) + ".json";
      document.body.append(download);
      download.click();
      download.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
      taskStateStatus.textContent = "Görev durumu JSON olarak indirildi.";
    });

    document.querySelector("[data-task-import]")?.addEventListener("click", () => {
      taskImportFile.click();
    });

    taskImportFile?.addEventListener("change", async () => {
      const file = taskImportFile.files?.[0];
      if (!file) return;
      try {
        const payload = JSON.parse(await file.text());
        const source =
          payload &&
          typeof payload === "object" &&
          !Array.isArray(payload) &&
          "completedTasks" in payload
            ? payload.completedTasks
            : payload;
        if (!source || typeof source !== "object" || Array.isArray(source)) {
          throw new Error("invalid task state");
        }
        const incoming = normalizeTaskMap(source);
        const count = Object.keys(incoming).length;
        const hasImportedGames =
          payload &&
          typeof payload === "object" &&
          Array.isArray(payload.games);
        const importedGames = hasImportedGames
          ? normalizeGames(payload.games)
          : [];
        if (
          !window.confirm(
            "Bu dosyadaki " +
              count +
              " tamamlanmış görev durumu" +
              (hasImportedGames
                ? " ve " + importedGames.length + " oyun profili"
                : "") +
              " uygulansın mı? Mevcut durum değiştirilecek.",
          )
        ) {
          return;
        }
        const migration = migrateTaskMap(incoming);
        completedTasks = migration.active;
        writeTaskMap(taskStorageKey, completedTasks);
        mergeTaskBackup({
          ...normalizeTaskMap(payload?.backup),
          ...migration.unmatched,
        });
        if (hasImportedGames) {
          games = importedGames;
          writeGames();
          renderGames();
          updateGameMatches();
          resetGameForm();
        }
        syncTaskUi();
        taskStateStatus.textContent =
          Object.keys(completedTasks).length +
          " görev durumu" +
          (hasImportedGames ? " ve " + games.length + " oyun profili" : "") +
          " içe aktarıldı." +
          (Object.keys(migration.unmatched).length > 0
            ? " Eşleşmeyenler yedekte korundu."
            : "");
      } catch {
        taskStateStatus.textContent =
          "Görev durumu dosyası okunamadı veya geçersiz.";
      } finally {
        taskImportFile.value = "";
      }
    });

    document.querySelector("[data-task-reset]")?.addEventListener("click", () => {
      if (
        !window.confirm(
          "Tüm görev işaretleri ve yedeklenen eski kayıtlar sıfırlansın mı?",
        )
      ) {
        return;
      }
      completedTasks = {};
      try {
        localStorage.removeItem(taskStorageKey);
        localStorage.removeItem(taskBackupKey);
      } catch {}
      syncTaskUi();
      taskStateStatus.textContent = "Tüm görev durumları sıfırlandı.";
    });
  </script>
</body>
</html>`;
  return html.replace(/[ \t]+$/gm, "");
}

export async function writeReport(snapshot: EventSnapshot): Promise<string> {
  await mkdir(paths.outDir, { recursive: true });
  const report = renderReport(
    snapshot,
    await readChangelog(paths.changelog),
  );
  await Promise.all([
    writeFile(paths.pagesFallback, report, "utf8"),
    writeFile(paths.report, report, "utf8"),
    writeFile(paths.publicIndex, report, "utf8"),
    writeFile(paths.calendarIcs, createCalendarIcs(snapshot), "utf8"),
    writeFile(paths.noJekyll, "", "utf8"),
  ]);
  return path.resolve(paths.report);
}
