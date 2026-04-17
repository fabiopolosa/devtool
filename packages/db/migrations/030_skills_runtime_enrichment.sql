ALTER TABLE skills
  ADD COLUMN IF NOT EXISTS scope TEXT NOT NULL DEFAULT 'tenant',
  ADD COLUMN IF NOT EXISTS source_type TEXT NOT NULL DEFAULT 'github',
  ADD COLUMN IF NOT EXISTS source_ref TEXT,
  ADD COLUMN IF NOT EXISTS capabilities JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS validation_status TEXT NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS validation_errors JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS validation_warnings JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS last_validated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS sandbox_profile JSONB NOT NULL DEFAULT '{"filesystem":"workspace_only","network":false,"process":true}'::jsonb,
  ADD COLUMN IF NOT EXISTS execution_config JSONB NOT NULL DEFAULT '{"commandAllowlist":[],"requireConfirmation":true,"entryArgs":[]}'::jsonb,
  ADD COLUMN IF NOT EXISTS current_version TEXT,
  ADD COLUMN IF NOT EXISTS version_history JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

UPDATE skills
SET current_version = version
WHERE current_version IS NULL;

CREATE INDEX IF NOT EXISTS idx_skills_scope ON skills (scope);
CREATE INDEX IF NOT EXISTS idx_skills_validation_status ON skills (validation_status);

ALTER TABLE skills
  DROP CONSTRAINT IF EXISTS chk_skills_scope;
ALTER TABLE skills
  ADD CONSTRAINT chk_skills_scope
  CHECK (scope IN ('system', 'tenant', 'user'));

ALTER TABLE skills
  DROP CONSTRAINT IF EXISTS chk_skills_source_type;
ALTER TABLE skills
  ADD CONSTRAINT chk_skills_source_type
  CHECK (source_type IN ('github', 'file', 'zip'));

ALTER TABLE skills
  DROP CONSTRAINT IF EXISTS chk_skills_validation_status;
ALTER TABLE skills
  ADD CONSTRAINT chk_skills_validation_status
  CHECK (validation_status IN ('pending', 'valid', 'invalid'));
