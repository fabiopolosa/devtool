ALTER TABLE brainstorm_sessions
ADD COLUMN IF NOT EXISTS applied_at timestamptz NULL;
