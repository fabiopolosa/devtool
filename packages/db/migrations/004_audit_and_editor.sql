CREATE TABLE IF NOT EXISTS audit_events (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  action TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id TEXT,
  status TEXT NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL,
  metadata JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  created_by TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  updated_by TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_audit_events_user ON audit_events (user_id);
CREATE INDEX IF NOT EXISTS idx_audit_events_action ON audit_events (action);
CREATE INDEX IF NOT EXISTS idx_audit_events_resource ON audit_events (resource_type, resource_id);
CREATE INDEX IF NOT EXISTS idx_audit_events_occurred ON audit_events (occurred_at);

DO $$
BEGIN
  IF to_regclass('public.roles') IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO roles (
    id,
    name,
    description,
    permissions,
    is_system,
    created_at,
    created_by,
    updated_at,
    updated_by
  )
  VALUES (
    'role_editor',
    'editor',
    'Can edit projects, roadmap, tasks, and chat but cannot manage identities or providers.',
    '[
      "project.read",
      "project.write",
      "repository.read",
      "roadmap.read",
      "roadmap.write",
      "task.read",
      "task.write",
      "approval.read",
      "memory.read",
      "memory.write",
      "experiment.read",
      "chat.read",
      "chat.write"
    ]'::jsonb,
    true,
    NOW(),
    'migration',
    NOW(),
    'migration'
  )
  ON CONFLICT (name) DO NOTHING;
END $$;
