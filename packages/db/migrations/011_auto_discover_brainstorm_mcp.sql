CREATE TABLE IF NOT EXISTS provider_discovery_logs (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  queries JSONB NOT NULL,
  discovered_providers JSONB NOT NULL,
  discovered_models JSONB NOT NULL,
  status TEXT NOT NULL,
  search_started_at TIMESTAMPTZ NOT NULL,
  search_finished_at TIMESTAMPTZ NOT NULL,
  notes TEXT,
  raw_results JSONB,
  created_at TIMESTAMPTZ NOT NULL,
  created_by TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  updated_by TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_provider_discovery_logs_status
  ON provider_discovery_logs (status);

CREATE INDEX IF NOT EXISTS idx_provider_discovery_logs_finished
  ON provider_discovery_logs (search_finished_at);

CREATE TABLE IF NOT EXISTS subprompts (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  category TEXT NOT NULL,
  summary TEXT NOT NULL,
  prompt TEXT NOT NULL,
  tags JSONB NOT NULL,
  source_path TEXT NOT NULL,
  enabled BOOLEAN NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_subprompts_category
  ON subprompts (category);

CREATE INDEX IF NOT EXISTS idx_subprompts_enabled
  ON subprompts (enabled);

CREATE TABLE IF NOT EXISTS brainstorm_sessions (
  id TEXT PRIMARY KEY,
  thread_id TEXT,
  project_id TEXT,
  status TEXT NOT NULL,
  project_intent TEXT NOT NULL,
  selected_subprompt_ids JSONB NOT NULL,
  questions JSONB NOT NULL,
  answers JSONB NOT NULL,
  plan_id TEXT,
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL,
  created_by TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  updated_by TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_brainstorm_sessions_status
  ON brainstorm_sessions (status);

CREATE INDEX IF NOT EXISTS idx_brainstorm_sessions_project
  ON brainstorm_sessions (project_id);

CREATE INDEX IF NOT EXISTS idx_brainstorm_sessions_thread
  ON brainstorm_sessions (thread_id);

CREATE TABLE IF NOT EXISTS brainstorm_plans (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  title TEXT NOT NULL,
  executive_summary TEXT NOT NULL,
  plan JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  created_by TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  updated_by TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_brainstorm_plans_session
  ON brainstorm_plans (session_id);

CREATE TABLE IF NOT EXISTS mcp_connections (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  base_url TEXT NOT NULL,
  auth_secret_ref TEXT,
  enabled BOOLEAN NOT NULL,
  status TEXT NOT NULL,
  capabilities JSONB NOT NULL,
  metadata JSONB NOT NULL,
  last_checked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL,
  created_by TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  updated_by TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_mcp_connections_status
  ON mcp_connections (status);

CREATE TABLE IF NOT EXISTS mcp_delegation_runs (
  id TEXT PRIMARY KEY,
  connection_id TEXT NOT NULL,
  operation TEXT NOT NULL,
  payload JSONB NOT NULL,
  status TEXT NOT NULL,
  response JSONB,
  error TEXT,
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL,
  created_by TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  updated_by TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_mcp_delegation_runs_connection
  ON mcp_delegation_runs (connection_id);

CREATE INDEX IF NOT EXISTS idx_mcp_delegation_runs_status
  ON mcp_delegation_runs (status);

CREATE INDEX IF NOT EXISTS idx_mcp_delegation_runs_operation
  ON mcp_delegation_runs (operation);
