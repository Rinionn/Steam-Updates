import "dotenv/config";
import path from "node:path";
import type { AppConfig } from "./types.js";

const rootDir = path.resolve(process.cwd());

function numberList(value: string | undefined, fallback: number[]): number[] {
  if (!value) return fallback;
  const parsed = value
    .split(",")
    .map((item) => Number(item.trim()))
    .filter((item) => Number.isFinite(item) && item >= 0);
  return parsed.length > 0 ? [...new Set(parsed)].sort((a, b) => b - a) : fallback;
}

function booleanValue(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
}

export const paths = {
  root: rootDir,
  dataDir: path.join(rootDir, "data"),
  snapshot: path.join(rootDir, "data", "events.json"),
  changelog: path.join(rootDir, "data", "changelog.json"),
  news: path.join(rootDir, "data", "news.json"),
  outDir: path.join(rootDir, "out"),
  pagesFallback: path.join(rootDir, "index.html"),
  report: path.join(rootDir, "out", "steam-etkinlikleri.html"),
  publicIndex: path.join(rootDir, "out", "index.html"),
  adminAsset: path.join(rootDir, "out", "admin-page.txt"),
  analyticsAsset: path.join(rootDir, "out", "analytics-page.txt"),
  analyticsPreview: path.join(rootDir, "out", "analytics.html"),
  calendarIcs: path.join(rootDir, "out", "steam-etkinlikleri.ics"),
  noJekyll: path.join(rootDir, "out", ".nojekyll"),
  emailPreview: path.join(rootDir, "out", "son-email.html"),
  emailTextPreview: path.join(rootDir, "out", "son-email.txt"),
  notificationState: path.join(rootDir, "data", "notification-state.json"),
};

export const config: AppConfig = {
  timezone: process.env.TIMEZONE || "Europe/Istanbul",
  reminderDays: numberList(process.env.REMINDER_DAYS, [30, 14, 7, 3, 1, 0]),
  lookaheadDays: Number(process.env.REPORT_LOOKAHEAD_DAYS || 550),
  emailLookaheadDays: Number(process.env.EMAIL_LOOKAHEAD_DAYS || 90),
  emailDaily: booleanValue(process.env.EMAIL_DAILY, true),
  calendarUrl:
    process.env.STEAM_CALENDAR_URL ||
    "https://partner.steamgames.com/doc/marketing/upcoming_events?l=english",
  dashboardUrl:
    process.env.PUBLIC_DASHBOARD_URL ||
    "https://steam-etkinlik-radari.batuhan-ozmen.workers.dev/",
  email: {
    to: process.env.EMAIL_TO,
    bcc: process.env.EMAIL_BCC,
    from: process.env.EMAIL_FROM,
    resendApiKey: process.env.RESEND_API_KEY,
    smtpHost: process.env.SMTP_HOST,
    smtpPort: Number(process.env.SMTP_PORT || 465),
    smtpSecure: booleanValue(process.env.SMTP_SECURE, true),
    smtpUser: process.env.SMTP_USER,
    smtpPass: process.env.SMTP_PASS,
    recipientApiUrl: process.env.EMAIL_RECIPIENT_API_URL,
    recipientApiSecret: process.env.EMAIL_AUTOMATION_SECRET,
    d1AccountId: process.env.CLOUDFLARE_ACCOUNT_ID,
    d1ApiToken: process.env.CLOUDFLARE_API_TOKEN,
    d1DatabaseId: process.env.CLOUDFLARE_D1_DATABASE_ID,
    sendTime: process.env.EMAIL_SEND_TIME || "09:30",
  },
};
