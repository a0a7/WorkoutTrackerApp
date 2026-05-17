CREATE TABLE IF NOT EXISTS user_strava_tokens (
  user_id TEXT PRIMARY KEY,
  athlete_id INTEGER,
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS workout_strava_sync (
  workout_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  strava_activity_id INTEGER NOT NULL,
  source_updated_at INTEGER NOT NULL,
  last_synced_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (workout_id) REFERENCES workouts(id)
);

CREATE INDEX IF NOT EXISTS idx_workout_strava_sync_user_id ON workout_strava_sync(user_id);
