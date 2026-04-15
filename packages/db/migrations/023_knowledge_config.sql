CREATE TABLE IF NOT EXISTS knowledge_configs (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  project_id TEXT,
  scope TEXT NOT NULL,
  auto_capture BOOLEAN NOT NULL DEFAULT FALSE,
  capture_modes JSONB NOT NULL DEFAULT '["generation_output"]'::jsonb,
  require_approval BOOLEAN NOT NULL DEFAULT FALSE,
  max_nodes INTEGER NOT NULL DEFAULT 8,
  relevance_threshold DOUBLE PRECISION NOT NULL DEFAULT 0.2,
  versioning BOOLEAN NOT NULL DEFAULT TRUE,
  require_review BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL,
  created_by TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  updated_by TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_knowledge_configs_tenant
  ON knowledge_configs (tenant_id);

CREATE INDEX IF NOT EXISTS idx_knowledge_configs_project
  ON knowledge_configs (project_id);

CREATE INDEX IF NOT EXISTS idx_knowledge_configs_scope
  ON knowledge_configs (scope);

CREATE UNIQUE INDEX IF NOT EXISTS ux_knowledge_configs_tenant_scope_project
  ON knowledge_configs (tenant_id, scope, project_id);

ALTER TABLE knowledge_configs
  ADD CONSTRAINT chk_knowledge_configs_max_nodes_positive
  CHECK (max_nodes > 0);

ALTER TABLE knowledge_configs
  ADD CONSTRAINT chk_knowledge_configs_threshold_range
  CHECK (relevance_threshold >= 0 AND relevance_threshold <= 1);
