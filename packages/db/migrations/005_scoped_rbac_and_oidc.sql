ALTER TABLE IF EXISTS sessions
  ADD COLUMN IF NOT EXISTS refresh_token_hash TEXT,
  ADD COLUMN IF NOT EXISTS refresh_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS refresh_revoked_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS ux_sessions_refresh_token_hash ON sessions (refresh_token_hash);
CREATE INDEX IF NOT EXISTS idx_sessions_refresh_expires ON sessions (refresh_expires_at);

CREATE TABLE IF NOT EXISTS project_role_bindings (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  role_id TEXT NOT NULL,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL,
  created_by TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  updated_by TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_project_role_bindings_user ON project_role_bindings (user_id);
CREATE INDEX IF NOT EXISTS idx_project_role_bindings_project ON project_role_bindings (project_id);
CREATE INDEX IF NOT EXISTS idx_project_role_bindings_role ON project_role_bindings (role_id);
CREATE UNIQUE INDEX IF NOT EXISTS ux_project_role_bindings_user_project_role
  ON project_role_bindings (user_id, project_id, role_id);

CREATE TABLE IF NOT EXISTS repository_role_bindings (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  repository_id TEXT NOT NULL,
  role_id TEXT NOT NULL,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL,
  created_by TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  updated_by TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_repository_role_bindings_user ON repository_role_bindings (user_id);
CREATE INDEX IF NOT EXISTS idx_repository_role_bindings_repository ON repository_role_bindings (repository_id);
CREATE INDEX IF NOT EXISTS idx_repository_role_bindings_role ON repository_role_bindings (role_id);
CREATE UNIQUE INDEX IF NOT EXISTS ux_repository_role_bindings_user_repository_role
  ON repository_role_bindings (user_id, repository_id, role_id);

CREATE TABLE IF NOT EXISTS delegated_permissions (
  id TEXT PRIMARY KEY,
  granted_by_user_id TEXT NOT NULL,
  grantee_user_id TEXT NOT NULL,
  permission TEXT NOT NULL,
  scope_type TEXT NOT NULL,
  scope_id TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL,
  created_by TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  updated_by TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_delegated_permissions_grantee ON delegated_permissions (grantee_user_id);
CREATE INDEX IF NOT EXISTS idx_delegated_permissions_scope ON delegated_permissions (scope_type, scope_id);
CREATE INDEX IF NOT EXISTS idx_delegated_permissions_expires ON delegated_permissions (expires_at);

CREATE TABLE IF NOT EXISTS oidc_auth_states (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  state TEXT NOT NULL,
  nonce TEXT NOT NULL,
  code_verifier TEXT NOT NULL,
  redirect_uri TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  created_by TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  updated_by TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_oidc_auth_states_state ON oidc_auth_states (state);
CREATE INDEX IF NOT EXISTS idx_oidc_auth_states_expires ON oidc_auth_states (expires_at);
CREATE INDEX IF NOT EXISTS idx_oidc_auth_states_consumed ON oidc_auth_states (consumed_at);
