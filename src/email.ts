import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import nodemailer from "nodemailer";
import { DateTime } from "luxon";
import { config, paths } from "./config.js";
import { deadlineCopy } from "./deadline-copy.js";
import { buildEventTasks } from "./event-tasks.js";
import {
  markDigestSent,
  readNotificationState,
} from "./storage.js";
import type { EventSnapshot, SteamEvent } from "./types.js";
import { escapeHtml } from "./utils.js";
import { createReportModel } from "./view-model.js";

const kindLabels: Record<SteamEvent["kind"], string> = {
  seasonal_sale: "Sezon indirimi",
  themed_fest: "Temalı festival",
  next_fest: "Next Fest",
};

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

export function renderDigest(snapshot: EventSnapshot): {
  subject: string;
  html: string;
  text: string;
} {
  const model = createReportModel(snapshot, config);
  const deadlines = model.deadlines.slice(0, 12);
  const events = model.events.slice(0, 18);
  const subject = safeSubject(
    `Steam Etkinlik Radarı · ${model.events.length} etkinlik · ${model.urgentDeadlines.length} yakın son tarih`,
  );

  const deadlineHtml =
    deadlines.length > 0
      ? deadlines
          .map(
            ({ deadline, event, daysLeft }) => {
              const copy = deadlineCopy(deadline);
              return `
              <tr>
                <td style="padding:14px 0;border-bottom:1px solid #283746">
                  <strong style="display:block;color:#f4f7fa">${escapeHtml(event.name)}</strong>
                  <span style="display:block;margin-top:5px;color:#ffc65c;font-size:12px;font-weight:700">${escapeHtml(copy.category)}</span>
                  <span style="display:block;margin-top:4px;color:#f4f7fa">${escapeHtml(copy.title)}</span>
                  <span style="display:block;margin-top:4px;color:#aab7c4;line-height:1.45">${escapeHtml(copy.description)}</span>
                </td>
                <td style="padding:14px 0 14px 18px;border-bottom:1px solid #283746;white-space:nowrap;text-align:right">
                  <strong style="color:${daysLeft <= 3 ? "#ff7777" : "#ffc65c"}">${escapeHtml(countdown(daysLeft))}</strong>
                  <span style="display:block;margin-top:5px;color:#8fa0af">${escapeHtml(localDate(deadline.dueAt, true))}</span>
                </td>
              </tr>`;
            },
          )
          .join("")
      : `<tr><td style="padding:18px 0;color:#8fa0af">Yaklaşan bilinen bir son tarih yok.</td></tr>`;

  const eventHtml = events
    .map((event) => {
      const actionUrl = event.registrationUrl || event.detailsUrl || event.sourceUrl;
      const tasks = buildEventTasks(event);
      return `
        <tr>
          <td style="padding:13px 0;border-bottom:1px solid #283746">
            <span style="display:block;color:#83d7ee;font-size:12px;font-weight:700">${escapeHtml(kindLabels[event.kind])}</span>
            <strong style="display:block;margin-top:4px;color:#f4f7fa">${escapeHtml(event.name)}</strong>
            ${
              tasks.length
                ? `<span style="display:block;margin-top:5px;color:#aab7c4;font-size:12px">${tasks.length} görev · ${tasks
                    .slice(0, 3)
                    .map((task) => escapeHtml(task.title))
                    .join(" · ")}</span>`
                : ""
            }
          </td>
          <td style="padding:13px 0 13px 18px;border-bottom:1px solid #283746;white-space:nowrap;text-align:right">
            <span style="display:block;color:#d6dee6">${escapeHtml(localDate(event.startAt))}</span>
            <a href="${escapeHtml(actionUrl)}" style="display:block;margin-top:4px;color:#83d7ee;text-decoration:none">Steam’de aç ↗</a>
          </td>
        </tr>`;
    })
    .join("");

  const html = `<!doctype html>
<html lang="tr">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;background:#0b1118;color:#f4f7fa;font-family:Arial,sans-serif">
  <div style="display:none;max-height:0;overflow:hidden">Steam festivalleri ve son başvuru tarihleri günlük özeti.</div>
  <div style="width:min(680px,100%);margin:0 auto;padding:28px 16px;box-sizing:border-box">
    <div style="padding:28px;border:1px solid #283746;border-radius:18px;background:#15202b">
      <span style="color:#b7e445;font-size:12px;font-weight:800;letter-spacing:.12em">GÜNLÜK STEAMWORKS TAKİBİ</span>
      <h1 style="margin:10px 0 8px;font-size:32px;line-height:1.05">Steam Etkinlik Radarı</h1>
      <p style="margin:0;color:#aab7c4;line-height:1.5">${escapeHtml(
        model.generated.setLocale("tr").toFormat("d LLLL yyyy, HH:mm"),
      )} · İstanbul saati</p>
    </div>

    <h2 style="margin:28px 0 8px;font-size:20px">Son tarihler</h2>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse">${deadlineHtml}</table>

    <h2 style="margin:28px 0 8px;font-size:20px">Yaklaşan etkinlikler</h2>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse">${eventHtml}</table>

    <p style="margin:28px 0 0;color:#748595;font-size:12px;line-height:1.5">
      Kaynak: Valve Steamworks dokümantasyonu. Bu bot salt okunur çalışır; etkinlik kaydı veya hesap değişikliği yapmaz.
    </p>
  </div>
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
      const taskLine = tasks.length
        ? `\n  Görevler: ${tasks.map((task) => task.title).join(" · ")}`
        : "";
      return `- ${event.name} · ${kindLabels[event.kind]} · ${localDate(event.startAt)}${taskLine}\n  ${actionUrl}`;
    })
    .join("\n");

  const text = `STEAM ETKİNLİK RADARI
${model.generated.setLocale("tr").toFormat("d LLLL yyyy, HH:mm")} · İstanbul saati

SON TARİHLER
${deadlineText}

YAKLAŞAN ETKİNLİKLER
${eventText}

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

async function sendWithResend(
  subject: string,
  html: string,
  text: string,
  localDateKey: string,
): Promise<string> {
  const recipientHash = createHash("sha1")
    .update(config.email.to || "")
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
      from: config.email.from,
      to: [config.email.to],
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
  subject: string,
  html: string,
  text: string,
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
    from: config.email.from,
    to: config.email.to,
    subject,
    html,
    text,
  });
  return result.messageId;
}

export async function sendDigest(
  snapshot: EventSnapshot,
  options: { force?: boolean } = {},
): Promise<DigestResult> {
  const rendered = renderDigest(snapshot);
  await writePreviews(rendered.html, rendered.text);

  const localDateKey = DateTime.now().setZone(config.timezone).toISODate();
  if (!localDateKey) throw new Error("Yerel tarih üretilemedi.");

  const state = await readNotificationState(paths.notificationState);
  if (!options.force && state.lastDigestDate === localDateKey) {
    return {
      sent: false,
      skippedReason: "Bugünün özeti daha önce gönderildi.",
      htmlPreview: paths.emailPreview,
      textPreview: paths.emailTextPreview,
    };
  }

  if (!config.email.to || !config.email.from) {
    return {
      sent: false,
      skippedReason: "EMAIL_TO veya EMAIL_FROM ayarlı değil.",
      htmlPreview: paths.emailPreview,
      textPreview: paths.emailTextPreview,
    };
  }

  let provider: DigestResult["provider"];
  let messageId: string;
  if (config.email.resendApiKey) {
    provider = "resend";
    messageId = await sendWithResend(
      rendered.subject,
      rendered.html,
      rendered.text,
      localDateKey,
    );
  } else if (
    config.email.smtpHost &&
    config.email.smtpUser &&
    config.email.smtpPass
  ) {
    provider = "smtp";
    messageId = await sendWithSmtp(rendered.subject, rendered.html, rendered.text);
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
  return {
    sent: true,
    provider,
    messageId,
    htmlPreview: paths.emailPreview,
    textPreview: paths.emailTextPreview,
  };
}
