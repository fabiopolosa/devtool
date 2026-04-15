ALTER TABLE jobs ADD COLUMN IF NOT EXISTS dependencies jsonb;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS depends_on_count integer;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS ready boolean;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS started_at timestamptz;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS completed_at timestamptz;

UPDATE jobs
SET
  dependencies = COALESCE(dependencies, '[]'::jsonb),
  depends_on_count = COALESCE(depends_on_count, jsonb_array_length(COALESCE(dependencies, '[]'::jsonb))),
  ready = COALESCE(ready, CASE WHEN status = 'idle' AND jsonb_array_length(COALESCE(dependencies, '[]'::jsonb)) = 0 THEN true ELSE false END)
WHERE dependencies IS NULL OR depends_on_count IS NULL OR ready IS NULL;

ALTER TABLE jobs ALTER COLUMN dependencies SET NOT NULL;
ALTER TABLE jobs ALTER COLUMN depends_on_count SET NOT NULL;
ALTER TABLE jobs ALTER COLUMN ready SET NOT NULL;

ALTER TABLE jobs ALTER COLUMN dependencies SET DEFAULT '[]'::jsonb;
ALTER TABLE jobs ALTER COLUMN depends_on_count SET DEFAULT 0;
ALTER TABLE jobs ALTER COLUMN ready SET DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_jobs_ready ON jobs(ready);
CREATE INDEX IF NOT EXISTS idx_jobs_depends_on_count ON jobs(depends_on_count);
