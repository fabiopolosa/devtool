ALTER TABLE provider_configs
  ADD COLUMN IF NOT EXISTS tenant_id TEXT;

UPDATE provider_configs
SET tenant_id = 'tenant_default'
WHERE tenant_id IS NULL;

ALTER TABLE provider_configs
  ALTER COLUMN tenant_id SET NOT NULL;

ALTER TABLE provider_configs
  ADD COLUMN IF NOT EXISTS provider_id TEXT;

UPDATE provider_configs
SET provider_id = provider
WHERE provider_id IS NULL;

ALTER TABLE provider_configs
  ALTER COLUMN provider_id SET NOT NULL;

ALTER TABLE provider_configs
  ADD COLUMN IF NOT EXISTS api_key TEXT;

CREATE INDEX IF NOT EXISTS idx_provider_configs_tenant ON provider_configs (tenant_id);
CREATE INDEX IF NOT EXISTS idx_provider_configs_provider_id ON provider_configs (provider_id);
CREATE INDEX IF NOT EXISTS idx_provider_configs_tenant_provider ON provider_configs (tenant_id, provider_id);
