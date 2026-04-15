CREATE TABLE IF NOT EXISTS prompt_registry (
  id TEXT PRIMARY KEY,
  tenant_id TEXT,
  project_id TEXT,
  type TEXT NOT NULL,
  scope TEXT NOT NULL,
  target TEXT NOT NULL,
  version TEXT NOT NULL,
  content TEXT NOT NULL,
  status TEXT NOT NULL,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL,
  created_by TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  updated_by TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_prompt_registry_tenant ON prompt_registry (tenant_id);
CREATE INDEX IF NOT EXISTS idx_prompt_registry_project ON prompt_registry (project_id);
CREATE INDEX IF NOT EXISTS idx_prompt_registry_scope ON prompt_registry (scope);
CREATE INDEX IF NOT EXISTS idx_prompt_registry_status ON prompt_registry (status);
CREATE INDEX IF NOT EXISTS idx_prompt_registry_scope_type_target ON prompt_registry (scope, type, target);
