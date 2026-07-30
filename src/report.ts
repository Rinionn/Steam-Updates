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

function localDate(isoDate: string, withTime = false): string {
  const date = DateTime.fromISO(isoDate, { zone: "utc" })
    .setZone(config.timezone)
    .setLocale("tr");
  return date.toFormat(withTime ? "d LLLL yyyy, HH:mm" : "d LLL yyyy");
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
        ? `Yeni: ${after}`
        : before
          ? `Önceki: ${before}`
          : "";
  return `
    <div class="change-row">
      <time datetime="${escapeHtml(record.detectedAt)}">${escapeHtml(localDate(record.detectedAt, true))}</time>
      <strong>${escapeHtml(record.eventName)}</strong>
      <span class="change-type">${escapeHtml(changeKindLabels[record.kind])}</span>
      ${values ? `<span class="change-values">${values}</span>` : ""}
    </div>`;
}

function deadlineTimelineItem(item: DeadlineView): string {
  const { deadline, event, daysLeft } = item;
  const copy = deadlineCopy(deadline);
  return `
    <div class="timeline-item ${daysLeft <= 3 ? "critical" : ""}">
      <div class="timeline-date">
        <strong>${escapeHtml(localDate(deadline.dueAt, true))}</strong>
        <span class="countdown">${escapeHtml(urgencyText(daysLeft))}</span>
      </div>
      <div class="timeline-body">
        <span class="pill">${escapeHtml(copy.category)}</span>
        <h4>${escapeHtml(copy.title)}</h4>
        <p>${escapeHtml(copy.description)}</p>
      </div>
      <a
        class="timeline-source"
        href="${escapeHtml(deadline.sourceUrl)}"
        target="_blank"
        rel="noreferrer"
        aria-label="${escapeHtml(`${event.name} için kaynak sayfasını aç (yeni sekme)`)}"
      >Kaynak <span aria-hidden="true">↗</span></a>
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
        <span>${escapeHtml(localDate(event.startAt))} – ${escapeHtml(localDate(event.endAt))}</span>
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
        <strong>${escapeHtml(localDate(event.startAt))}</strong>
        <span>${escapeHtml(localDate(event.endAt))}</span>
      </div>
      <div class="event-main">
        <div class="event-heading">
          <span class="event-kind ${event.kind}"><span aria-hidden="true">${kindIcons[event.kind]}</span> ${escapeHtml(kindLabels[event.kind])}</span>
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
                    `<span>⏱ ${escapeHtml(localDate(deadline.dueAt))} · ${escapeHtml(
                      deadlineCopy(deadline).category,
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
        >
          ${event.registrationUrl ? "Kayıt sayfası" : "Detaylar"} <span aria-hidden="true">↗</span>
        </a>
        <button
          class="event-ics"
          type="button"
          data-ics="${escapeHtml(calendarPayload)}"
          aria-label="${escapeHtml(`${event.name} etkinliğini ICS olarak indir`)}"
        >Takvime ekle <span aria-hidden="true">↓</span></button>
      </div>
      ${
        tasks.length
          ? eventTaskDetails(event, tasks, changelog, openTasks)
          : ""
      }
    </article>`;
}

function eventTaskItem(task: EventTask, aliases: string[]): string {
  const due = task.dueAt
    ? `<time>${escapeHtml(localDate(task.dueAt, true))}</time>`
    : "";
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
          <strong>${escapeHtml(task.title)}</strong>
          <span class="task-level ${task.level === "Gerekli" ? "required" : ""}">${escapeHtml(task.level)}</span>
          ${due}
        </span>
        <span class="task-description">${escapeHtml(task.description)}</span>
      </label>
      <a
        href="${escapeHtml(task.href)}"
        target="_blank"
        rel="noreferrer"
        aria-label="${escapeHtml(`${task.title} görev bağlantısını aç (yeni sekme)`)}"
      >Aç <span aria-hidden="true">↗</span></a>
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
        <span>Görevler</span>
        <span class="task-progress" data-task-progress aria-live="polite">0/${tasks.length} tamamlandı</span>
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

export function renderReport(
  snapshot: EventSnapshot,
  changelog: ChangeRecord[] = [],
): string {
  const model = createReportModel(snapshot, config);
  const httpsCalendarUrl = new URL(
    "steam-etkinlikleri.ics",
    config.dashboardUrl.endsWith("/")
      ? config.dashboardUrl
      : `${config.dashboardUrl}/`,
  ).toString();
  const webcalCalendarUrl = httpsCalendarUrl.replace(/^https:/, "webcal:");
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
    .calendar-subscribe { display:grid; grid-template-columns:1fr; gap:9px; margin-top:18px; }
    .calendar-subscribe > a { justify-self:start; min-height:44px; padding:12px 14px; border-radius:11px; color:var(--color-on-accent); background:var(--gradient-brand); font-size:12px; font-weight:800; text-decoration:none; }
    .calendar-copy { display:grid; grid-template-columns:minmax(0,1fr) auto; gap:7px; min-width:0; }
    .calendar-copy input { min-width:0; width:100%; padding:10px 11px; border:1px solid var(--color-hero-line); border-radius:10px; color:var(--color-hero-copy); background:var(--color-hero-card); font-size:11px; }
    .calendar-copy button { min-height:40px; padding:8px 11px; color:var(--color-on-accent); border-color:var(--color-hero-line); background:var(--color-hero-card); font-size:11px; }
    .calendar-copy-status { min-height:1.4em; color:var(--color-hero-muted); font-size:10px; }
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
    .timeline-chip.tasks-complete::after { content:"✓ Tamamlandı"; display:block; margin-top:4px; font-size:9px; font-weight:800; }
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
    .game-profile { display:grid; grid-template-columns:minmax(0,1fr) auto; gap:10px; padding:12px; border:1px solid var(--color-line); border-radius:13px; background:var(--color-panel-subtle); }
    .game-profile strong,.game-profile small { display:block; overflow-wrap:anywhere; }
    .game-profile small { margin-top:4px; color:var(--color-muted); line-height:1.45; }
    .game-profile-actions { display:flex; align-items:flex-start; flex-wrap:wrap; gap:6px; }
    .game-profile-actions button { min-height:36px; padding:7px 10px; font-size:11px; }
    .game-profile-actions [data-game-delete] { color:var(--color-danger); }
    .game-match-result { display:flex; flex-wrap:wrap; gap:7px; margin-top:10px; }
    .game-match-result[hidden],.game-match-warning[hidden] { display:none; }
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
      .calendar-subscribe { grid-template-columns:auto minmax(0,1fr); align-items:start; }
      .calendar-copy-status { grid-column:2; }
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
      .task-state-toolbar { align-items:center; flex-direction:row; justify-content:space-between; }
      .task-state-status { text-align:right; }
      .event-row { grid-template-columns:145px minmax(0,1fr) auto; gap:20px; padding:20px; }
      .event-actions { justify-self:auto; flex-direction:column; }
      .event-action,.event-ics { white-space:nowrap; }
      .event-tasks { grid-column:2 / 4; }
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
      <div class="language-switch" role="group" aria-label="Festival açıklaması dili">
        <button class="active" type="button" data-language="tr" aria-pressed="true">TR</button>
        <button type="button" data-language="en" aria-pressed="false">EN</button>
      </div>
      <span class="eyebrow">Joygame Select · Steamworks Operasyonları</span>
      <h1>Steam Etkinlik<br>Radarı</h1>
      <p>Steam’in resmî takvimindeki festivalleri, sezon indirimlerini ve başvuru kilometre taşlarını Joygame Select operasyon görünümünde tek yerde takip et.</p>
      <div class="calendar-subscribe">
        <a href="${escapeHtml(webcalCalendarUrl)}" aria-label="Steam etkinlik takvimine takvim uygulamasıyla abone ol">Takvime abone ol</a>
        <div class="calendar-copy">
          <label class="sr-only" for="calendar-url">Takvim abonelik bağlantısı</label>
          <input id="calendar-url" type="url" value="${escapeHtml(httpsCalendarUrl)}" readonly>
          <button type="button" data-copy-calendar-url aria-label="Takvim abonelik bağlantısını kopyala">Kopyala</button>
        </div>
        <span class="calendar-copy-status" data-calendar-copy-status role="status" aria-live="polite"></span>
      </div>
      ${renderTimeline(model, config.timezone)}
    </section>

    <section class="section" aria-labelledby="games-heading">
      <div class="section-title">
        <h2 id="games-heading">Oyunlarım</h2>
        <p>Etiketleri birebir karşılaştırarak uygun olabilecek temalı festivalleri gösterir.</p>
      </div>
      <div class="games-panel">
        <form class="game-form" data-game-form>
          <input type="hidden" data-game-id>
          <div class="game-field">
            <label for="game-name">Oyun adı</label>
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
              <div class="steam-search-status" data-steam-search-status role="status" aria-live="polite">En az 2 karakter yazın.</div>
            </div>
          </div>
          <label class="game-field">
            Steam App ID <span>(opsiyonel)</span>
            <input type="text" data-game-app-id inputmode="numeric" pattern="[0-9]*" maxlength="12" autocomplete="off">
          </label>
          <label class="game-field game-field-wide">
            Steam etiketleri
            <input type="text" data-game-tags placeholder="Örn. Cyberpunk, Sci-fi, RPG" autocomplete="off">
          </label>
          <label class="game-field">
            Demo durumu
            <select data-game-demo-status>
              <option value="none">Yok</option>
              <option value="preparing">Hazırlanıyor</option>
              <option value="live">Yayında</option>
            </select>
          </label>
          <label class="game-field">
            Çıkış durumu
            <select data-game-release-status>
              <option value="unreleased">Yayınlanmadı</option>
              <option value="early_access">Erken erişim</option>
              <option value="released">Yayında</option>
            </select>
          </label>
          <label class="game-field">
            Yerel çok oyunculu
            <select data-game-local-multiplayer>
              <option value="no">Hayır</option>
              <option value="yes">Evet</option>
            </select>
          </label>
          <div class="game-form-actions">
            <button type="submit" data-game-submit>Oyunu kaydet</button>
            <button type="button" data-game-cancel hidden>Vazgeç</button>
          </div>
        </form>
        <p class="game-help">Etiket adlarını oyunun Steam mağaza sayfasındaki biçimiyle, virgülle ayırarak girin. Benzer kelimeler veya tahminler eşleşme sayılmaz.</p>
        <div class="game-list" data-games-list></div>
        <p class="game-match-summary" data-game-match-summary role="status" aria-live="polite">Eşleşme için oyun ekleyin.</p>
      </div>
    </section>

    <section class="section">
      <details class="change-log">
        <summary>
          <span>Son 90 günde ne değişti</span>
          <span class="change-count">${recentChanges.length} kayıt</span>
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
        <h2>Yaklaşan son tarihler</h2>
        <p>Etkinlik bazında yapılacaklar · İstanbul saatine göre</p>
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
        <h2>Etkinlik takvimi</h2>
        <p>Son güncelleme: ${escapeHtml(model.generated.setLocale("tr").toFormat("d LLLL yyyy, HH:mm"))}</p>
      </div>
      <div class="toolbar">
        <label class="sr-only" for="search">Etkinlik ara</label>
        <input class="search" id="search" type="search" placeholder="Etkinlik ara…" autocomplete="off">
        <div class="filters" role="group" aria-label="Etkinlik filtresi">
          <button class="active" type="button" data-filter="all" aria-pressed="true">Tümü</button>
          <button type="button" data-filter="themed_fest" aria-pressed="false">Festivaller</button>
          <button type="button" data-filter="next_fest" aria-pressed="false">Next Fest</button>
          <button type="button" data-filter="seasonal_sale" aria-pressed="false">İndirimler</button>
        </div>
        <div class="status-filters" role="group" aria-label="Durum filtresi">
          <button type="button" data-registration-filter aria-pressed="false">Başvurusu hâlâ açık olanlar</button>
          <button type="button" data-incomplete-filter aria-pressed="false">Tamamlanmamış görevi olanlar</button>
          <button class="games-only-filter" type="button" data-games-filter aria-pressed="false">★ Sadece oyunlarımla eşleşenler</button>
        </div>
      </div>
      <div class="task-state-toolbar">
        <div class="task-state-actions" role="group" aria-label="Görev durumunu yönet">
          <button type="button" data-task-export>Durumu dışa aktar</button>
          <button type="button" data-task-import>Durumu içe aktar</button>
          <button type="button" data-task-reset>Tümünü sıfırla</button>
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
      <div class="empty" id="no-results" role="status" aria-live="polite" hidden>Bu filtrelerle eşleşen etkinlik yok.</div>
    </section>
    <footer>Joygame Select · Steam Operasyonları · Kaynak: Valve Steamworks dokümantasyonu · Bu rapor salt okunur çalışır.</footer>
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

    function applyDescriptionLanguage() {
      document.querySelectorAll("[data-event-description]").forEach((copy) => {
        copy.textContent =
          descriptionLanguage === "en"
            ? copy.dataset.descriptionEn
            : copy.dataset.descriptionTr;
        copy.lang = descriptionLanguage;
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
      });
    });
    applyDescriptionLanguage();

    const calendarUrlInput = document.querySelector("#calendar-url");
    const copyCalendarUrl = document.querySelector("[data-copy-calendar-url]");
    const calendarCopyStatus = document.querySelector("[data-calendar-copy-status]");
    copyCalendarUrl?.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(calendarUrlInput.value);
      } catch {
        calendarUrlInput.select();
        document.execCommand("copy");
        calendarUrlInput.setSelectionRange(0, 0);
      }
      calendarCopyStatus.textContent = "Bağlantı kopyalandı.";
    });

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
    let steamOptions = [];

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

    function selectSteamGame(option) {
      gameNameInput.value = option.name;
      gameAppIdInput.value = option.appId;
      gameNameInput.dataset.selectedSteamName = option.name;
      gameNameInput.dataset.selectedSteamAppId = option.appId;
      closeSteamResults();
      steamSearchStatus.textContent =
        option.name + " seçildi · App ID " + option.appId;
      gameTagsInput.focus();
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
          "Steam araması Cloudflare üzerindeki çevrimiçi panelde çalışır.";
        return;
      }
      steamSearchController?.abort();
      steamSearchController = new AbortController();
      steamSearchStatus.textContent = "Steam’de aranıyor…";
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
          ? options.length + " Steam sonucu bulundu."
          : "Steam’de eşleşen oyun bulunamadı.";
      } catch (error) {
        if (error?.name === "AbortError") return;
        closeSteamResults();
        steamSearchStatus.textContent =
          "Steam araması şu anda kullanılamıyor; manuel giriş yapabilirsiniz.";
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
      }
      window.clearTimeout(steamSearchTimer);
      steamSearchController?.abort();
      if (query.length < 2) {
        closeSteamResults();
        steamSearchStatus.textContent = "En az 2 karakter yazın.";
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
      none: "Demo yok",
      preparing: "Demo hazırlanıyor",
      live: "Demo yayında",
    };
    const releaseLabels = {
      unreleased: "Yayınlanmadı",
      early_access: "Erken erişim",
      released: "Yayında",
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
      parts.push(demoLabels[game.demoStatus]);
      parts.push(releaseLabels[game.releaseStatus]);
      parts.push(
        game.localMultiplayer
          ? "Yerel çok oyunculu: Evet"
          : "Yerel çok oyunculu: Hayır",
      );
      return parts.join(" · ");
    }

    function renderGames() {
      gamesList.replaceChildren();
      games.forEach((game) => {
        const item = document.createElement("article");
        item.className = "game-profile";

        const body = document.createElement("div");
        const name = document.createElement("strong");
        name.textContent = game.name;
        const meta = document.createElement("small");
        meta.textContent = gameMeta(game);
        const tags = document.createElement("small");
        tags.textContent = game.tags.length
          ? "Etiketler: " + game.tags.join(", ")
          : "Etiket girilmedi";
        body.append(name, meta, tags);

        const actions = document.createElement("div");
        actions.className = "game-profile-actions";
        const edit = document.createElement("button");
        edit.type = "button";
        edit.dataset.gameEdit = game.id;
        edit.textContent = "Düzenle";
        edit.setAttribute("aria-label", game.name + " oyununu düzenle");
        const remove = document.createElement("button");
        remove.type = "button";
        remove.dataset.gameDelete = game.id;
        remove.textContent = "Sil";
        remove.setAttribute("aria-label", game.name + " oyununu sil");
        actions.append(edit, remove);
        item.append(body, actions);
        gamesList.append(item);
      });
    }

    function resetGameForm() {
      gameForm.reset();
      gameIdInput.value = "";
      delete gameNameInput.dataset.selectedSteamName;
      delete gameNameInput.dataset.selectedSteamAppId;
      closeSteamResults();
      steamSearchStatus.textContent = "En az 2 karakter yazın.";
      gameCancel.hidden = true;
      gameForm.querySelector("[data-game-submit]").textContent = "Oyunu kaydet";
    }

    function matchingGamesForRow(row) {
      if (row.dataset.kind === "next_fest") {
        return games
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
      return games
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
      const badge = document.createElement("span");
      badge.className = "game-match-badge";
      badge.textContent = match.nextFest
        ? "★ " + match.game.name + " · Next Fest adayı"
        : "★ " +
          match.game.name +
          " · " +
          match.score +
          (match.score === 1 ? " etiket" : " etiket");
      badge.setAttribute(
        "aria-label",
        match.nextFest
          ? match.game.name + " Next Fest çıkış kuralını karşılıyor"
          : match.game.name + ", " + match.score + " birebir etiket eşleşmesi",
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
                  ": Next Fest için çıkış durumu “Yayınlanmadı” olmalı.",
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
        gameMatchSummary.textContent = "Eşleşme için oyun ekleyin.";
      } else if (matchedEventCount === 0) {
        gameMatchSummary.textContent = "Eşleşme bulunamadı.";
      } else {
        gameMatchSummary.textContent =
          matchedEventCount + " etkinlikte eşleşme bulundu.";
      }
      apply();
    }

    let games = readGames();
    renderGames();
    updateGameMatches();

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
      };
      const index = games.findIndex((item) => item.id === game.id);
      if (index >= 0) games[index] = game;
      else games.push(game);
      writeGames();
      renderGames();
      updateGameMatches();
      resetGameForm();
    });

    gameCancel?.addEventListener("click", resetGameForm);
    gamesList?.addEventListener("click", (event) => {
      const button = event.target.closest("button");
      if (!button) return;
      const editId = button.dataset.gameEdit;
      const deleteId = button.dataset.gameDelete;
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
        gameCancel.hidden = false;
        gameForm.querySelector("[data-game-submit]").textContent =
          "Değişiklikleri kaydet";
        gameNameInput.focus();
        gameForm.scrollIntoView({ behavior: "smooth", block: "center" });
      }
      if (deleteId) {
        const game = games.find((item) => item.id === deleteId);
        if (!game || !window.confirm(game.name + " oyun profili silinsin mi?")) {
          return;
        }
        games = games.filter((item) => item.id !== deleteId);
        writeGames();
        renderGames();
        updateGameMatches();
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
      if (progress) progress.textContent = done + "/" + boxes.length + " tamamlandı";
      const allComplete = boxes.length > 0 && done === boxes.length;
      const eventRow = group.closest(".event-row");
      eventRow?.classList.toggle("tasks-complete", allComplete);
      if (eventRow?.id) {
        document.querySelectorAll(".timeline-chip").forEach((chip) => {
          if (chip.getAttribute("href") !== "#" + eventRow.id) return;
          chip.classList.toggle("tasks-complete", allComplete);
          chip.dataset.taskAriaSuffix = allComplete ? " (tamamlandı)" : "";
          refreshTimelineChipAria(chip);
        });
      }
    }

    function syncTaskUi() {
      taskBoxes.forEach((box) => {
        box.checked = Boolean(completedTasks[box.dataset.taskId]);
      });
      taskGroups.forEach(updateTaskProgress);
      apply();
    }

    taskGroups.forEach((group) => {
      const boxes = [...group.querySelectorAll("[data-task-id]")];
      boxes.forEach((box) => {
        box.addEventListener("change", () => {
          if (box.checked) completedTasks[box.dataset.taskId] = true;
          else delete completedTasks[box.dataset.taskId];
          writeTaskMap(taskStorageKey, completedTasks);
          updateTaskProgress(group);
          apply();
        });
      });
    });
    syncTaskUi();

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
