ALTER TABLE IF EXISTS audit_events
  ADD COLUMN IF NOT EXISTS tenant_id TEXT,
  ADD COLUMN IF NOT EXISTS project_id TEXT,
  ADD COLUMN IF NOT EXISTS job_id TEXT;

UPDATE audit_events
SET tenant_id = COALESCE(tenant_id, 'tenant_default')
WHERE tenant_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_audit_events_tenant ON audit_events (tenant_id);
CREATE INDEX IF NOT EXISTS idx_audit_events_project ON audit_events (project_id);
CREATE INDEX IF NOT EXISTS idx_audit_events_job ON audit_events (job_id);

CREATE TABLE IF NOT EXISTS usage_events (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  project_id TEXT,
  job_id TEXT,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  input_tokens INTEGER NOT NULL,
  output_tokens INTEGER NOT NULL,
  cost DOUBLE PRECISION NOT NULL,
  metadata JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  created_by TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  updated_by TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_usage_events_tenant ON usage_events (tenant_id);
CREATE INDEX IF NOT EXISTS idx_usage_events_project ON usage_events (project_id);
CREATE INDEX IF NOT EXISTS idx_usage_events_job ON usage_events (job_id);
CREATE INDEX IF NOT EXISTS idx_usage_events_provider ON usage_events (provider);
CREATE INDEX IF NOT EXISTS idx_usage_events_model ON usage_events (model);
CREATE INDEX IF NOT EXISTS idx_usage_events_created ON usage_events (created_at);
