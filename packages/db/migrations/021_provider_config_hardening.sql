ALTER TABLE provider_configs
  ADD COLUMN IF NOT EXISTS secret_ref TEXT;

ALTER TABLE provider_configs
  ADD COLUMN IF NOT EXISTS validation_status TEXT;

ALTER TABLE provider_configs
  ADD COLUMN IF NOT EXISTS last_validated_at TIMESTAMPTZ;

ALTER TABLE provider_configs
  ADD COLUMN IF NOT EXISTS validation_error TEXT;

ALTER TABLE provider_configs
  ADD COLUMN IF NOT EXISTS requests_per_minute INTEGER;

ALTER TABLE provider_configs
  ADD COLUMN IF NOT EXISTS tokens_per_minute INTEGER;

UPDATE provider_configs
SET validation_status = 'unknown'
WHERE validation_status IS NULL;

-- Stop persisting plaintext API keys in provider_configs; keep references only in auth_ref/secret_ref.
UPDATE provider_configs
SET api_key = NULL
WHERE api_key IS NOT NULL;

ALTER TABLE provider_configs
  ALTER COLUMN validation_status SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_provider_configs_validation_status
  ON provider_configs (validation_status);

CREATE INDEX IF NOT EXISTS idx_provider_configs_tenant_enabled
  ON provider_configs (tenant_id, enabled);
