export type EventKind = "seasonal_sale" | "themed_fest" | "next_fest";

export type ChangeKind =
  | "added"
  | "removed"
  | "date_shifted"
  | "deadline_changed"
  | "renamed";

export interface ChangeRecord {
  detectedAt: string;
  eventId: string;
  eventName: string;
  kind: ChangeKind;
  field?: string;
  before?: string;
  after?: string;
}

export type DeadlineKind =
  | "registration"
  | "review"
  | "marketing"
  | "milestone";

export interface SteamDeadline {
  id: string;
  kind: DeadlineKind;
  label: string;
  dueAt: string;
  sourceUrl: string;
}

export interface SteamEvent {
  id: string;
  name: string;
  kind: EventKind;
  startAt: string;
  endAt: string;
  sourceUrl: string;
  registrationUrl?: string;
  detailsUrl?: string;
  description?: string;
  descriptionTr?: string;
  matchTags: string[];
  deadlines: SteamDeadline[];
  firstSeenAt?: string;
  lastSeenAt?: string;
}

export interface EventSnapshot {
  generatedAt: string;
  sourceUrl: string;
  events: SteamEvent[];
}

export type SteamNewsKind = "new_release" | "coming_soon" | "platform";

export interface SteamNewsItem {
  id: string;
  title: string;
  kind: SteamNewsKind;
  url: string;
  publishedAt?: string;
  dateLabel?: string;
  imageUrl?: string;
  summary?: string;
}

export interface SteamNewsSnapshot {
  generatedAt: string;
  items: SteamNewsItem[];
}

export interface SyncResult {
  snapshot: EventSnapshot;
  added: SteamEvent[];
  changed: SteamEvent[];
  removed: SteamEvent[];
  changes: ChangeRecord[];
}

export interface AppConfig {
  timezone: string;
  reminderDays: number[];
  lookaheadDays: number;
  emailLookaheadDays: number;
  emailDaily: boolean;
  calendarUrl: string;
  dashboardUrl: string;
  email: {
    to?: string;
    bcc?: string;
    from?: string;
    resendApiKey?: string;
    smtpHost?: string;
    smtpPort: number;
    smtpSecure: boolean;
    smtpUser?: string;
    smtpPass?: string;
  };
}
