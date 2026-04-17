ALTER TABLE skills
  ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL DEFAULT 'tenant_default';

UPDATE skills
SET tenant_id = COALESCE(NULLIF(tenant_id, ''), 'tenant_default')
WHERE tenant_id IS NULL OR btrim(tenant_id) = '';

ALTER TABLE skills
  ALTER COLUMN tenant_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_skills_tenant ON skills (tenant_id);

DROP INDEX IF EXISTS ux_skills_repository_name;
DROP INDEX IF EXISTS ux_skills_tenant_repository_name;
CREATE UNIQUE INDEX IF NOT EXISTS ux_skills_tenant_repository_name
  ON skills (tenant_id, repository_url, name);
