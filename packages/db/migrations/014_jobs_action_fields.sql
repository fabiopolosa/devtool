ALTER TABLE jobs ADD COLUMN IF NOT EXISTS action_required boolean NOT NULL DEFAULT false;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS action_type text;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS resource_type text;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS resource_id text;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS created_by text;

UPDATE jobs
SET
  action_required = COALESCE(action_required, false),
  created_by = COALESCE(created_by, 'system')
WHERE created_by IS NULL OR action_required IS NULL;

ALTER TABLE jobs ALTER COLUMN created_by SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_jobs_action_required ON jobs(action_required);
CREATE INDEX IF NOT EXISTS idx_jobs_resource ON jobs(resource_type, resource_id);
