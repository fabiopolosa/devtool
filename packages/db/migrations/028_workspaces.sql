CREATE TABLE IF NOT EXISTS workspaces (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('local', 'remote')),
  local_path TEXT,
  runtime_status TEXT NOT NULL CHECK (runtime_status IN ('stopped', 'starting', 'running', 'stopping', 'deploying', 'restarting', 'error')),
  runtime_details JSONB NOT NULL DEFAULT '{}'::jsonb,
  last_started_at TIMESTAMPTZ,
  last_stopped_at TIMESTAMPTZ,
  last_deployed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL,
  created_by TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  updated_by TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_workspaces_tenant_project
  ON workspaces (tenant_id, project_id);

CREATE INDEX IF NOT EXISTS idx_workspaces_project
  ON workspaces (project_id);

CREATE INDEX IF NOT EXISTS idx_workspaces_runtime_status
  ON workspaces (runtime_status);
