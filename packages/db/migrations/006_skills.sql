CREATE TABLE IF NOT EXISTS skills (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  repository_url TEXT NOT NULL,
  version TEXT NOT NULL,
  installed BOOLEAN NOT NULL DEFAULT FALSE,
  categories JSONB NOT NULL DEFAULT '[]'::jsonb,
  instructions TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  created_by TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  updated_by TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_skills_name ON skills (name);
CREATE INDEX IF NOT EXISTS idx_skills_installed ON skills (installed);
CREATE UNIQUE INDEX IF NOT EXISTS ux_skills_repository_name ON skills (repository_url, name);
