import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { DateTime } from "luxon";
import { readChangelog } from "./changelog.js";
import { config, paths } from "./config.js";
import { deadlineCopy } from "./deadline-copy.js";
import { buildEventTasks, type EventTask } from "./event-tasks.js";
import { createCalendarIcs, createEventIcs } from "./ics.js";
import { readSteamNews } from "./news.js";
import { renderTimeline } from "./timeline.js";
import type {
  ChangeKind,
  ChangeRecord,
  EventSnapshot,
  SteamEvent,
  SteamNewsItem,
  SteamNewsSnapshot,
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

function newsCard(item: SteamNewsItem): string {
  const kindCopy = {
    new_release: ["Yeni çıktı", "New release"],
    coming_soon: ["Yakında", "Coming soon"],
    platform: ["Steamworks güncellemesi", "Steamworks update"],
  }[item.kind];
  const date =
    item.publishedAt && DateTime.fromISO(item.publishedAt).isValid
      ? localizedText(
          localDate(item.publishedAt),
          localDateEn(item.publishedAt),
        )
      : escapeHtml(item.dateLabel || "");
  return `
    <article class="news-card" data-news-kind="${item.kind}" data-news-categories="${escapeHtml(JSON.stringify(item.categories || []))}">
      ${
        item.imageUrl
          ? `<img src="${escapeHtml(item.imageUrl)}" alt="" loading="lazy" referrerpolicy="no-referrer">`
          : `<span class="news-icon" aria-hidden="true">${item.kind === "platform" ? "⚙" : "▶"}</span>`
      }
      <div class="news-card-body">
        <div class="news-meta">
          <span>${localizedText(kindCopy[0], kindCopy[1])}</span>
          ${date ? `<time>${date}</time>` : ""}
        </div>
        <h3>${escapeHtml(item.title)}</h3>
        ${item.summary ? `<p>${escapeHtml(item.summary)}</p>` : ""}
        <a href="${escapeHtml(item.url)}" target="_blank" rel="noreferrer">${localizedText("Resmî kaynakta aç", "Open official source")} <span aria-hidden="true">↗</span></a>
      </div>
    </article>`;
}

function newsSection(news?: SteamNewsSnapshot): string {
  const items = news?.items || [];
  const newReleases = items.filter((item) => item.kind === "new_release");
  const comingSoon = items.filter((item) => item.kind === "coming_soon");
  const platformItems = items.filter((item) => item.kind === "platform");
  const categories = [...new Set(
    [...newReleases, ...comingSoon].flatMap((item) => item.categories || []),
  )].sort((left, right) => left.localeCompare(right, "tr"));
  return `
    <section class="section dashboard-panel" id="game-releases" data-dashboard-panel="releases" aria-labelledby="game-releases-heading" hidden>
      <div class="section-title">
        <div>
          <h2 id="game-releases-heading">${localizedText("Yeni Çıkan / Çıkacak Oyunlar", "New & Upcoming Games")}</h2>
          <p>${localizedText("Son 30 günün çıkışları ve önümüzdeki 30 günün takvimi.", "Releases from the last 30 days and the next 30 days.")}</p>
        </div>
        ${
          news
            ? `<p>${localizedText("Son güncelleme:", "Last updated:")} ${localizedText(localDate(news.generatedAt, true), localDateEn(news.generatedAt, true))}</p>`
            : ""
        }
      </div>
      ${
        items.length
          ? `
            <div class="news-toolbar">
              <div class="news-tabs" role="tablist" aria-label="${localizedText("Haber türü", "News type")}">
                <button class="active" type="button" role="tab" aria-selected="true" data-news-tab="new_release">${localizedText("Yeni Çıkanlar", "New Releases")}</button>
                <button type="button" role="tab" aria-selected="false" data-news-tab="coming_soon">${localizedText("30 Gün İçinde", "Within 30 Days")}</button>
              </div>
              <label class="news-category-label">
                <span>${localizedText("Kategori", "Category")}</span>
                <select data-news-category>
                  <option value="">${localizedText("Tüm kategoriler", "All categories")}</option>
                  ${categories.map((category) => `<option value="${escapeHtml(category)}">${escapeHtml(category)}</option>`).join("")}
                </select>
              </label>
            </div>
            <div class="news-block" data-news-panel="new_release">
              <h3>${localizedText("Son 30 günde yeni çıkanlar", "Released in the last 30 days")}</h3>
              <div class="news-grid">${newReleases.map(newsCard).join("")}</div>
              <div class="empty" data-news-empty hidden>${localizedText("Bu kategoride oyun bulunamadı.", "No games found in this category.")}</div>
            </div>
            <div class="news-block" data-news-panel="coming_soon" hidden>
              <h3>${localizedText("Önümüzdeki 30 gün içinde çıkacaklar", "Coming in the next 30 days")}</h3>
              <div class="news-grid">${comingSoon.map(newsCard).join("")}</div>
              <div class="empty" data-news-empty hidden>${localizedText("Bu kategoride oyun bulunamadı.", "No games found in this category.")}</div>
            </div>
            `
          : `<div class="empty">${localizedText("Haber akışı henüz oluşturulmadı.", "The news feed has not been generated yet.")}</div>`
      }
    </section>
    <section class="section dashboard-panel" id="steam-news" data-dashboard-panel="steamworks" aria-labelledby="steam-news-heading" hidden>
      <div class="section-title">
        <div>
          <h2 id="steam-news-heading" data-i18n="steamNews">Steam Haberleri</h2>
          <p>${localizedText("Valve’ın son 3 ayda yayımladığı resmî Steamworks duyuruları.", "Official Steamworks announcements published by Valve in the last 3 months.")}</p>
        </div>
      </div>
      <p class="news-disclaimer">${localizedText(
        "Yalnızca Valve’ın resmî duyuruları gösterilir; doğrulanmamış algoritma söylentileri eklenmez.",
        "Only official Valve announcements are shown; unverified algorithm rumors are excluded.",
      )}</p>
      <div class="news-grid platform-news">${platformItems.map(newsCard).join("")}</div>
      ${platformItems.length ? "" : `<div class="empty">${localizedText("Bu dönemde duyuru bulunamadı.", "No announcements found in this period.")}</div>`}
    </section>`;
}

export function renderReport(
  snapshot: EventSnapshot,
  changelog: ChangeRecord[] = [],
  news?: SteamNewsSnapshot,
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
    .view-tabs { display:grid; grid-auto-flow:column; grid-auto-columns:minmax(170px,1fr); gap:6px; margin:22px 0 0; padding:5px; overflow-x:auto; border:1px solid var(--color-line); border-radius:15px; background:var(--color-panel); scrollbar-width:thin; }
    .view-tabs button { min-width:0; min-height:44px; padding:9px 12px; color:var(--color-control-text); border-color:var(--color-transparent); background:var(--color-transparent); font-size:11px; font-weight:900; white-space:nowrap; }
    .view-tabs button.active { color:var(--color-on-accent); background:var(--gradient-brand); }
    .dashboard-panel[hidden] { display:none; }
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
    .hero-tools { display:flex; align-items:center; justify-content:flex-end; gap:8px; margin-bottom:14px; }
    .hero-tools .language-switch { margin:0; }
    .admin-open { min-height:42px; color:var(--color-on-accent); border-color:var(--color-hero-line); background:var(--color-hero-card); font-size:10px; font-weight:900; }
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
    .games-panel { padding:14px; border:1px solid var(--color-line); border-radius:20px; background:var(--color-panel); }
    .game-form { display:block; max-width:620px; margin:0 auto 18px; }
    .game-field { display:grid; gap:6px; min-width:0; color:var(--color-muted); font-size:12px; font-weight:700; }
    .game-field[hidden],.game-form-actions[hidden] { display:none !important; }
    .game-field input,.game-field select { min-width:0; width:100%; min-height:44px; padding:10px 12px; border:1px solid var(--color-line); border-radius:11px; color:var(--color-ink); background:var(--color-control); }
    .steam-game-search { position:relative; min-width:0; }
    .steam-game-results { position:absolute; top:calc(100% + 6px); left:0; right:0; z-index:20; max-height:310px; overflow-y:auto; padding:6px; border:1px solid var(--color-line); border-radius:13px; background:var(--color-panel); box-shadow:0 16px 42px var(--color-shadow); }
    .steam-game-results[hidden] { display:none; }
    .steam-game-option { display:grid; grid-template-columns:56px minmax(0,1fr); align-items:center; width:100%; min-height:58px; gap:10px; padding:7px; border:0; border-radius:9px; text-align:left; }
    .steam-game-option:hover,.steam-game-option:focus-visible { background:var(--color-soft); }
    .steam-game-option img { width:56px; height:32px; border-radius:6px; object-fit:cover; background:var(--color-soft); }
    .steam-game-option strong { display:block; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .steam-game-option strong { color:var(--color-ink); font-size:12px; }
    .steam-search-status { min-height:1.4em; margin-top:5px; color:var(--color-muted); font-size:10px; font-weight:500; }
    .game-field-wide { grid-column:1 / -1; }
    .game-form-actions { display:flex; align-items:center; flex-wrap:wrap; gap:8px; grid-column:1 / -1; }
    .game-form-actions button:first-child { color:var(--color-on-accent); border-color:var(--color-transparent); background:var(--gradient-brand); font-weight:800; }
    .game-help,.game-match-summary { margin:10px 0 0; color:var(--color-muted); font-size:12px; line-height:1.5; }
    .game-list { display:grid; grid-auto-flow:column; grid-auto-columns:minmax(190px,78%); gap:12px; margin-top:16px; padding:2px 2px 12px; overflow-x:auto; overscroll-behavior-inline:contain; scroll-snap-type:inline mandatory; scrollbar-color:var(--color-accent-pink) var(--color-soft); }
    .game-profile { position:relative; min-width:0; aspect-ratio:2 / 3; overflow:hidden; scroll-snap-align:start; border:1px solid var(--color-accent-pink); border-radius:16px; background:var(--color-panel-subtle); box-shadow:0 8px 24px var(--color-shadow); }
    .game-profile-button { position:absolute; inset:0; display:block; width:100%; height:100%; min-height:0; padding:0; overflow:hidden; border:0; border-radius:0; color:inherit; background:var(--color-soft); text-align:left; }
    .game-profile-button:hover,.game-profile-button:focus-visible { transform:none; box-shadow:inset 0 0 0 3px var(--color-accent-pink); }
    .game-profile-button .game-capsule,.game-profile-button .game-capsule-fallback { width:100%; height:100%; border:0; border-radius:0; object-fit:cover; }
    .game-card-overlay { position:absolute; inset:auto 0 0; padding:38px 10px 11px; color:var(--color-on-accent); background:linear-gradient(var(--color-transparent),var(--color-hero-end)); }
    .game-card-overlay strong { display:block; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-size:13px; }
    .game-card-overlay small { display:none; }
    .game-capsule { width:72px; aspect-ratio:2 / 3; object-fit:cover; border:1px solid var(--color-line); border-radius:9px; background:var(--color-soft); }
    .game-capsule-fallback { display:grid; place-items:center; width:72px; aspect-ratio:2 / 3; padding:7px; border:1px solid var(--color-line); border-radius:9px; color:var(--color-muted); background:var(--color-soft); font-size:9px; font-weight:800; text-align:center; overflow-wrap:anywhere; }
    .game-profile strong,.game-profile small { display:block; overflow-wrap:anywhere; }
    .game-dialog { width:min(92vw,760px); max-height:min(88vh,820px); padding:0; overflow:hidden; border:1px solid var(--color-line); border-radius:20px; color:var(--color-ink); background:var(--color-panel); box-shadow:0 28px 90px var(--color-shadow); }
    .game-dialog::backdrop { background:rgba(5,2,10,.76); backdrop-filter:blur(5px); }
    .game-dialog-shell { display:grid; grid-template-columns:120px minmax(0,1fr); gap:18px; max-height:88vh; padding:18px; overflow:auto; }
    .game-dialog-cover .game-capsule,.game-dialog-cover .game-capsule-fallback { width:120px; border-radius:12px; }
    .game-dialog-content { min-width:0; }
    .game-dialog-head { display:flex; align-items:flex-start; justify-content:space-between; gap:12px; }
    .game-dialog h3 { margin:2px 0 8px; overflow-wrap:anywhere; font-size:24px; }
    .game-dialog-close { flex:0 0 auto; width:40px; min-height:40px; padding:0; border-radius:999px; font-size:20px; }
    .game-dialog-meta,.game-dialog-tags { margin:0 0 12px; color:var(--color-muted); font-size:12px; line-height:1.55; overflow-wrap:anywhere; }
    .game-dialog-actions { display:flex; flex-wrap:wrap; gap:8px; margin-top:14px; }
    .game-dialog-actions a { display:inline-flex; align-items:center; min-height:40px; padding:9px 13px; border-radius:10px; color:var(--color-on-accent); background:var(--gradient-brand); font-size:11px; font-weight:800; text-decoration:none; }
    .game-profile-actions { display:flex; align-items:flex-start; flex-wrap:wrap; gap:6px; margin-top:9px; }
    .game-profile-actions button { min-height:36px; padding:7px 10px; font-size:11px; }
    .game-profile-actions [data-game-delete] { color:var(--color-danger); }
    .game-stats { margin-top:20px; padding-top:18px; border-top:1px solid var(--color-line); }
    .comparison-search { position:relative; max-width:620px; margin:0 auto 18px; }
    .comparison-search label { display:grid; gap:6px; color:var(--color-muted); font-size:12px; font-weight:800; }
    .comparison-search input { width:100%; min-height:44px; padding:10px 12px; border:1px solid var(--color-line); border-radius:11px; color:var(--color-ink); background:var(--color-control); }
    .game-stats h3 { margin:0 0 4px; font-size:17px; }
    .game-stats > p { margin:0 0 12px; color:var(--color-muted); font-size:11px; line-height:1.5; }
    .stats-grid { display:grid; grid-template-columns:1fr; gap:9px; }
    .stats-card { display:grid; grid-template-columns:54px minmax(0,1fr); gap:10px; padding:10px; border:1px solid var(--color-line); border-radius:13px; background:var(--color-panel-subtle); }
    .stats-card .game-capsule,.stats-card .game-capsule-fallback { width:54px; }
    .stats-card h4 { margin:0 0 7px; overflow-wrap:anywhere; font-size:12px; }
    .stats-values { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:7px; }
    .stats-value { min-width:0; padding:7px; border-radius:8px; background:var(--color-soft); }
    .stats-value strong,.stats-value span { display:block; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .stats-value strong { font-size:13px; }
    .stats-value span { margin-top:2px; color:var(--color-muted); font-size:8px; font-weight:800; text-transform:uppercase; }
    .stats-note { margin-top:9px; color:var(--color-muted); font-size:9px; }
    .game-match-result { display:grid; grid-template-columns:repeat(auto-fill,minmax(96px,1fr)); gap:8px; margin-top:12px; }
    .game-match-result[hidden],.game-match-warning[hidden] { display:none; }
    .game-match-card { display:grid; grid-template-columns:40px minmax(0,1fr); gap:7px; align-items:center; min-width:0; padding:7px; border:1px solid var(--color-line); border-radius:10px; color:var(--color-soft-text); background:var(--color-soft); }
    .game-match-card .game-capsule,.game-match-card .game-capsule-fallback { width:40px; border-radius:6px; }
    .game-match-card strong,.game-match-card small { display:block; min-width:0; overflow:hidden; text-overflow:ellipsis; }
    .game-match-card strong { font-size:10px; white-space:nowrap; }
    .game-match-card small { margin-top:3px; color:var(--color-muted); font-size:9px; line-height:1.3; }
    .game-match-card.not-eligible { border-color:var(--color-danger); opacity:.72; }
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
    .news-block + .news-block { margin-top:32px; }
    .news-toolbar { display:flex; align-items:flex-end; flex-wrap:wrap; gap:12px; margin-bottom:18px; }
    .news-tabs { display:flex; flex:1 1 360px; gap:6px; padding:5px; overflow-x:auto; border:1px solid var(--color-line); border-radius:13px; background:var(--color-panel); }
    .news-tabs button { flex:1 0 140px; min-height:40px; border-color:var(--color-transparent); background:var(--color-transparent); font-size:11px; font-weight:900; }
    .news-tabs button.active { color:var(--color-on-accent); background:var(--gradient-brand); }
    .news-category-label { display:grid; flex:0 1 220px; gap:5px; color:var(--color-muted); font-size:10px; font-weight:800; }
    .news-category-label select { min-height:42px; padding:8px 10px; border:1px solid var(--color-line); border-radius:10px; color:var(--color-ink); background:var(--color-control); }
    .news-block[hidden] { display:none; }
    .news-block > h3 { margin:0 0 12px; font-size:18px; }
    .news-disclaimer { margin:-4px 0 14px; color:var(--color-muted); font-size:12px; line-height:1.5; }
    .news-grid { display:grid; grid-template-columns:1fr; gap:12px; }
    .news-card { display:grid; grid-template-columns:96px minmax(0,1fr); min-width:0; overflow:hidden; border:1px solid var(--color-line); border-radius:16px; background:var(--color-panel); }
    .news-card > img { width:96px; height:100%; min-height:118px; object-fit:cover; background:var(--color-soft); }
    .news-icon { display:grid; min-height:118px; place-items:center; color:var(--color-on-accent); background:var(--gradient-brand); font-size:28px; }
    .news-card-body { min-width:0; padding:13px; }
    .news-meta { display:flex; align-items:center; flex-wrap:wrap; gap:6px 10px; color:var(--color-muted); font-size:10px; font-weight:800; }
    .news-meta > span { color:var(--color-link); }
    .news-card h3 { margin:7px 0 8px; overflow-wrap:anywhere; font-size:14px; line-height:1.3; }
    .news-card p { display:-webkit-box; margin:0 0 9px; overflow:hidden; color:var(--color-muted); font-size:11px; line-height:1.45; -webkit-box-orient:vertical; -webkit-line-clamp:3; }
    .news-card a { color:var(--color-link); font-size:11px; font-weight:800; text-decoration:none; }
    .admin-grid { display:grid; grid-template-columns:1fr; gap:14px; }
    .admin-card { padding:16px; border:1px solid var(--color-line); border-radius:16px; background:var(--color-panel); }
    .admin-card h3 { margin:0 0 12px; font-size:17px; }
    .admin-form { display:flex; gap:8px; flex-wrap:wrap; }
    .admin-form input { flex:1 1 220px; min-height:42px; padding:9px 11px; border:1px solid var(--color-line); border-radius:10px; color:var(--color-ink); background:var(--color-control); }
    .admin-list { display:grid; gap:7px; margin-top:12px; }
    .admin-list-row { display:flex; align-items:center; justify-content:space-between; gap:10px; padding:9px 10px; border-radius:10px; background:var(--color-soft); font-size:11px; overflow-wrap:anywhere; }
    .admin-metrics { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:8px; }
    .admin-metric { padding:12px; border-radius:11px; background:var(--color-soft); }
    .admin-metric strong,.admin-metric span { display:block; }
    .admin-metric strong { font-size:22px; }
    .admin-metric span { margin-top:4px; color:var(--color-muted); font-size:9px; }
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
      .games-panel { padding:20px; }
      .game-list { grid-auto-columns:calc((100% - 42px) / 4); gap:14px; }
      .application-form { grid-template-columns:repeat(3,minmax(0,1fr)); }
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
      .news-grid { grid-template-columns:repeat(2,minmax(0,1fr)); }
      .platform-news { grid-template-columns:repeat(2,minmax(0,1fr)); }
      .stats-grid { grid-template-columns:repeat(2,minmax(0,1fr)); }
      .admin-grid { grid-template-columns:repeat(2,minmax(0,1fr)); }
    }
    @media (prefers-reduced-motion: reduce) {
      html { scroll-behavior:auto; }
      .event-row.timeline-highlight { animation:none; box-shadow:inset 4px 0 var(--color-accent-pink); }
    }
    @media (max-width: 480px) {
      .game-dialog-shell { grid-template-columns:86px minmax(0,1fr); gap:12px; padding:13px; }
      .game-dialog-cover .game-capsule,.game-dialog-cover .game-capsule-fallback { width:86px; }
      .game-dialog h3 { font-size:19px; }
    }
  </style>
</head>
<body>
  <main class="shell">
    <section class="hero" id="top">
      <div class="hero-tools">
        <button class="admin-open" type="button" data-admin-open hidden>Yönetim</button>
        <div class="language-switch" role="group" aria-label="Arayüz dili" data-i18n-aria-label="languageLabel">
          <button class="active" type="button" data-language="tr" aria-pressed="true">TR</button>
          <button type="button" data-language="en" aria-pressed="false">EN</button>
        </div>
      </div>
      <span class="eyebrow" data-i18n="eyebrow">Joygame Select · Steamworks Operasyonları</span>
      <h1 data-i18n-html="title">Steam Etkinlik<br>Radarı</h1>
      <p data-i18n="heroDescription">Steam’in resmî takvimindeki festivalleri, sezon indirimlerini ve başvuru kilometre taşlarını Joygame Select operasyon görünümünde tek yerde takip et.</p>
      ${renderTimeline(model, config.timezone)}
    </section>

    <div class="view-tabs" role="tablist" aria-label="İçerik görünümü" data-i18n-aria-label="contentView">
      <button class="active" type="button" role="tab" aria-selected="true" data-view-tab="events">Etkinlikler</button>
      <button type="button" role="tab" aria-selected="false" data-view-tab="games">Oyunlarım</button>
      <button type="button" role="tab" aria-selected="false" data-view-tab="steamworks">Steam Haberleri</button>
      <button type="button" role="tab" aria-selected="false" data-view-tab="releases">Yeni Çıkan / Çıkacak Oyunlar</button>
      <button type="button" role="tab" aria-selected="false" data-view-tab="stats">Oyun İstatistikleri</button>
    </div>

    <section class="section dashboard-panel" id="games" data-dashboard-panel="games" aria-labelledby="games-heading" hidden>
      <div class="section-title">
        <h2 id="games-heading" data-i18n="myGames">Oyunlarım</h2>
        <p data-i18n="gamesIntro">Etiketleri birebir karşılaştırarak uygun olabilecek temalı festivalleri gösterir.</p>
      </div>
      <div class="games-panel">
        <form class="game-form" data-game-form>
          <input type="hidden" data-game-id>
          <div class="game-field">
            <label for="game-name" data-i18n="addSteamGame">Steam’den oyun ekle</label>
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
          <input type="hidden" data-game-app-id>
          <input type="hidden" data-game-tags>
          <input type="hidden" data-game-demo-status value="none">
          <input type="hidden" data-game-release-status value="unreleased">
          <input type="hidden" data-game-local-multiplayer value="no">
        </form>
        <div class="game-list" data-games-list></div>
        <dialog class="game-dialog" data-game-dialog aria-labelledby="game-dialog-title">
          <div class="game-dialog-shell">
            <div class="game-dialog-cover" data-game-dialog-cover></div>
            <div class="game-dialog-content">
              <div class="game-dialog-head">
                <h3 id="game-dialog-title" data-game-dialog-title></h3>
                <button class="game-dialog-close" type="button" data-game-dialog-close aria-label="Pencereyi kapat">×</button>
              </div>
              <p class="game-dialog-meta" data-game-dialog-meta></p>
              <p class="game-dialog-tags" data-game-dialog-tags></p>
              <div data-game-dialog-history></div>
              <div class="game-dialog-actions">
                <a href="#" target="_blank" rel="noreferrer" data-game-steam-link>Steam sayfasını aç ↗</a>
                <button type="button" data-game-dialog-focus></button>
                <button type="button" data-game-dialog-delete></button>
              </div>
            </div>
          </div>
        </dialog>
        <p class="game-match-summary" data-game-match-summary role="status" aria-live="polite" data-i18n="addGamePrompt">Eşleşme için oyun ekleyin.</p>
      </div>
    </section>
    <section class="section dashboard-panel" id="game-statistics" data-dashboard-panel="stats" aria-labelledby="game-statistics-heading" hidden>
      <div class="section-title">
        <div>
          <h2 id="game-statistics-heading">Oyun İstatistikleri</h2>
          <p data-i18n="statsIntro">Steam’in herkese açık anlık verileriyle ücretsiz karşılaştırma. Satış ve wishlist tahmini yapılmaz.</p>
        </div>
      </div>
      <div class="games-panel">
        <div class="comparison-search">
          <label>
            Steam’de karşılaştırılacak oyun ara
            <input type="search" data-comparison-search autocomplete="off" placeholder="Oyun adı yazın…">
          </label>
          <div class="steam-game-results" data-comparison-results role="listbox" hidden></div>
          <div class="steam-search-status" data-comparison-status role="status" aria-live="polite">En az 2 karakter yazın.</div>
        </div>
        <div class="stats-grid" data-game-stats>
          <div class="empty" data-i18n="statsAddGame">İstatistik görmek için Steam’den oyun ekleyin.</div>
        </div>
      </div>
    </section>

    <section class="section dashboard-panel" id="changes" data-dashboard-panel="events">
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

    <section class="section dashboard-panel" id="deadlines" data-dashboard-panel="events">
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

    <section class="section dashboard-panel" id="calendar" data-dashboard-panel="events">
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

    ${newsSection(news)}

    <section class="section dashboard-panel" id="admin" data-dashboard-panel="admin" aria-labelledby="admin-heading" hidden>
      <div class="section-title">
        <div>
          <h2 id="admin-heading">Yönetim Paneli</h2>
          <p>Erişim, günlük e-posta alıcıları ve son 30 günlük kullanım verileri.</p>
        </div>
      </div>
      <div class="admin-grid">
        <article class="admin-card">
          <h3>Panel erişimi</h3>
          <form class="admin-form" data-admin-user-form>
            <input type="email" required placeholder="kullanici@ornek.com" data-admin-user-email>
            <button type="submit">Erişim ver</button>
          </form>
          <div class="admin-list" data-admin-users></div>
        </article>
        <article class="admin-card">
          <h3>Günlük e-posta alıcıları</h3>
          <form class="admin-form" data-admin-recipient-form>
            <input type="email" required placeholder="alici@ornek.com" data-admin-recipient-email>
            <button type="submit">Alıcı ekle</button>
          </form>
          <div class="admin-list" data-admin-recipients></div>
        </article>
        <article class="admin-card">
          <h3>Son 30 gün</h3>
          <div class="admin-metrics" data-admin-metrics></div>
          <div class="admin-list" data-admin-popular></div>
        </article>
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
    const viewTabs = [...document.querySelectorAll("[data-view-tab]")];
    const dashboardPanels = [...document.querySelectorAll("[data-dashboard-panel]")];
    const allowedViews = new Set([
      "events",
      "games",
      "steamworks",
      "releases",
      "stats",
      "admin",
    ]);
    let activeView = allowedViews.has(hashState.get("view"))
      ? hashState.get("view")
      : "events";
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
      if (activeView !== "events") state.set("view", activeView);
      const hash = state.toString();
      history.replaceState(
        null,
        "",
        location.pathname + location.search + (hash ? "#" + hash : ""),
      );
    }

    function setView(view, updateUrl = true) {
      activeView = allowedViews.has(view) ? view : "events";
      viewTabs.forEach((button) => {
        const active = button.dataset.viewTab === activeView;
        button.classList.toggle("active", active);
        button.setAttribute("aria-selected", String(active));
      });
      dashboardPanels.forEach((panel) => {
        panel.hidden = panel.dataset.dashboardPanel !== activeView;
      });
      if (updateUrl) writeUrlState();
    }

    viewTabs.forEach((button) => {
      button.addEventListener("click", () => setView(button.dataset.viewTab));
    });
    setView(activeView, false);

    const newsTabs = [...document.querySelectorAll("[data-news-tab]")];
    const newsPanels = [...document.querySelectorAll("[data-news-panel]")];
    const newsCategory = document.querySelector("[data-news-category]");
    let activeNewsTab = "new_release";

    function updateNewsView() {
      const category = newsCategory?.value || "";
      newsTabs.forEach((button) => {
        const active = button.dataset.newsTab === activeNewsTab;
        button.classList.toggle("active", active);
        button.setAttribute("aria-selected", String(active));
      });
      newsPanels.forEach((panel) => {
        const active = panel.dataset.newsPanel === activeNewsTab;
        panel.hidden = !active;
        if (!active) return;
        let visible = 0;
        panel.querySelectorAll(".news-card").forEach((card) => {
          let categories = [];
          try {
            categories = JSON.parse(card.dataset.newsCategories || "[]");
          } catch {}
          const matches = !category || categories.includes(category);
          card.hidden = !matches;
          if (matches) visible++;
        });
        const emptyState = panel.querySelector("[data-news-empty]");
        if (emptyState) emptyState.hidden = visible > 0;
      });
    }

    newsTabs.forEach((button) => {
      button.addEventListener("click", () => {
        activeNewsTab = button.dataset.newsTab;
        updateNewsView();
      });
    });
    newsCategory?.addEventListener("change", updateNewsView);
    updateNewsView();

    function recordAnalytics(eventName, target = "") {
      if (location.protocol === "file:") return;
      fetch("/api/analytics", {
        method: "POST",
        headers: {
          accept: "application/json",
          "content-type": "application/json",
        },
        body: JSON.stringify({ eventName, target }),
        keepalive: true,
      }).catch(() => {});
    }

    const adminOpen = document.querySelector("[data-admin-open]");
    const adminUsers = document.querySelector("[data-admin-users]");
    const adminRecipients = document.querySelector("[data-admin-recipients]");
    const adminMetrics = document.querySelector("[data-admin-metrics]");
    const adminPopular = document.querySelector("[data-admin-popular]");

    function adminRow(item, collection) {
      const row = document.createElement("div");
      row.className = "admin-list-row";
      const email = document.createElement("span");
      email.textContent = item.email;
      const remove = document.createElement("button");
      remove.type = "button";
      remove.dataset.adminRemove = collection;
      remove.dataset.adminEmail = item.email;
      remove.textContent = "Kaldır";
      row.append(email, remove);
      return row;
    }

    async function loadAdmin() {
      try {
        const response = await fetch("/api/admin", {
          headers: { accept: "application/json" },
        });
        if (!response.ok) return false;
        const payload = await response.json();
        adminOpen.hidden = false;
        adminUsers.replaceChildren(
          ...(payload.users || []).map((item) => adminRow(item, "users")),
        );
        adminRecipients.replaceChildren(
          ...(payload.recipients || []).map((item) =>
            adminRow(item, "recipients"),
          ),
        );
        const metrics = [
          [payload.analytics?.pageViews || 0, "Sayfa görüntüleme"],
          [payload.analytics?.visitors || 0, "Tekil kullanıcı"],
          [payload.analytics?.events || 0, "Toplam etkileşim"],
        ];
        adminMetrics.replaceChildren(
          ...metrics.map(([value, label]) => {
            const card = document.createElement("div");
            card.className = "admin-metric";
            const strong = document.createElement("strong");
            strong.textContent = formatNumber(value);
            const caption = document.createElement("span");
            caption.textContent = label;
            card.append(strong, caption);
            return card;
          }),
        );
        adminPopular.replaceChildren(
          ...(payload.analytics?.popular || []).map((item) => {
            const row = document.createElement("div");
            row.className = "admin-list-row";
            row.textContent =
              item.eventName + (item.target ? " · " + item.target : "") +
              " · " + item.count;
            return row;
          }),
        );
        return true;
      } catch {
        return false;
      }
    }

    async function updateAdminEmail(collection, email, method) {
      const suffix =
        method === "DELETE" ? "?email=" + encodeURIComponent(email) : "";
      const response = await fetch("/api/admin/" + collection + suffix, {
        method,
        headers: {
          accept: "application/json",
          "content-type": "application/json",
        },
        body: method === "POST" ? JSON.stringify({ email }) : undefined,
      });
      if (!response.ok) throw new Error("admin update failed");
      await loadAdmin();
    }

    adminOpen?.addEventListener("click", () => {
      setView("admin");
      recordAnalytics("view_tab", "admin");
    });
    document.querySelector("[data-admin-user-form]")?.addEventListener(
      "submit",
      async (event) => {
        event.preventDefault();
        const input = document.querySelector("[data-admin-user-email]");
        await updateAdminEmail("users", input.value.trim(), "POST");
        input.value = "";
      },
    );
    document.querySelector("[data-admin-recipient-form]")?.addEventListener(
      "submit",
      async (event) => {
        event.preventDefault();
        const input = document.querySelector("[data-admin-recipient-email]");
        await updateAdminEmail("recipients", input.value.trim(), "POST");
        input.value = "";
      },
    );
    document.querySelector("#admin")?.addEventListener("click", async (event) => {
      const button = event.target.closest("[data-admin-remove]");
      if (!button) return;
      if (!window.confirm(button.dataset.adminEmail + " kaldırılsın mı?")) return;
      await updateAdminEmail(
        button.dataset.adminRemove,
        button.dataset.adminEmail,
        "DELETE",
      );
    });
    loadAdmin();
    recordAnalytics("page_view", location.pathname);
    viewTabs.forEach((button) => {
      button.addEventListener("click", () =>
        recordAnalytics("view_tab", button.dataset.viewTab),
      );
    });
    document.addEventListener("click", (event) => {
      const link = event.target.closest("a[target='_blank']");
      if (link) recordAnalytics("outbound_click", link.href);
    });

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
      openMenu: { tr: "Menüyü aç", en: "Open menu" },
      navigationLabel: { tr: "Sayfa navigasyonu", en: "Page navigation" },
      navigation: { tr: "Navigasyon", en: "Navigation" },
      overview: { tr: "Genel bakış", en: "Overview" },
      changesShort: { tr: "Değişiklikler", en: "Changes" },
      contentView: { tr: "İçerik görünümü", en: "Content view" },
      radarTab: { tr: "Etkinlik Radarı", en: "Event Radar" },
      steamNews: { tr: "Steam Haberleri", en: "Steam News" },
      newsIntro: {
        tr: "Yeni çıkanlar, yaklaşan oyunlar ve Valve’ın resmî Steamworks duyuruları.",
        en: "New releases, upcoming games, and Valve’s official Steamworks announcements.",
      },
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
      addSteamGame: { tr: "Steam’den oyun ekle", en: "Add a game from Steam" },
      gameComparison: { tr: "Oyun istatistikleri", en: "Game statistics" },
      statsIntro: {
        tr: "Steam’in herkese açık anlık verileriyle ücretsiz karşılaştırma. Satış ve wishlist tahmini yapılmaz.",
        en: "A free comparison using Steam’s public live data. Sales and wishlist figures are not estimated.",
      },
      statsAddGame: {
        tr: "İstatistik görmek için Steam’den oyun ekleyin.",
        en: "Add a game from Steam to view statistics.",
      },
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
        renderGameStats();
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
        return teamStateRecords;
      } catch {
        teamStateEnabled = false;
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
      } catch {}
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
      } catch {}
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
    const gameStats = document.querySelector("[data-game-stats]");
    const steamGameResults = document.querySelector(
      "[data-steam-game-results]",
    );
    const steamSearchStatus = document.querySelector(
      "[data-steam-search-status]",
    );
    const gameDialog = document.querySelector("[data-game-dialog]");
    const gameDialogCover = document.querySelector("[data-game-dialog-cover]");
    const gameDialogTitle = document.querySelector("[data-game-dialog-title]");
    const gameDialogMeta = document.querySelector("[data-game-dialog-meta]");
    const gameDialogTags = document.querySelector("[data-game-dialog-tags]");
    const gameDialogHistory = document.querySelector("[data-game-dialog-history]");
    const gameDialogSteamLink = document.querySelector("[data-game-steam-link]");
    const gameDialogFocus = document.querySelector("[data-game-dialog-focus]");
    const gameDialogDelete = document.querySelector("[data-game-dialog-delete]");
    const comparisonSearch = document.querySelector("[data-comparison-search]");
    const comparisonResults = document.querySelector("[data-comparison-results]");
    const comparisonStatus = document.querySelector("[data-comparison-status]");
    let steamSearchTimer = 0;
    let steamSearchController;
    let steamDetailController;
    let steamOptions = [];
    let selectedSteamDetails = null;
    const gameStatsByAppId = new Map();
    const gamalyticByAppId = new Map();
    const gamalyticUnavailable = new Set();
    const statsStorageKey = "steam-etkinlik-radari-istatistik-v1";
    let comparisonGames = [];
    let comparisonTimer = 0;

    function formatNumber(value) {
      return new Intl.NumberFormat(
        descriptionLanguage === "en" ? "en-US" : "tr-TR",
      ).format(Number(value || 0));
    }

    function formatUsd(value) {
      return new Intl.NumberFormat(
        descriptionLanguage === "en" ? "en-US" : "tr-TR",
        { style: "currency", currency: "USD", maximumFractionDigits: 0 },
      ).format(Number(value || 0));
    }

    function rememberStats(stats) {
      try {
        const history = JSON.parse(localStorage.getItem(statsStorageKey) || "{}");
        const dateKey = String(stats.capturedAt || "").slice(0, 10);
        const appHistory = Array.isArray(history[stats.appId])
          ? history[stats.appId]
          : [];
        history[stats.appId] = [
          ...appHistory.filter((item) => item.date !== dateKey),
          {
            date: dateKey,
            currentPlayers: stats.currentPlayers,
            totalReviews: stats.totalReviews,
            positivePercent: stats.positivePercent,
          },
        ].slice(-90);
        localStorage.setItem(statsStorageKey, JSON.stringify(history));
      } catch {}
    }

    function renderGameStats() {
      gameStats.replaceChildren();
      const measurableGames = [...new Map(
        [...games, ...comparisonGames]
          .filter((game) => /^\\d+$/.test(game.appId))
          .map((game) => [game.appId, game]),
      ).values()];
      if (measurableGames.length === 0) {
        const emptyState = document.createElement("div");
        emptyState.className = "empty";
        emptyState.textContent = translate("statsAddGame");
        gameStats.append(emptyState);
        return;
      }
      measurableGames.forEach((game) => {
        const stats = gameStatsByAppId.get(game.appId);
        const card = document.createElement("article");
        card.className = "stats-card";
        card.append(createGameCapsule(game));
        const body = document.createElement("div");
        const title = document.createElement("h4");
        title.textContent = game.name;
        body.append(title);
        if (game.comparisonOnly) {
          const removeComparison = document.createElement("button");
          removeComparison.type = "button";
          removeComparison.dataset.comparisonRemove = game.appId;
          removeComparison.textContent = localized(
            "Karşılaştırmadan çıkar",
            "Remove from comparison",
          );
          body.append(removeComparison);
        }
        if (!stats) {
          const loading = document.createElement("p");
          loading.className = "stats-note";
          loading.textContent = localized("Steam verisi alınıyor…", "Loading Steam data…");
          body.append(loading);
        } else {
          const values = document.createElement("div");
          values.className = "stats-values";
          [
            [formatNumber(stats.currentPlayers), localized("Anlık oyuncu", "Players now")],
            [formatNumber(stats.totalReviews), localized("Toplam inceleme", "Total reviews")],
            [stats.positivePercent + "%", localized("Olumlu", "Positive")],
            [stats.price?.formatted || "—", localized("Fiyat", "Price")],
          ].forEach(([value, label]) => {
            const metric = document.createElement("span");
            metric.className = "stats-value";
            const strong = document.createElement("strong");
            strong.textContent = value;
            const caption = document.createElement("span");
            caption.textContent = label;
            metric.append(strong, caption);
            values.append(metric);
          });
          body.append(values);
          const gamalytic = gamalyticByAppId.get(game.appId);
          if (gamalytic) {
            const estimateHeading = document.createElement("p");
            estimateHeading.className = "stats-note";
            estimateHeading.textContent = localized(
              "Gamalytic tahminleri",
              "Gamalytic estimates",
            );
            body.append(estimateHeading);
            const estimates = document.createElement("div");
            estimates.className = "stats-values";
            [
              [formatNumber(gamalytic.wishlists), localized("Wishlist (tahmin)", "Wishlists (estimate)")],
              [formatNumber(gamalytic.copiesSold), localized("Satış (tahmin)", "Sales (estimate)")],
              [formatUsd(gamalytic.totalRevenue || gamalytic.revenue), localized("Gelir (tahmin)", "Revenue (estimate)")],
              [formatNumber(gamalytic.owners), localized("Sahip (tahmin)", "Owners (estimate)")],
            ].forEach(([value, label]) => {
              const metric = document.createElement("span");
              metric.className = "stats-value";
              const strong = document.createElement("strong");
              strong.textContent = value;
              const caption = document.createElement("span");
              caption.textContent = label;
              metric.append(strong, caption);
              estimates.append(metric);
            });
            body.append(estimates);
          } else if (gamalyticUnavailable.has(game.appId)) {
            const unavailable = document.createElement("p");
            unavailable.className = "stats-note";
            unavailable.textContent = localized(
              "Gamalytic bağlandığında wishlist, satış ve gelir tahminleri burada görünecek.",
              "Wishlist, sales and revenue estimates will appear here once Gamalytic is connected.",
            );
            body.append(unavailable);
          }
          const note = document.createElement("p");
          note.className = "stats-note";
          note.textContent = localized(
            "Günlük kayıtlar bu tarayıcıda 90 gün saklanır.",
            "Daily snapshots are kept in this browser for 90 days.",
          );
          body.append(note);
        }
        card.append(body);
        gameStats.append(card);
      });
    }

    async function refreshGameStats() {
      renderGameStats();
      if (location.protocol === "file:") return;
      const statsGames = [...new Map(
        [...games, ...comparisonGames]
          .filter((game) => /^\\d+$/.test(game.appId))
          .map((game) => [game.appId, game]),
      ).values()];
      await Promise.all(
        statsGames
          .filter(
            (game) =>
              /^\\d+$/.test(game.appId) && !gameStatsByAppId.has(game.appId),
          )
          .map(async (game) => {
            try {
              const response = await fetch(
                "/api/steam-stats?appid=" + encodeURIComponent(game.appId),
                { headers: { accept: "application/json" } },
              );
              if (!response.ok) return;
              const stats = await response.json();
              gameStatsByAppId.set(game.appId, stats);
              rememberStats(stats);
            } catch {}
          }),
      );
      await Promise.all(
        statsGames
          .filter(
            (game) =>
              /^\\d+$/.test(game.appId) &&
              !gamalyticByAppId.has(game.appId) &&
              !gamalyticUnavailable.has(game.appId),
          )
          .map(async (game) => {
            try {
              const response = await fetch(
                "/api/gamalytic-game?appid=" + encodeURIComponent(game.appId),
                { headers: { accept: "application/json" } },
              );
              if (!response.ok) {
                gamalyticUnavailable.add(game.appId);
                return;
              }
              gamalyticByAppId.set(game.appId, await response.json());
            } catch {
              gamalyticUnavailable.add(game.appId);
            }
          }),
      );
      renderGameStats();
    }

    async function addComparisonGame(option) {
      comparisonResults.hidden = true;
      comparisonSearch.value = "";
      if (
        games.some((game) => game.appId === option.appId) ||
        comparisonGames.some((game) => game.appId === option.appId)
      ) {
        comparisonStatus.textContent = localized(
          "Bu oyun zaten karşılaştırmada.",
          "This game is already in the comparison.",
        );
        return;
      }
      comparisonStatus.textContent = localized(
        "Oyun bilgileri alınıyor…",
        "Loading game details…",
      );
      try {
        const response = await fetch(
          "/api/steam-app?appid=" + encodeURIComponent(option.appId) + "&v=5",
          { headers: { accept: "application/json" } },
        );
        if (!response.ok) throw new Error("details failed");
        const details = await response.json();
        comparisonGames.push({
          id: "comparison-" + option.appId,
          name: details.name || option.name,
          appId: option.appId,
          tags: normalizeTags(details.tags),
          demoStatus: details.demoStatus || "none",
          releaseStatus: details.releaseStatus || "unreleased",
          localMultiplayer: details.localMultiplayer === true,
          capsuleImageUrl: safeSteamImage(details.capsuleImageUrl),
          nextFestHistory: [],
          comparisonOnly: true,
        });
        comparisonStatus.textContent = localized(
          "Karşılaştırmaya eklendi.",
          "Added to comparison.",
        );
        await refreshGameStats();
      } catch {
        comparisonStatus.textContent = localized(
          "Oyun bilgileri alınamadı.",
          "Game details could not be loaded.",
        );
      }
    }

    async function searchComparisonGames(query) {
      comparisonStatus.textContent = localized(
        "Steam’de aranıyor…",
        "Searching Steam…",
      );
      try {
        const response = await fetch(
          "/api/steam-search?q=" + encodeURIComponent(query),
          { headers: { accept: "application/json" } },
        );
        if (!response.ok) throw new Error("search failed");
        const payload = await response.json();
        const options = Array.isArray(payload.results) ? payload.results : [];
        comparisonResults.replaceChildren();
        options.slice(0, 8).forEach((option) => {
          const button = document.createElement("button");
          button.type = "button";
          button.className = "steam-game-option";
          button.dataset.comparisonOption = String(option.appId);
          button.dataset.comparisonName = String(option.name || "");
          const image = document.createElement("img");
          image.src = safeSteamImage(option.imageUrl);
          image.alt = "";
          const name = document.createElement("strong");
          name.textContent = String(option.name || "");
          button.append(image, name);
          comparisonResults.append(button);
        });
        comparisonResults.hidden = options.length === 0;
        comparisonStatus.textContent = options.length
          ? localized("Bir oyun seçin.", "Select a game.")
          : localized("Oyun bulunamadı.", "No game found.");
      } catch {
        comparisonResults.hidden = true;
        comparisonStatus.textContent = localized(
          "Steam araması şu anda kullanılamıyor.",
          "Steam search is currently unavailable.",
        );
      }
    }

    comparisonSearch?.addEventListener("input", () => {
      const query = comparisonSearch.value.trim();
      window.clearTimeout(comparisonTimer);
      if (query.length < 2) {
        comparisonResults.hidden = true;
        comparisonStatus.textContent = translate("typeTwoChars");
        return;
      }
      comparisonTimer = window.setTimeout(
        () => searchComparisonGames(query),
        300,
      );
    });
    comparisonResults?.addEventListener("click", (event) => {
      const button = event.target.closest("[data-comparison-option]");
      if (!button) return;
      addComparisonGame({
        appId: button.dataset.comparisonOption,
        name: button.dataset.comparisonName,
      });
    });
    gameStats?.addEventListener("click", (event) => {
      const button = event.target.closest("[data-comparison-remove]");
      if (!button) return;
      comparisonGames = comparisonGames.filter(
        (game) => game.appId !== button.dataset.comparisonRemove,
      );
      renderGameStats();
    });

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
            "&v=5",
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
            " seçildi · Steam bilgileri alındı ve oyun ekleniyor…",
            " selected · Steam details loaded; adding game…",
          );
        gameForm.requestSubmit();
      } catch (error) {
        if (error?.name === "AbortError") return;
        steamSearchStatus.textContent =
          option.name +
          localized(
            " seçildi · Ayrıntılar alınamadı, lütfen yeniden deneyin.",
            " selected · Details unavailable; please try again.",
          );
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
        copy.append(name);
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
            "Steam araması şu anda kullanılamıyor. Lütfen biraz sonra yeniden deneyin.",
            "Steam search is currently unavailable. Please try again shortly.",
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

    function closeGameDialog() {
      if (gameDialog?.open) gameDialog.close();
    }

    function openGameDialog(game) {
      gameDialogCover.replaceChildren(createGameCapsule(game));
      gameDialogTitle.textContent = game.name;
      gameDialogMeta.textContent = gameMeta(game);
      gameDialogTags.textContent = game.tags.length
        ? localized("Etiketler: ", "Tags: ") + game.tags.join(", ")
        : localized("Steam etiketi bulunamadı.", "No Steam tags found.");
      gameDialogHistory.replaceChildren();
      const history = nextFestHistoryBlock(game);
      if (history) gameDialogHistory.append(history);
      gameDialogSteamLink.href =
        "https://store.steampowered.com/app/" + encodeURIComponent(game.appId) + "/";
      gameDialogFocus.dataset.gameDialogFocus = game.id;
      gameDialogFocus.textContent =
        focusedGameId === game.id
          ? localized("Tüm etkinlikleri göster", "Show all events")
          : localized("Uygun etkinlikleri göster", "Show matching events");
      gameDialogDelete.dataset.gameDialogDelete = game.id;
      gameDialogDelete.textContent = localized("Oyunu kaldır", "Remove game");
      gameDialog.showModal();
    }

    function renderGames() {
      gamesList.replaceChildren();
      games.forEach((game) => {
        const item = document.createElement("article");
        item.className = "game-profile";

        const summary = document.createElement("button");
        summary.type = "button";
        summary.className = "game-profile-button";
        summary.dataset.gameOpen = game.id;
        summary.setAttribute(
          "aria-label",
          game.name + localized(" ayrıntılarını aç", " open details"),
        );
        summary.append(createGameCapsule(game));
        const overlay = document.createElement("span");
        overlay.className = "game-card-overlay";
        const overlayName = document.createElement("strong");
        overlayName.textContent = game.name;
        overlay.append(overlayName);
        summary.append(overlay);
        item.append(summary);
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
      if (gameCancel) gameCancel.hidden = true;
    }

    function matchingGamesForRow(row) {
      const candidateGames = focusedGameId
        ? games.filter((game) => game.id === focusedGameId)
        : games;
      if (row.dataset.kind === "next_fest") {
        return candidateGames.map((game) => ({
          game,
          score: 0,
          nextFest: true,
          eligible: game.releaseStatus === "unreleased",
        }));
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
      badge.classList.toggle("not-eligible", match.eligible === false);
      const copy = document.createElement("span");
      const name = document.createElement("strong");
      name.textContent = "★ " + match.game.name;
      const detail = document.createElement("small");
      detail.textContent = match.nextFest
        ? match.eligible === false
          ? localized("Next Fest için uygun değil", "Not eligible for Next Fest")
          : localized("Next Fest adayı", "Next Fest candidate")
        : match.score +
          localized(" etiket eşleşmesi", match.score === 1 ? " tag match" : " tag matches");
      copy.append(name, detail);
      badge.append(createGameCapsule(match.game), copy);
      badge.setAttribute(
        "aria-label",
        match.nextFest
          ? match.game.name +
            (match.eligible === false
              ? localized(
                  " Next Fest çıkış kuralını karşılamıyor",
                  " does not meet the Next Fest release-status rule",
                )
              : localized(
                  " Next Fest çıkış kuralını karşılıyor",
                  " meets the Next Fest release-status rule",
                ))
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
        const eligibleMatches = matches.filter(
          (match) => match.eligible !== false,
        );
        const result = row.querySelector("[data-game-match-result]");
        const warning = row.querySelector("[data-game-match-warning]");
        result.replaceChildren();
        warning.textContent = "";
        matches.forEach((match) => appendMatchBadge(result, match));
        result.hidden = matches.length === 0;

        if (row.dataset.kind === "next_fest" && games.length > 0) {
          const ineligible = matches
            .filter((match) => match.eligible === false)
            .map((match) => match.game);
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
        row.dataset.gameMatch = String(eligibleMatches.length > 0);
        if (eligibleMatches.length > 0) matchedEventCount++;

        document
          .querySelectorAll(
            '.timeline-chip[data-event-id="' + row.id.slice("etkinlik-".length) + '"]',
          )
          .forEach((chip) => {
            chip.querySelector("[data-game-chip-match]")?.remove();
            chip.classList.toggle("game-match", eligibleMatches.length > 0);
            chip.dataset.gameAriaSuffix =
              eligibleMatches.length > 0
                ? "; " +
                  eligibleMatches.map((match) => match.game.name).join(", ") +
                  " oyunuyla eşleşiyor"
                : "";
            refreshTimelineChipAria(chip);
            if (eligibleMatches.length === 0) return;
            const marker = document.createElement("span");
            marker.className = "timeline-game-match";
            marker.dataset.gameChipMatch = "";
            marker.textContent =
              "★ " +
              eligibleMatches[0].game.name +
              (eligibleMatches.length > 1
                ? " +" + (eligibleMatches.length - 1)
                : "");
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
            game.steamImageVersion < 5),
      );
      let changed = false;
      for (const game of pending) {
        try {
          const response = await fetch(
            "/api/steam-app?appid=" +
              encodeURIComponent(game.appId) +
              "&v=5",
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
          game.steamImageVersion = 5;
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
    refreshGameStats();
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
        refreshGameStats();
        updateGameMatches();
      }
      if (teamStateEnabled) {
        const sharedGameIds = new Set(sharedGames.map((game) => game.id));
        games
          .filter((game) => !sharedGameIds.has(game.id))
          .forEach((game) =>
            upsertTeamState("game:" + game.id, "game", game),
          );
      }
      initializeApplicationWorkflows(records);
    });

    gameForm?.addEventListener("submit", (event) => {
      event.preventDefault();
      const name = gameNameInput.value.trim();
      if (!name) return;
      const normalizedAppId = gameAppIdInput.value
        .replace(/\\D/g, "")
        .slice(0, 12);
      const existingByAppId = games.find(
        (item) => normalizedAppId && item.appId === normalizedAppId,
      );
      const game = {
        id: gameIdInput.value || existingByAppId?.id || createGameId(),
        name,
        appId: normalizedAppId,
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
          ? 5
          : games.find((item) => item.id === gameIdInput.value)
              ?.steamImageVersion || 0,
      };
      const index = games.findIndex((item) => item.id === game.id);
      if (index >= 0) games[index] = game;
      else games.push(game);
      writeGames();
      upsertTeamState("game:" + game.id, "game", game);
      renderGames();
      refreshGameStats();
      updateGameMatches();
      initializeApplicationWorkflows(teamStateRecords);
      resetGameForm();
    });

    gameDialog?.addEventListener("click", (event) => {
      if (event.target === gameDialog) closeGameDialog();
    });
    document.querySelector("[data-game-dialog-close]")?.addEventListener(
      "click",
      closeGameDialog,
    );
    gameCancel?.addEventListener("click", resetGameForm);
    gamesList?.addEventListener("click", (event) => {
      const button = event.target.closest("button");
      if (!button) return;
      const openId = button.dataset.gameOpen;
      if (openId) {
        const game = games.find((item) => item.id === openId);
        if (game) openGameDialog(game);
        return;
      }
    });
    gameDialog?.addEventListener("click", (event) => {
      const button = event.target.closest("button");
      if (!button) return;
      const editId = button.dataset.gameEdit;
      const deleteId =
        button.dataset.gameDelete || button.dataset.gameDialogDelete;
      const focusId =
        button.dataset.gameFocus || button.dataset.gameDialogFocus;
      if (focusId) {
        focusedGameId = focusedGameId === focusId ? "" : focusId;
        closeGameDialog();
        renderGames();
        refreshGameStats();
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
        if (gameCancel) gameCancel.hidden = false;
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
        closeGameDialog();
        writeGames();
        removeTeamState("game:" + deleteId);
        renderGames();
        refreshGameStats();
        updateGameMatches();
        initializeApplicationWorkflows(teamStateRecords);
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
      if (teamStateEnabled) {
        const sharedApplicationKeys = new Set(
          records
            .filter((record) => record.type === "application")
            .map((record) => String(record.key || "").slice("application:".length)),
        );
        Object.values(applications).forEach((record) => {
          const key = applicationKey(record?.eventId || "", record?.gameId || "");
          if (
            !record?.eventId ||
            !record?.gameId ||
            !record?.status ||
            sharedApplicationKeys.has(key)
          ) {
            return;
          }
          upsertTeamState(
            "application:" + key,
            "application",
            {
              eventId: record.eventId,
              gameId: record.gameId,
              status: record.status,
            },
          );
        });
      }
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
      apply();
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
          apply();
        });
      });
    });
    syncTaskUi();
    initializeApplicationWorkflows(teamStateRecords);
    teamStatePromise.then((records) => {
      records
        .filter((record) => record.type === "task")
        .forEach((record) => {
          const taskId = record.key.slice("task:".length);
          if (record.payload?.completed === true) completedTasks[taskId] = true;
          if (record.payload?.completed === false) delete completedTasks[taskId];
        });
      writeTaskMap(taskStorageKey, completedTasks);
      const sharedTaskIds = new Set(
        records
          .filter((record) => record.type === "task")
          .map((record) => record.key.slice("task:".length)),
      );
      taskBoxes
        .filter(
          (box) =>
            completedTasks[box.dataset.taskId] &&
            !sharedTaskIds.has(box.dataset.taskId),
        )
        .forEach((box) =>
          upsertTeamState(
            "task:" + box.dataset.taskId,
            "task",
            { completed: true },
          ),
      );
      syncTaskUi();
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
          refreshGameStats();
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
    await readSteamNews(paths.news),
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
