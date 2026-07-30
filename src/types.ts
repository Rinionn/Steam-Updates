export type EventKind = "seasonal_sale" | "themed_fest" | "next_fest";

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
  deadlines: SteamDeadline[];
  firstSeenAt?: string;
  lastSeenAt?: string;
}

export interface EventSnapshot {
  generatedAt: string;
  sourceUrl: string;
  events: SteamEvent[];
}

export interface SyncResult {
  snapshot: EventSnapshot;
  added: SteamEvent[];
  changed: SteamEvent[];
  removed: SteamEvent[];
}

export interface AppConfig {
  timezone: string;
  reminderDays: number[];
  lookaheadDays: number;
  emailDaily: boolean;
  calendarUrl: string;
  email: {
    to?: string;
    from?: string;
    resendApiKey?: string;
    smtpHost?: string;
    smtpPort: number;
    smtpSecure: boolean;
    smtpUser?: string;
    smtpPass?: string;
  };
}
