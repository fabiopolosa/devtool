ALTER TABLE jobs ADD COLUMN IF NOT EXISTS priority integer;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS retry_count integer;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS max_retries integer;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS payload jsonb;

UPDATE jobs
SET
  priority = COALESCE(priority, 0),
  retry_count = COALESCE(retry_count, 0),
  max_retries = COALESCE(max_retries, 3)
WHERE priority IS NULL OR retry_count IS NULL OR max_retries IS NULL;

ALTER TABLE jobs ALTER COLUMN priority SET NOT NULL;
ALTER TABLE jobs ALTER COLUMN retry_count SET NOT NULL;
ALTER TABLE jobs ALTER COLUMN max_retries SET NOT NULL;

ALTER TABLE jobs ALTER COLUMN priority SET DEFAULT 0;
ALTER TABLE jobs ALTER COLUMN retry_count SET DEFAULT 0;
ALTER TABLE jobs ALTER COLUMN max_retries SET DEFAULT 3;

CREATE INDEX IF NOT EXISTS idx_jobs_priority ON jobs(priority);
