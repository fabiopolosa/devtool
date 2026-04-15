CREATE TABLE IF NOT EXISTS tenants (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL
);

INSERT INTO tenants (id, name, created_at)
VALUES ('tenant_default', 'Default Tenant', now())
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS user_tenants (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  role TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  CONSTRAINT ck_user_tenants_role CHECK (role IN ('owner', 'admin', 'manager', 'user', 'guest'))
);

CREATE INDEX IF NOT EXISTS idx_user_tenants_user ON user_tenants (user_id);
CREATE INDEX IF NOT EXISTS idx_user_tenants_tenant ON user_tenants (tenant_id);
CREATE UNIQUE INDEX IF NOT EXISTS ux_user_tenants_user_tenant ON user_tenants (user_id, tenant_id);

INSERT INTO user_tenants (id, user_id, tenant_id, role, created_at)
SELECT
  'user_tenant_' || u.id || '_tenant_default',
  u.id,
  'tenant_default',
  CASE WHEN EXISTS (
    SELECT 1
    FROM user_roles ur
    JOIN roles r ON r.id = ur.role_id
    WHERE ur.user_id = u.id
      AND r.name = 'admin'
  ) THEN 'owner' ELSE 'user' END,
  now()
FROM users u
ON CONFLICT (id) DO NOTHING;

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL DEFAULT 'tenant_default';
CREATE INDEX IF NOT EXISTS idx_projects_tenant ON projects (tenant_id);

ALTER TABLE repositories
  ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL DEFAULT 'tenant_default';
CREATE INDEX IF NOT EXISTS idx_repositories_tenant ON repositories (tenant_id);

ALTER TABLE project_repository_links
  ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL DEFAULT 'tenant_default';
CREATE INDEX IF NOT EXISTS idx_project_repository_links_tenant ON project_repository_links (tenant_id);

ALTER TABLE roadmap_items
  ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL DEFAULT 'tenant_default';
CREATE INDEX IF NOT EXISTS idx_roadmap_items_tenant ON roadmap_items (tenant_id);

ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL DEFAULT 'tenant_default';
CREATE INDEX IF NOT EXISTS idx_tasks_tenant ON tasks (tenant_id);

ALTER TABLE task_runs
  ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL DEFAULT 'tenant_default';
CREATE INDEX IF NOT EXISTS idx_task_runs_tenant ON task_runs (tenant_id);

ALTER TABLE approvals
  ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL DEFAULT 'tenant_default';
CREATE INDEX IF NOT EXISTS idx_approvals_tenant ON approvals (tenant_id);

ALTER TABLE artifacts
  ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL DEFAULT 'tenant_default';
CREATE INDEX IF NOT EXISTS idx_artifacts_tenant ON artifacts (tenant_id);

ALTER TABLE brainstorm_sessions
  ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL DEFAULT 'tenant_default';
CREATE INDEX IF NOT EXISTS idx_brainstorm_sessions_tenant ON brainstorm_sessions (tenant_id);

ALTER TABLE brainstorm_plans
  ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL DEFAULT 'tenant_default';
CREATE INDEX IF NOT EXISTS idx_brainstorm_plans_tenant ON brainstorm_plans (tenant_id);

CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL DEFAULT 'tenant_default',
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  CONSTRAINT ck_jobs_status CHECK (status IN ('idle', 'running', 'waiting_user', 'done', 'error'))
);

CREATE INDEX IF NOT EXISTS idx_jobs_tenant ON jobs (tenant_id);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs (status);
CREATE INDEX IF NOT EXISTS idx_jobs_type ON jobs (type);
