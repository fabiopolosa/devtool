CREATE TABLE IF NOT EXISTS agents (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  role TEXT NOT NULL,
  icon TEXT NOT NULL,
  description TEXT NOT NULL,
  adapter_type TEXT NOT NULL,
  desired_skills JSONB NOT NULL DEFAULT '[]'::jsonb,
  report_to TEXT,
  runtime_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  capabilities JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_agents_role ON agents (role);
CREATE INDEX IF NOT EXISTS idx_agents_status ON agents (status);
