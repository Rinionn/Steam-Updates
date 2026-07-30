import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { DateTime } from "luxon";
import { config, paths } from "./config.js";
import { deadlineCopy } from "./deadline-copy.js";
import { buildEventTasks, type EventTask } from "./event-tasks.js";
import type { EventSnapshot, SteamEvent } from "./types.js";
import { escapeHtml } from "./utils.js";
import { createReportModel, type DeadlineView } from "./view-model.js";

const kindLabels: Record<SteamEvent["kind"], string> = {
  seasonal_sale: "Sezon İndirimi",
  themed_fest: "Temalı Festival",
  next_fest: "Next Fest",
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
      <a class="timeline-source" href="${escapeHtml(deadline.sourceUrl)}" target="_blank" rel="noreferrer">Kaynak ↗</a>
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

function eventRow(event: SteamEvent, openTasks = false): string {
  const tasks = buildEventTasks(event);
  const search = `${event.name} ${kindLabels[event.kind]} ${event.description || ""}`.toLocaleLowerCase(
    "tr",
  );
  const actionUrl = event.registrationUrl || event.detailsUrl || event.sourceUrl;
  return `
    <article class="event-row" data-kind="${event.kind}" data-search="${escapeHtml(search)}">
      <div class="event-date">
        <strong>${escapeHtml(localDate(event.startAt))}</strong>
        <span>${escapeHtml(localDate(event.endAt))}</span>
      </div>
      <div class="event-main">
        <div class="event-heading">
          <span class="event-kind ${event.kind}">${escapeHtml(kindLabels[event.kind])}</span>
          <h3>${escapeHtml(event.name)}</h3>
        </div>
        ${event.description ? `<p>${escapeHtml(event.description)}</p>` : ""}
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
      </div>
      <a class="event-action" href="${escapeHtml(actionUrl)}" target="_blank" rel="noreferrer">
        ${event.registrationUrl ? "Kayıt sayfası" : "Detaylar"} ↗
      </a>
      ${tasks.length ? eventTaskDetails(event, tasks, openTasks) : ""}
    </article>`;
}

function eventTaskItem(task: EventTask): string {
  const due = task.dueAt
    ? `<time>${escapeHtml(localDate(task.dueAt, true))}</time>`
    : "";
  return `
    <div class="task-item">
      <input type="checkbox" id="${escapeHtml(task.id)}" data-task-id="${escapeHtml(task.id)}">
      <label for="${escapeHtml(task.id)}">
        <span class="task-title">
          <strong>${escapeHtml(task.title)}</strong>
          <span class="task-level ${task.level === "Gerekli" ? "required" : ""}">${escapeHtml(task.level)}</span>
          ${due}
        </span>
        <span class="task-description">${escapeHtml(task.description)}</span>
      </label>
      <a href="${escapeHtml(task.href)}" target="_blank" rel="noreferrer">Aç ↗</a>
    </div>`;
}

function eventTaskDetails(
  event: SteamEvent,
  tasks: EventTask[],
  openTasks: boolean,
): string {
  return `
    <details class="event-tasks" data-event-tasks="${escapeHtml(event.id)}"${openTasks ? " open" : ""}>
      <summary>
        <span>Görevler</span>
        <span class="task-progress" data-task-progress>0/${tasks.length} tamamlandı</span>
      </summary>
      <div class="task-list">${tasks.map(eventTaskItem).join("")}</div>
    </details>`;
}

export function renderReport(snapshot: EventSnapshot): string {
  const model = createReportModel(snapshot, config);
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
  const upcomingThisMonth = model.events.filter((event) => {
    const start = DateTime.fromISO(event.startAt, { zone: "utc" }).setZone(
      config.timezone,
    );
    return start.month === model.generated.month && start.year === model.generated.year;
  }).length;

  return `<!doctype html>
<html lang="tr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Steam Etkinlik Radarı</title>
  <style>
    :root {
      color-scheme: dark;
      --ink: #f5f7fa;
      --muted: #9ba9b8;
      --panel: rgba(25, 35, 46, .88);
      --line: rgba(157, 178, 199, .16);
      --lime: #b7e445;
      --cyan: #59c7e8;
      --amber: #ffbc42;
      --red: #ff6b6b;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      color: var(--ink);
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
      background:
        radial-gradient(circle at 10% 5%, rgba(89,199,232,.16), transparent 32rem),
        radial-gradient(circle at 90% 20%, rgba(183,228,69,.10), transparent 30rem),
        #0b1118;
    }
    a { color: inherit; }
    .shell { width: min(1180px, calc(100% - 32px)); margin: 0 auto; padding: 48px 0 72px; }
    .hero {
      position: relative;
      overflow: hidden;
      padding: 34px;
      border: 1px solid var(--line);
      border-radius: 26px;
      background: linear-gradient(135deg, rgba(29,45,60,.96), rgba(13,20,28,.92));
      box-shadow: 0 24px 80px rgba(0,0,0,.26);
    }
    .eyebrow { color: var(--lime); font-weight: 800; letter-spacing: .14em; text-transform: uppercase; font-size: 12px; }
    h1 { margin: 12px 0 10px; font-size: clamp(36px, 7vw, 70px); line-height: .98; letter-spacing: -.055em; }
    .hero p { max-width: 690px; color: #b8c4cf; font-size: 17px; line-height: 1.65; margin: 0; }
    .stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; margin-top: 28px; }
    .stat { padding: 18px; border: 1px solid var(--line); border-radius: 16px; background: rgba(3,8,13,.28); }
    .stat strong { display:block; font-size: 30px; }
    .stat span { color: var(--muted); font-size: 13px; }
    .section { margin-top: 38px; }
    .section-title { display:flex; align-items:end; justify-content:space-between; gap:16px; margin-bottom:15px; }
    .section-title h2 { margin:0; font-size:26px; letter-spacing:-.025em; }
    .section-title p { margin:0; color:var(--muted); font-size:13px; }
    .deadline-groups { display:grid; gap:14px; }
    .deadline-group { overflow:hidden; border:1px solid var(--line); border-radius:20px; background:var(--panel); }
    .deadline-group-head { display:flex; align-items:center; justify-content:space-between; gap:18px; padding:20px; background:rgba(255,255,255,.025); border-bottom:1px solid var(--line); }
    .deadline-group-head > div { display:flex; align-items:center; gap:10px; flex-wrap:wrap; }
    .deadline-group-head h3 { margin:0; font-size:21px; }
    .deadline-group-head > span { color:var(--muted); font-size:13px; white-space:nowrap; }
    .timeline { padding:0 20px; }
    .timeline-item { display:grid; grid-template-columns:190px minmax(0,1fr) auto; gap:20px; align-items:center; padding:18px 0; border-bottom:1px solid var(--line); }
    .timeline-item:last-child { border-bottom:0; }
    .timeline-date strong,.timeline-date span { display:block; }
    .timeline-date strong { font-size:14px; }
    .timeline-date .countdown { margin-top:5px; }
    .timeline-body h4 { margin:8px 0 4px; font-size:16px; }
    .timeline-body p { margin:0; color:var(--muted); font-size:13px; line-height:1.45; }
    .timeline-source { color:var(--cyan); text-decoration:none; font-size:12px; white-space:nowrap; }
    .timeline-item.critical .countdown { color:var(--red); }
    .event-heading,.toolbar { display:flex; align-items:center; gap:10px; }
    .pill,.event-kind { border-radius:999px; padding:5px 9px; font-size:11px; font-weight:800; letter-spacing:.05em; text-transform:uppercase; }
    .pill { color:#18130b; background:var(--amber); }
    .countdown { color:var(--amber); font-weight:800; }
    .toolbar { margin-bottom:14px; flex-wrap:wrap; }
    .search {
      flex:1 1 260px; min-width:0; padding:12px 14px; border:1px solid var(--line);
      border-radius:12px; color:var(--ink); background:#111a24; outline:none;
    }
    .filters { display:flex; gap:8px; flex-wrap:wrap; }
    button { border:1px solid var(--line); border-radius:999px; padding:10px 13px; color:#c4cfda; background:#111a24; cursor:pointer; }
    button.active { color:#10160b; border-color:var(--lime); background:var(--lime); font-weight:800; }
    .event-list { border:1px solid var(--line); border-radius:20px; overflow:hidden; background:var(--panel); }
    .event-row { display:grid; grid-template-columns:145px minmax(0,1fr) auto; gap:20px; align-items:center; padding:20px; border-bottom:1px solid var(--line); }
    .event-row:last-child { border-bottom:0; }
    .event-row[hidden] { display:none; }
    .event-date strong,.event-date span { display:block; }
    .event-date strong { color:var(--ink); font-size:14px; }
    .event-date span { margin-top:4px; color:var(--muted); font-size:12px; }
    .event-heading { align-items:baseline; flex-wrap:wrap; }
    .event-heading h3 { margin:0; font-size:19px; }
    .event-kind { color:#0a141a; background:var(--cyan); }
    .event-kind.seasonal_sale { background:var(--lime); }
    .event-kind.next_fest { background:var(--amber); }
    .event-main p { margin:8px 0 0; color:var(--muted); font-size:14px; line-height:1.45; }
    .mini-deadlines { display:flex; gap:8px; flex-wrap:wrap; margin-top:10px; }
    .mini-deadlines span { padding:5px 8px; border-radius:8px; color:#d2d9e0; background:rgba(255,255,255,.055); font-size:11px; }
    .event-action { padding:10px 12px; border:1px solid var(--line); border-radius:10px; color:var(--cyan); text-decoration:none; font-size:13px; white-space:nowrap; }
    .event-tasks { grid-column:2 / 4; margin-top:-4px; border:1px solid var(--line); border-radius:13px; background:rgba(4,9,14,.22); }
    .event-tasks summary { display:flex; align-items:center; justify-content:space-between; gap:12px; padding:11px 13px; color:#d6dee6; font-size:13px; font-weight:800; cursor:pointer; list-style:none; }
    .event-tasks summary::-webkit-details-marker { display:none; }
    .event-tasks summary::before { content:"＋"; color:var(--lime); }
    .event-tasks[open] summary::before { content:"−"; }
    .event-tasks summary > span:first-of-type { margin-right:auto; }
    .task-progress { color:var(--muted); font-size:11px; font-weight:600; }
    .task-list { padding:0 13px 4px; border-top:1px solid var(--line); }
    .task-item { display:grid; grid-template-columns:auto minmax(0,1fr) auto; gap:11px; align-items:start; padding:13px 0; border-bottom:1px solid var(--line); }
    .task-item:last-child { border-bottom:0; }
    .task-item input { width:17px; height:17px; margin:2px 0 0; accent-color:var(--lime); }
    .task-item label { min-width:0; cursor:pointer; }
    .task-title { display:flex; align-items:center; gap:7px; flex-wrap:wrap; }
    .task-title strong { font-size:13px; }
    .task-title time { color:var(--amber); font-size:11px; font-weight:700; }
    .task-level { padding:3px 6px; border-radius:999px; color:#aab7c4; background:rgba(255,255,255,.07); font-size:9px; font-weight:800; letter-spacing:.04em; text-transform:uppercase; }
    .task-level.required { color:#1a1204; background:var(--amber); }
    .task-description { display:block; margin-top:4px; color:var(--muted); font-size:12px; line-height:1.4; }
    .task-item > a { padding-top:2px; color:var(--cyan); text-decoration:none; font-size:11px; white-space:nowrap; }
    .task-item:has(input:checked) label { opacity:.55; }
    .task-item:has(input:checked) .task-title strong { text-decoration:line-through; }
    .empty { padding:24px; color:var(--muted); text-align:center; border:1px dashed var(--line); border-radius:16px; }
    footer { margin-top:28px; color:#758493; font-size:12px; text-align:center; }
    @media (max-width: 760px) {
      .shell { width:min(100% - 20px, 1180px); padding-top:20px; }
      .hero { padding:24px; }
      .stats { grid-template-columns:1fr; }
      .deadline-group-head { align-items:flex-start; flex-direction:column; }
      .timeline-item { grid-template-columns:1fr; gap:10px; }
      .timeline-source { justify-self:start; }
      .event-row { grid-template-columns:1fr; gap:12px; }
      .event-action { justify-self:start; }
      .event-tasks { grid-column:1; }
      .section-title { align-items:start; flex-direction:column; }
    }
  </style>
</head>
<body>
  <main class="shell">
    <section class="hero">
      <span class="eyebrow">Steamworks günlük takip</span>
      <h1>Etkinlik<br>Radarı</h1>
      <p>Steam’in resmî takviminden festivalleri, sezon indirimlerini ve başvuru kilometre taşlarını tek yerde takip et.</p>
      <div class="stats">
        <div class="stat"><strong>${model.events.length}</strong><span>yaklaşan etkinlik</span></div>
        <div class="stat"><strong>${model.urgentDeadlines.length}</strong><span>30 gün içindeki son tarih</span></div>
        <div class="stat"><strong>${upcomingThisMonth}</strong><span>bu ay başlayan</span></div>
      </div>
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
        <input class="search" id="search" type="search" placeholder="Etkinlik ara…" autocomplete="off">
        <div class="filters" aria-label="Etkinlik filtresi">
          <button class="active" data-filter="all">Tümü</button>
          <button data-filter="themed_fest">Festivaller</button>
          <button data-filter="next_fest">Next Fest</button>
          <button data-filter="seasonal_sale">İndirimler</button>
        </div>
      </div>
      <div class="event-list" id="events">${model.events
        .map((event, index) => eventRow(event, index === 0))
        .join("")}</div>
      <div class="empty" id="no-results" hidden>Bu filtrelerle eşleşen etkinlik yok.</div>
    </section>
    <footer>Kaynak: Valve Steamworks dokümantasyonu · Bu rapor salt okunur çalışır ve Steam hesabınızda işlem yapmaz.</footer>
  </main>
  <script>
    const buttons = [...document.querySelectorAll("[data-filter]")];
    const rows = [...document.querySelectorAll(".event-row")];
    const search = document.querySelector("#search");
    const empty = document.querySelector("#no-results");
    let filter = "all";
    function apply() {
      const query = search.value.trim().toLocaleLowerCase("tr");
      let visible = 0;
      rows.forEach((row) => {
        const matchKind = filter === "all" || row.dataset.kind === filter;
        const matchQuery = !query || row.dataset.search.includes(query);
        row.hidden = !(matchKind && matchQuery);
        if (!row.hidden) visible++;
      });
      empty.hidden = visible !== 0;
    }
    buttons.forEach((button) => button.addEventListener("click", () => {
      buttons.forEach((item) => item.classList.remove("active"));
      button.classList.add("active");
      filter = button.dataset.filter;
      apply();
    }));
    search.addEventListener("input", apply);

    const taskStorageKey = "steam-etkinlik-radari-gorevler-v1";
    let completedTasks = {};
    try {
      completedTasks = JSON.parse(localStorage.getItem(taskStorageKey) || "{}");
    } catch {}
    const taskGroups = [...document.querySelectorAll("[data-event-tasks]")];
    function updateTaskProgress(group) {
      const boxes = [...group.querySelectorAll("[data-task-id]")];
      const done = boxes.filter((box) => box.checked).length;
      const progress = group.querySelector("[data-task-progress]");
      if (progress) progress.textContent = done + "/" + boxes.length + " tamamlandı";
    }
    taskGroups.forEach((group) => {
      const boxes = [...group.querySelectorAll("[data-task-id]")];
      boxes.forEach((box) => {
        box.checked = Boolean(completedTasks[box.dataset.taskId]);
        box.addEventListener("change", () => {
          if (box.checked) completedTasks[box.dataset.taskId] = true;
          else delete completedTasks[box.dataset.taskId];
          localStorage.setItem(taskStorageKey, JSON.stringify(completedTasks));
          updateTaskProgress(group);
        });
      });
      updateTaskProgress(group);
    });
  </script>
</body>
</html>`;
}

export async function writeReport(snapshot: EventSnapshot): Promise<string> {
  await mkdir(paths.outDir, { recursive: true });
  const report = renderReport(snapshot);
  await Promise.all([
    writeFile(paths.report, report, "utf8"),
    writeFile(paths.publicIndex, report, "utf8"),
    writeFile(paths.noJekyll, "", "utf8"),
  ]);
  return path.resolve(paths.report);
}
