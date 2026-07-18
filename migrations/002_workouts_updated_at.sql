-- Add updated_at column to workouts for last-write-wins conflict resolution during sync
ALTER TABLE workouts ADD COLUMN updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000);
