ALTER TABLE sets ADD COLUMN weight_unit TEXT NOT NULL DEFAULT 'lbs';

ALTER TABLE workout_strava_sync ADD COLUMN upload_id TEXT;

UPDATE workout_strava_sync
SET upload_id = NULL,
    source_updated_at = 0,
    updated_at = unixepoch() * 1000;