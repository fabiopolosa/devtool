ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS project_id text;

CREATE INDEX IF NOT EXISTS idx_jobs_project ON jobs(project_id);

-- Backfill from direct project-linked resources.
UPDATE jobs
SET project_id = resource_id
WHERE project_id IS NULL
  AND resource_type = 'project'
  AND resource_id IS NOT NULL;

-- Backfill from task resources.
UPDATE jobs AS j
SET project_id = t.project_id
FROM tasks AS t
WHERE j.project_id IS NULL
  AND j.resource_type = 'task'
  AND j.resource_id = t.id;

-- Backfill from brainstorm session resources.
UPDATE jobs AS j
SET project_id = s.project_id
FROM brainstorm_sessions AS s
WHERE j.project_id IS NULL
  AND j.resource_type = 'brainstorm'
  AND j.resource_id = s.id
  AND s.project_id IS NOT NULL;

-- Backfill from brainstorm plan resources.
UPDATE jobs AS j
SET project_id = s.project_id
FROM brainstorm_plans AS p
JOIN brainstorm_sessions AS s ON s.id = p.session_id
WHERE j.project_id IS NULL
  AND j.resource_type = 'brainstorm'
  AND j.resource_id = p.id
  AND s.project_id IS NOT NULL;
