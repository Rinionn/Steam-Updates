CREATE TABLE IF NOT EXISTS team_state (
  state_key TEXT PRIMARY KEY,
  state_type TEXT NOT NULL,
  payload TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS team_state_type_idx
  ON team_state (state_type, updated_at);
