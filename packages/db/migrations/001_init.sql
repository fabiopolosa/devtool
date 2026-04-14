CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS entity_records (
  table_name TEXT NOT NULL,
  id TEXT NOT NULL,
  data JSONB NOT NULL,
  project_id TEXT,
  repository_id TEXT,
  task_id TEXT,
  run_id TEXT,
  thread_id TEXT,
  experiment_id TEXT,
  subject_id TEXT,
  provider_config_id TEXT,
  capability_class TEXT,
  role TEXT,
  model_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT entity_records_pk PRIMARY KEY (table_name, id)
);

CREATE INDEX IF NOT EXISTS idx_entity_records_table_name ON entity_records (table_name);
CREATE INDEX IF NOT EXISTS idx_entity_records_project ON entity_records (table_name, project_id);
CREATE INDEX IF NOT EXISTS idx_entity_records_repository ON entity_records (table_name, repository_id);
CREATE INDEX IF NOT EXISTS idx_entity_records_task ON entity_records (table_name, task_id);
CREATE INDEX IF NOT EXISTS idx_entity_records_run ON entity_records (table_name, run_id);
CREATE INDEX IF NOT EXISTS idx_entity_records_thread ON entity_records (table_name, thread_id);
CREATE INDEX IF NOT EXISTS idx_entity_records_experiment ON entity_records (table_name, experiment_id);
CREATE INDEX IF NOT EXISTS idx_entity_records_provider ON entity_records (table_name, provider_config_id);
CREATE INDEX IF NOT EXISTS idx_entity_records_capability ON entity_records (table_name, capability_class);
CREATE INDEX IF NOT EXISTS idx_entity_records_role ON entity_records (table_name, role);
CREATE INDEX IF NOT EXISTS idx_entity_records_model ON entity_records (table_name, model_id);
