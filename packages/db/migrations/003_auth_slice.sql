CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  display_name TEXT NOT NULL,
  status TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL,
  created_by TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  updated_by TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_users_email ON users (email);
CREATE INDEX IF NOT EXISTS idx_users_status ON users (status);

CREATE TABLE IF NOT EXISTS roles (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  permissions JSONB NOT NULL,
  is_system BOOLEAN NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  created_by TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  updated_by TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_roles_name ON roles (name);

CREATE TABLE IF NOT EXISTS user_roles (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  role_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  created_by TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  updated_by TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_user_roles_user ON user_roles (user_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_role ON user_roles (role_id);
CREATE UNIQUE INDEX IF NOT EXISTS ux_user_roles_user_role ON user_roles (user_id, role_id);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  token_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  created_by TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  updated_by TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_sessions_token_hash ON sessions (token_hash);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions (user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions (expires_at);

DO $$
BEGIN
  IF to_regclass('public.entity_records') IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO users (id, email, display_name, status, password_hash, last_login_at, created_at, created_by, updated_at, updated_by)
  SELECT
    data->>'id',
    LOWER(COALESCE(data->>'email', '')),
    COALESCE(data->>'displayName', data->>'email', ''),
    COALESCE(data->>'status', 'active'),
    COALESCE(data->>'passwordHash', ''),
    (data->>'lastLoginAt')::timestamptz,
    COALESCE((data->>'createdAt')::timestamptz, NOW()),
    COALESCE(data->>'createdBy', 'migration'),
    COALESCE((data->>'updatedAt')::timestamptz, NOW()),
    COALESCE(data->>'updatedBy', 'migration')
  FROM entity_records
  WHERE table_name = 'users'
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO roles (id, name, description, permissions, is_system, created_at, created_by, updated_at, updated_by)
  SELECT
    data->>'id',
    COALESCE(data->>'name', 'viewer'),
    COALESCE(data->>'description', ''),
    COALESCE(data->'permissions', '[]'::jsonb),
    COALESCE((data->>'isSystem')::boolean, false),
    COALESCE((data->>'createdAt')::timestamptz, NOW()),
    COALESCE(data->>'createdBy', 'migration'),
    COALESCE((data->>'updatedAt')::timestamptz, NOW()),
    COALESCE(data->>'updatedBy', 'migration')
  FROM entity_records
  WHERE table_name = 'roles'
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO user_roles (id, user_id, role_id, created_at, created_by, updated_at, updated_by)
  SELECT
    data->>'id',
    data->>'userId',
    data->>'roleId',
    COALESCE((data->>'createdAt')::timestamptz, NOW()),
    COALESCE(data->>'createdBy', 'migration'),
    COALESCE((data->>'updatedAt')::timestamptz, NOW()),
    COALESCE(data->>'updatedBy', 'migration')
  FROM entity_records
  WHERE table_name = 'user_roles'
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO sessions (
    id, user_id, token_hash, expires_at, revoked_at, ip_address, user_agent,
    created_at, created_by, updated_at, updated_by
  )
  SELECT
    data->>'id',
    data->>'userId',
    COALESCE(data->>'tokenHash', ''),
    COALESCE((data->>'expiresAt')::timestamptz, NOW() + INTERVAL '24 hours'),
    (data->>'revokedAt')::timestamptz,
    data->>'ipAddress',
    data->>'userAgent',
    COALESCE((data->>'createdAt')::timestamptz, NOW()),
    COALESCE(data->>'createdBy', 'migration'),
    COALESCE((data->>'updatedAt')::timestamptz, NOW()),
    COALESCE(data->>'updatedBy', 'migration')
  FROM entity_records
  WHERE table_name = 'sessions'
  ON CONFLICT (id) DO NOTHING;
END $$;
