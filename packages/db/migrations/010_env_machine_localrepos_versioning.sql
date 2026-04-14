CREATE TABLE IF NOT EXISTS environments (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  type TEXT NOT NULL,
  region TEXT,
  base_url TEXT,
  status TEXT NOT NULL,
  notes JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL,
  created_by TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  updated_by TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_environments_status ON environments (status);
CREATE INDEX IF NOT EXISTS idx_environments_type ON environments (type);

CREATE TABLE IF NOT EXISTS machines (
  id TEXT PRIMARY KEY,
  environment_id TEXT NOT NULL,
  name TEXT NOT NULL,
  host TEXT NOT NULL,
  status TEXT NOT NULL,
  cpu_cores INTEGER NOT NULL,
  gpu_count INTEGER NOT NULL,
  ram_gb INTEGER NOT NULL,
  services JSONB NOT NULL DEFAULT '[]'::jsonb,
  agents JSONB NOT NULL DEFAULT '[]'::jsonb,
  last_heartbeat_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL,
  created_by TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  updated_by TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_machines_environment ON machines (environment_id);
CREATE INDEX IF NOT EXISTS idx_machines_status ON machines (status);

CREATE TABLE IF NOT EXISTS local_repositories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  root_path TEXT NOT NULL,
  description TEXT NOT NULL,
  status TEXT NOT NULL,
  detected_git BOOLEAN NOT NULL,
  current_branch TEXT,
  last_commit_sha TEXT,
  indexed_file_count INTEGER NOT NULL,
  last_scanned_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL,
  created_by TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  updated_by TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_local_repositories_root_path ON local_repositories (root_path);
CREATE INDEX IF NOT EXISTS idx_local_repositories_status ON local_repositories (status);

CREATE TABLE IF NOT EXISTS version_snapshots (
  id TEXT PRIMARY KEY,
  local_repository_id TEXT NOT NULL,
  task_id TEXT,
  label TEXT NOT NULL,
  trigger TEXT NOT NULL,
  files JSONB NOT NULL DEFAULT '[]'::jsonb,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL,
  created_by TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  updated_by TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_version_snapshots_repo ON version_snapshots (local_repository_id);
CREATE INDEX IF NOT EXISTS idx_version_snapshots_task ON version_snapshots (task_id);
CREATE INDEX IF NOT EXISTS idx_version_snapshots_trigger ON version_snapshots (trigger);
