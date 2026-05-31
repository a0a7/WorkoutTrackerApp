ALTER TABLE workouts ADD COLUMN activity_type TEXT;

CREATE TABLE IF NOT EXISTS strava_import_state (
  user_id TEXT PRIMARY KEY,
  last_synced_at INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  FOREIGN KEY (user_id) REFERENCES users(id)
);