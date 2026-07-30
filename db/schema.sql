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
