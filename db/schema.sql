CREATE TABLE IF NOT EXISTS team_state (
  state_key TEXT PRIMARY KEY,
  state_type TEXT NOT NULL,
  payload TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS access_users (
  email TEXT PRIMARY KEY,
  role TEXT NOT NULL DEFAULT 'member',
  enabled INTEGER NOT NULL DEFAULT 1,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS email_recipients (
  email TEXT PRIMARY KEY,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS email_delivery_recipients (
  email TEXT PRIMARY KEY,
  recipient_type TEXT NOT NULL DEFAULT 'bcc',
  enabled INTEGER NOT NULL DEFAULT 1,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS email_delivery_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  enabled INTEGER NOT NULL DEFAULT 1,
  send_time TEXT NOT NULL DEFAULT '09:30',
  timezone TEXT NOT NULL DEFAULT 'Europe/Istanbul',
  sender_name TEXT NOT NULL DEFAULT 'Steam Etkinlik Radarı',
  subject_template TEXT NOT NULL,
  last_sent_date TEXT,
  updated_by TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

INSERT OR IGNORE INTO email_delivery_settings
  (id, enabled, send_time, timezone, sender_name, subject_template, last_sent_date, updated_by, updated_at)
VALUES
  (
    1,
    1,
    '09:30',
    'Europe/Istanbul',
    'Steam Etkinlik Radarı',
    'Steam Etkinlik Takibi · {{kritik}} kritik tarih · {{etkinlik}} etkinlik',
    NULL,
    'system',
    datetime('now')
  );

CREATE TABLE IF NOT EXISTS analytics_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  occurred_at TEXT NOT NULL,
  user_email TEXT NOT NULL,
  event_name TEXT NOT NULL,
  target TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS analytics_events_occurred_at
  ON analytics_events (occurred_at);

CREATE INDEX IF NOT EXISTS team_state_type_idx
  ON team_state (state_type, updated_at);
