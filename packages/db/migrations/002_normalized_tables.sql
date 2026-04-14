CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  key TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL,
  policy_set_id TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  created_by TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  updated_by TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_projects_status ON projects (status);

CREATE TABLE IF NOT EXISTS repositories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  vcs_provider TEXT NOT NULL,
  default_branch TEXT NOT NULL,
  local_path TEXT,
  status TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  created_by TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  updated_by TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_repositories_status ON repositories (status);

CREATE TABLE IF NOT EXISTS project_repository_links (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  repository_id TEXT NOT NULL,
  role TEXT NOT NULL,
  rules_ref TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  created_by TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  updated_by TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_project_repo_links_project ON project_repository_links (project_id);
CREATE INDEX IF NOT EXISTS idx_project_repo_links_repo ON project_repository_links (repository_id);

CREATE TABLE IF NOT EXISTS roadmap_items (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  state TEXT NOT NULL,
  priority INTEGER NOT NULL,
  order_index INTEGER NOT NULL,
  parent_id TEXT,
  converted_task_id TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  created_by TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  updated_by TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_roadmap_project ON roadmap_items (project_id);
CREATE INDEX IF NOT EXISTS idx_roadmap_state ON roadmap_items (state);
CREATE INDEX IF NOT EXISTS idx_roadmap_order ON roadmap_items (project_id, order_index);

CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  roadmap_item_id TEXT,
  title TEXT NOT NULL,
  type TEXT NOT NULL,
  state TEXT NOT NULL,
  goal TEXT NOT NULL,
  scope_include JSONB NOT NULL,
  scope_exclude JSONB NOT NULL,
  constraints JSONB NOT NULL,
  target_repository_ids JSONB NOT NULL,
  success_criteria JSONB NOT NULL,
  verification_plan JSONB NOT NULL,
  dependency_task_ids JSONB NOT NULL,
  risk_notes JSONB NOT NULL,
  budget JSONB NOT NULL,
  approvals_required BOOLEAN NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  created_by TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  updated_by TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks (project_id);
CREATE INDEX IF NOT EXISTS idx_tasks_state ON tasks (state);
CREATE INDEX IF NOT EXISTS idx_tasks_roadmap ON tasks (roadmap_item_id);

CREATE TABLE IF NOT EXISTS task_runs (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  workflow_id TEXT NOT NULL,
  status TEXT NOT NULL,
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  retry_count INTEGER NOT NULL,
  cost_proxy_input_tokens INTEGER NOT NULL,
  cost_proxy_output_tokens INTEGER NOT NULL,
  repos_touched JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  created_by TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  updated_by TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_task_runs_task ON task_runs (task_id);
CREATE INDEX IF NOT EXISTS idx_task_runs_status ON task_runs (status);

CREATE TABLE IF NOT EXISTS artifacts (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  task_id TEXT NOT NULL,
  type TEXT NOT NULL,
  schema_version TEXT NOT NULL,
  uri TEXT NOT NULL,
  summary TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  created_by TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  updated_by TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_artifacts_run ON artifacts (run_id);
CREATE INDEX IF NOT EXISTS idx_artifacts_task ON artifacts (task_id);

CREATE TABLE IF NOT EXISTS verification_results (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  task_id TEXT NOT NULL,
  overall_status TEXT NOT NULL,
  score DOUBLE PRECISION,
  summary TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  created_by TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  updated_by TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_verification_results_run ON verification_results (run_id);
CREATE INDEX IF NOT EXISTS idx_verification_results_task ON verification_results (task_id);

CREATE TABLE IF NOT EXISTS verification_steps (
  id TEXT PRIMARY KEY,
  verification_result_id TEXT NOT NULL,
  run_id TEXT NOT NULL,
  step_type TEXT NOT NULL,
  command TEXT NOT NULL,
  status TEXT NOT NULL,
  exit_code INTEGER,
  duration_ms INTEGER,
  output_uri TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  created_by TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  updated_by TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_verification_steps_result ON verification_steps (verification_result_id);
CREATE INDEX IF NOT EXISTS idx_verification_steps_run ON verification_steps (run_id);

CREATE TABLE IF NOT EXISTS memory_entries (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  repository_id TEXT,
  task_id TEXT,
  category TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  priority INTEGER NOT NULL,
  pinned BOOLEAN NOT NULL,
  freshness_ttl_hours INTEGER,
  source_ref TEXT,
  source_hash TEXT,
  is_stale BOOLEAN NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  created_by TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  updated_by TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_memory_entries_project ON memory_entries (project_id);
CREATE INDEX IF NOT EXISTS idx_memory_entries_repo ON memory_entries (repository_id);
CREATE INDEX IF NOT EXISTS idx_memory_entries_task ON memory_entries (task_id);
CREATE INDEX IF NOT EXISTS idx_memory_entries_category ON memory_entries (category);

CREATE TABLE IF NOT EXISTS memory_chunks (
  id TEXT PRIMARY KEY,
  memory_entry_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  repository_id TEXT,
  category TEXT NOT NULL,
  chunk_index INTEGER NOT NULL,
  chunk_text TEXT NOT NULL,
  chunk_title TEXT NOT NULL,
  token_estimate INTEGER NOT NULL,
  metadata JSONB NOT NULL,
  embedding_ref TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  created_by TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  updated_by TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_memory_chunks_entry ON memory_chunks (memory_entry_id);
CREATE INDEX IF NOT EXISTS idx_memory_chunks_project ON memory_chunks (project_id);
CREATE INDEX IF NOT EXISTS idx_memory_chunks_repo ON memory_chunks (repository_id);
CREATE INDEX IF NOT EXISTS idx_memory_chunks_category ON memory_chunks (category);

CREATE TABLE IF NOT EXISTS embedding_jobs (
  id TEXT PRIMARY KEY,
  source_type TEXT NOT NULL,
  source_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  status TEXT NOT NULL,
  batch_size INTEGER NOT NULL,
  embedding_model TEXT NOT NULL,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  created_by TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  updated_by TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_embedding_jobs_project ON embedding_jobs (project_id);
CREATE INDEX IF NOT EXISTS idx_embedding_jobs_source ON embedding_jobs (source_type, source_id);

CREATE TABLE IF NOT EXISTS retrieval_query_logs (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  task_run_id TEXT,
  role TEXT NOT NULL,
  query_text TEXT NOT NULL,
  top_k INTEGER NOT NULL,
  filters JSONB NOT NULL,
  returned_chunk_ids JSONB NOT NULL,
  token_estimate INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  created_by TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  updated_by TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_retrieval_logs_project ON retrieval_query_logs (project_id);
CREATE INDEX IF NOT EXISTS idx_retrieval_logs_task_run ON retrieval_query_logs (task_run_id);
CREATE INDEX IF NOT EXISTS idx_retrieval_logs_role ON retrieval_query_logs (role);

CREATE TABLE IF NOT EXISTS research_notes (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  task_id TEXT,
  title TEXT NOT NULL,
  question TEXT NOT NULL,
  summary TEXT NOT NULL,
  source_list JSONB NOT NULL,
  breaking_change_risk TEXT NOT NULL,
  caveats JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  created_by TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  updated_by TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_research_notes_project ON research_notes (project_id);
CREATE INDEX IF NOT EXISTS idx_research_notes_task ON research_notes (task_id);

CREATE TABLE IF NOT EXISTS policies (
  id TEXT PRIMARY KEY,
  project_id TEXT,
  type TEXT NOT NULL,
  scope TEXT NOT NULL,
  active_version TEXT NOT NULL,
  json_rules JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  created_by TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  updated_by TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_policies_project ON policies (project_id);
CREATE INDEX IF NOT EXISTS idx_policies_type ON policies (type);

CREATE TABLE IF NOT EXISTS prompt_versions (
  id TEXT PRIMARY KEY,
  role TEXT NOT NULL,
  version TEXT NOT NULL,
  content_ref TEXT NOT NULL,
  changelog TEXT NOT NULL,
  promoted BOOLEAN NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  created_by TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  updated_by TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_prompt_versions_role ON prompt_versions (role);

CREATE TABLE IF NOT EXISTS routing_rules (
  id TEXT PRIMARY KEY,
  project_id TEXT,
  role TEXT NOT NULL,
  capability TEXT NOT NULL,
  precedence INTEGER NOT NULL,
  conditions JSONB NOT NULL,
  fallback_chain JSONB NOT NULL,
  enabled BOOLEAN NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  created_by TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  updated_by TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_routing_rules_project ON routing_rules (project_id);
CREATE INDEX IF NOT EXISTS idx_routing_rules_role ON routing_rules (role);
CREATE INDEX IF NOT EXISTS idx_routing_rules_capability ON routing_rules (capability);

CREATE TABLE IF NOT EXISTS autoresearch_experiments (
  id TEXT PRIMARY KEY,
  project_id TEXT,
  target_type TEXT NOT NULL,
  status TEXT NOT NULL,
  metric_set JSONB NOT NULL,
  baseline_version_ref TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  created_by TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  updated_by TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_autoresearch_experiments_project ON autoresearch_experiments (project_id);
CREATE INDEX IF NOT EXISTS idx_autoresearch_experiments_status ON autoresearch_experiments (status);

CREATE TABLE IF NOT EXISTS autoresearch_runs (
  id TEXT PRIMARY KEY,
  experiment_id TEXT NOT NULL,
  variant_id TEXT NOT NULL,
  status TEXT NOT NULL,
  metrics JSONB NOT NULL,
  winner_flag BOOLEAN NOT NULL,
  rollback_flag BOOLEAN NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  created_by TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  updated_by TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_autoresearch_runs_experiment ON autoresearch_runs (experiment_id);
CREATE INDEX IF NOT EXISTS idx_autoresearch_runs_variant ON autoresearch_runs (variant_id);

CREATE TABLE IF NOT EXISTS approvals (
  id TEXT PRIMARY KEY,
  subject_type TEXT NOT NULL,
  subject_id TEXT NOT NULL,
  status TEXT NOT NULL,
  requested_by TEXT NOT NULL,
  decided_by TEXT,
  reason TEXT,
  decided_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL,
  created_by TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  updated_by TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_approvals_subject ON approvals (subject_type, subject_id);
CREATE INDEX IF NOT EXISTS idx_approvals_status ON approvals (status);

CREATE TABLE IF NOT EXISTS chat_threads (
  id TEXT PRIMARY KEY,
  project_id TEXT,
  context_type TEXT NOT NULL,
  status TEXT NOT NULL,
  title TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  created_by TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  updated_by TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_chat_threads_project ON chat_threads (project_id);
CREATE INDEX IF NOT EXISTS idx_chat_threads_status ON chat_threads (status);

CREATE TABLE IF NOT EXISTS chat_messages (
  id TEXT PRIMARY KEY,
  thread_id TEXT NOT NULL,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  structured_intent JSONB,
  created_at TIMESTAMPTZ NOT NULL,
  created_by TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  updated_by TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_chat_messages_thread ON chat_messages (thread_id);

CREATE TABLE IF NOT EXISTS provider_configs (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  endpoint TEXT,
  auth_ref TEXT NOT NULL,
  enabled BOOLEAN NOT NULL,
  timeout_ms INTEGER NOT NULL,
  metadata JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  created_by TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  updated_by TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_provider_configs_provider ON provider_configs (provider);

CREATE TABLE IF NOT EXISTS provider_capabilities (
  id TEXT PRIMARY KEY,
  provider_config_id TEXT NOT NULL,
  capability_class TEXT NOT NULL,
  supported BOOLEAN NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  created_by TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  updated_by TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_provider_capabilities_provider ON provider_capabilities (provider_config_id);
CREATE INDEX IF NOT EXISTS idx_provider_capabilities_capability ON provider_capabilities (capability_class);

CREATE TABLE IF NOT EXISTS provider_models (
  id TEXT PRIMARY KEY,
  provider_config_id TEXT NOT NULL,
  model_id TEXT NOT NULL,
  capability_class TEXT NOT NULL,
  context_window INTEGER,
  max_output_tokens INTEGER,
  pricing_meta JSONB,
  enabled BOOLEAN NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  created_by TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  updated_by TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_provider_models_provider ON provider_models (provider_config_id);
CREATE INDEX IF NOT EXISTS idx_provider_models_model ON provider_models (model_id);
CREATE INDEX IF NOT EXISTS idx_provider_models_capability ON provider_models (capability_class);

CREATE TABLE IF NOT EXISTS project_provider_bindings (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  role TEXT,
  capability_class TEXT NOT NULL,
  primary_model_id TEXT NOT NULL,
  fallback_model_ids JSONB NOT NULL,
  enabled BOOLEAN NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  created_by TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  updated_by TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_project_provider_bindings_project ON project_provider_bindings (project_id);
CREATE INDEX IF NOT EXISTS idx_project_provider_bindings_capability ON project_provider_bindings (capability_class);

CREATE TABLE IF NOT EXISTS provider_healthchecks (
  id TEXT PRIMARY KEY,
  provider_config_id TEXT NOT NULL,
  model_id TEXT,
  status TEXT NOT NULL,
  latency_ms INTEGER,
  error_rate DOUBLE PRECISION,
  details TEXT,
  checked_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  created_by TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  updated_by TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_provider_healthchecks_provider ON provider_healthchecks (provider_config_id);
CREATE INDEX IF NOT EXISTS idx_provider_healthchecks_model ON provider_healthchecks (model_id);
CREATE INDEX IF NOT EXISTS idx_provider_healthchecks_status ON provider_healthchecks (status);

CREATE TABLE IF NOT EXISTS model_routing_preferences (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  capability_class TEXT NOT NULL,
  cost_weight DOUBLE PRECISION NOT NULL,
  latency_weight DOUBLE PRECISION NOT NULL,
  quality_weight DOUBLE PRECISION NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  created_by TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  updated_by TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_model_routing_preferences_project ON model_routing_preferences (project_id);
CREATE INDEX IF NOT EXISTS idx_model_routing_preferences_capability ON model_routing_preferences (capability_class);

DO $$
BEGIN
  IF to_regclass('public.entity_records') IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO projects (id, key, name, description, status, policy_set_id, created_at, created_by, updated_at, updated_by)
  SELECT
    data->>'id',
    COALESCE(data->>'key', data->>'id', ''),
    COALESCE(data->>'name', data->>'id', ''),
    data->>'description',
    COALESCE(data->>'status', 'active'),
    data->>'policySetId',
    COALESCE((data->>'createdAt')::timestamptz, NOW()),
    COALESCE(data->>'createdBy', 'migration'),
    COALESCE((data->>'updatedAt')::timestamptz, NOW()),
    COALESCE(data->>'updatedBy', 'migration')
  FROM entity_records
  WHERE table_name = 'projects'
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO repositories (id, name, url, vcs_provider, default_branch, local_path, status, created_at, created_by, updated_at, updated_by)
  SELECT
    data->>'id',
    COALESCE(data->>'name', data->>'id', ''),
    COALESCE(data->>'url', ''),
    COALESCE(data->>'vcsProvider', 'other'),
    COALESCE(data->>'defaultBranch', 'main'),
    data->>'localPath',
    COALESCE(data->>'status', 'active'),
    COALESCE((data->>'createdAt')::timestamptz, NOW()),
    COALESCE(data->>'createdBy', 'migration'),
    COALESCE((data->>'updatedAt')::timestamptz, NOW()),
    COALESCE(data->>'updatedBy', 'migration')
  FROM entity_records
  WHERE table_name = 'repositories'
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO project_repository_links (id, project_id, repository_id, role, rules_ref, created_at, created_by, updated_at, updated_by)
  SELECT
    data->>'id',
    data->>'projectId',
    data->>'repositoryId',
    COALESCE(data->>'role', 'secondary'),
    data->>'rulesRef',
    COALESCE((data->>'createdAt')::timestamptz, NOW()),
    COALESCE(data->>'createdBy', 'migration'),
    COALESCE((data->>'updatedAt')::timestamptz, NOW()),
    COALESCE(data->>'updatedBy', 'migration')
  FROM entity_records
  WHERE table_name = 'project_repository_links'
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO roadmap_items (id, project_id, title, description, state, priority, order_index, parent_id, converted_task_id, created_at, created_by, updated_at, updated_by)
  SELECT
    data->>'id',
    data->>'projectId',
    COALESCE(data->>'title', ''),
    COALESCE(data->>'description', ''),
    COALESCE(data->>'state', 'draft'),
    COALESCE((data->>'priority')::integer, 0),
    COALESCE((data->>'orderIndex')::integer, 0),
    data->>'parentId',
    data->>'convertedTaskId',
    COALESCE((data->>'createdAt')::timestamptz, NOW()),
    COALESCE(data->>'createdBy', 'migration'),
    COALESCE((data->>'updatedAt')::timestamptz, NOW()),
    COALESCE(data->>'updatedBy', 'migration')
  FROM entity_records
  WHERE table_name = 'roadmap_items'
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO tasks (
    id, project_id, roadmap_item_id, title, type, state, goal,
    scope_include, scope_exclude, constraints, target_repository_ids, success_criteria,
    verification_plan, dependency_task_ids, risk_notes, budget, approvals_required,
    created_at, created_by, updated_at, updated_by
  )
  SELECT
    data->>'id',
    data->>'projectId',
    data->>'roadmapItemId',
    COALESCE(data->>'title', ''),
    COALESCE(data->>'type', 'feature'),
    COALESCE(data->>'state', 'draft'),
    COALESCE(data->>'goal', ''),
    COALESCE(data->'scopeInclude', '[]'::jsonb),
    COALESCE(data->'scopeExclude', '[]'::jsonb),
    COALESCE(data->'constraints', '[]'::jsonb),
    COALESCE(data->'targetRepositoryIds', '[]'::jsonb),
    COALESCE(data->'successCriteria', '[]'::jsonb),
    COALESCE(data->'verificationPlan', '[]'::jsonb),
    COALESCE(data->'dependencyTaskIds', '[]'::jsonb),
    COALESCE(data->'riskNotes', '[]'::jsonb),
    COALESCE(data->'budget', '{"maxRetries":0}'::jsonb),
    CASE
      WHEN jsonb_typeof(data->'approvalsRequired') = 'boolean' THEN (data->>'approvalsRequired')::boolean
      WHEN jsonb_typeof(data->'approvalsRequired') = 'array' THEN jsonb_array_length(data->'approvalsRequired') > 0
      WHEN jsonb_typeof(data->'approvalsRequired') = 'string' THEN LOWER(data->>'approvalsRequired') IN ('true', '1', 'yes')
      ELSE false
    END,
    COALESCE((data->>'createdAt')::timestamptz, NOW()),
    COALESCE(data->>'createdBy', 'migration'),
    COALESCE((data->>'updatedAt')::timestamptz, NOW()),
    COALESCE(data->>'updatedBy', 'migration')
  FROM entity_records
  WHERE table_name = 'tasks'
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO task_runs (
    id, task_id, workflow_id, status, started_at, ended_at, retry_count,
    cost_proxy_input_tokens, cost_proxy_output_tokens, repos_touched,
    created_at, created_by, updated_at, updated_by
  )
  SELECT
    data->>'id',
    data->>'taskId',
    COALESCE(data->>'workflowId', ''),
    COALESCE(data->>'status', 'queued'),
    (data->>'startedAt')::timestamptz,
    (data->>'endedAt')::timestamptz,
    COALESCE((data->>'retryCount')::integer, 0),
    COALESCE((data->>'costProxyInputTokens')::integer, 0),
    COALESCE((data->>'costProxyOutputTokens')::integer, 0),
    COALESCE(data->'reposTouched', '[]'::jsonb),
    COALESCE((data->>'createdAt')::timestamptz, NOW()),
    COALESCE(data->>'createdBy', 'migration'),
    COALESCE((data->>'updatedAt')::timestamptz, NOW()),
    COALESCE(data->>'updatedBy', 'migration')
  FROM entity_records
  WHERE table_name = 'task_runs'
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO artifacts (id, run_id, task_id, type, schema_version, uri, summary, created_at, created_by, updated_at, updated_by)
  SELECT
    data->>'id', data->>'runId', data->>'taskId', COALESCE(data->>'type', 'handoff'),
    COALESCE(data->>'schemaVersion', '1.0.0'), COALESCE(data->>'uri', ''), COALESCE(data->>'summary', ''),
    COALESCE((data->>'createdAt')::timestamptz, NOW()), COALESCE(data->>'createdBy', 'migration'),
    COALESCE((data->>'updatedAt')::timestamptz, NOW()), COALESCE(data->>'updatedBy', 'migration')
  FROM entity_records
  WHERE table_name = 'artifacts'
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO verification_results (id, run_id, task_id, overall_status, score, summary, created_at, created_by, updated_at, updated_by)
  SELECT
    data->>'id', data->>'runId', data->>'taskId', COALESCE(data->>'overallStatus', 'partial'),
    (data->>'score')::double precision, COALESCE(data->>'summary', ''),
    COALESCE((data->>'createdAt')::timestamptz, NOW()), COALESCE(data->>'createdBy', 'migration'),
    COALESCE((data->>'updatedAt')::timestamptz, NOW()), COALESCE(data->>'updatedBy', 'migration')
  FROM entity_records
  WHERE table_name = 'verification_results'
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO verification_steps (
    id, verification_result_id, run_id, step_type, command, status, exit_code, duration_ms, output_uri,
    created_at, created_by, updated_at, updated_by
  )
  SELECT
    data->>'id', data->>'verificationResultId', data->>'runId', COALESCE(data->>'stepType', 'lint'),
    COALESCE(data->>'command', ''), COALESCE(data->>'status', 'skipped'),
    (data->>'exitCode')::integer, (data->>'durationMs')::integer, data->>'outputUri',
    COALESCE((data->>'createdAt')::timestamptz, NOW()), COALESCE(data->>'createdBy', 'migration'),
    COALESCE((data->>'updatedAt')::timestamptz, NOW()), COALESCE(data->>'updatedBy', 'migration')
  FROM entity_records
  WHERE table_name = 'verification_steps'
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO memory_entries (
    id, project_id, repository_id, task_id, category, title, body, priority, pinned,
    freshness_ttl_hours, source_ref, source_hash, is_stale, created_at, created_by, updated_at, updated_by
  )
  SELECT
    data->>'id', data->>'projectId', data->>'repositoryId', data->>'taskId', COALESCE(data->>'category', 'project_overview'),
    COALESCE(data->>'title', ''), COALESCE(data->>'body', ''), COALESCE((data->>'priority')::integer, 0),
    COALESCE((data->>'pinned')::boolean, false), (data->>'freshnessTtlHours')::integer,
    data->>'sourceRef', data->>'sourceHash', COALESCE((data->>'isStale')::boolean, false),
    COALESCE((data->>'createdAt')::timestamptz, NOW()), COALESCE(data->>'createdBy', 'migration'),
    COALESCE((data->>'updatedAt')::timestamptz, NOW()), COALESCE(data->>'updatedBy', 'migration')
  FROM entity_records
  WHERE table_name = 'memory_entries'
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO memory_chunks (
    id, memory_entry_id, project_id, repository_id, category, chunk_index, chunk_text, chunk_title,
    token_estimate, metadata, embedding_ref, created_at, created_by, updated_at, updated_by
  )
  SELECT
    data->>'id', data->>'memoryEntryId', data->>'projectId', data->>'repositoryId', COALESCE(data->>'category', 'project_overview'),
    COALESCE((data->>'chunkIndex')::integer, 0), COALESCE(data->>'chunkText', ''), COALESCE(data->>'chunkTitle', ''),
    COALESCE((data->>'tokenEstimate')::integer, 0), COALESCE(data->'metadata', '{}'::jsonb), data->>'embeddingRef',
    COALESCE((data->>'createdAt')::timestamptz, NOW()), COALESCE(data->>'createdBy', 'migration'),
    COALESCE((data->>'updatedAt')::timestamptz, NOW()), COALESCE(data->>'updatedBy', 'migration')
  FROM entity_records
  WHERE table_name = 'memory_chunks'
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO embedding_jobs (
    id, source_type, source_id, project_id, status, batch_size, embedding_model, error_message,
    created_at, created_by, updated_at, updated_by
  )
  SELECT
    data->>'id', COALESCE(data->>'sourceType', 'memory_entry'), COALESCE(data->>'sourceId', ''),
    COALESCE(data->>'projectId', ''), COALESCE(data->>'status', 'queued'), COALESCE((data->>'batchSize')::integer, 0),
    COALESCE(data->>'embeddingModel', ''), data->>'errorMessage',
    COALESCE((data->>'createdAt')::timestamptz, NOW()), COALESCE(data->>'createdBy', 'migration'),
    COALESCE((data->>'updatedAt')::timestamptz, NOW()), COALESCE(data->>'updatedBy', 'migration')
  FROM entity_records
  WHERE table_name = 'embedding_jobs'
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO retrieval_query_logs (
    id, project_id, task_run_id, role, query_text, top_k, filters, returned_chunk_ids, token_estimate,
    created_at, created_by, updated_at, updated_by
  )
  SELECT
    data->>'id', data->>'projectId', data->>'taskRunId', COALESCE(data->>'role', 'planner'),
    COALESCE(data->>'queryText', ''), COALESCE((data->>'topK')::integer, 0), COALESCE(data->'filters', '{}'::jsonb),
    COALESCE(data->'returnedChunkIds', '[]'::jsonb), COALESCE((data->>'tokenEstimate')::integer, 0),
    COALESCE((data->>'createdAt')::timestamptz, NOW()), COALESCE(data->>'createdBy', 'migration'),
    COALESCE((data->>'updatedAt')::timestamptz, NOW()), COALESCE(data->>'updatedBy', 'migration')
  FROM entity_records
  WHERE table_name = 'retrieval_query_logs'
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO research_notes (
    id, project_id, task_id, title, question, summary, source_list, breaking_change_risk, caveats,
    created_at, created_by, updated_at, updated_by
  )
  SELECT
    data->>'id', data->>'projectId', data->>'taskId', COALESCE(data->>'title', ''), COALESCE(data->>'question', ''),
    COALESCE(data->>'summary', ''), COALESCE(data->'sourceList', '[]'::jsonb),
    COALESCE(data->>'breakingChangeRisk', 'low'), COALESCE(data->'caveats', '[]'::jsonb),
    COALESCE((data->>'createdAt')::timestamptz, NOW()), COALESCE(data->>'createdBy', 'migration'),
    COALESCE((data->>'updatedAt')::timestamptz, NOW()), COALESCE(data->>'updatedBy', 'migration')
  FROM entity_records
  WHERE table_name = 'research_notes'
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO policies (id, project_id, type, scope, active_version, json_rules, created_at, created_by, updated_at, updated_by)
  SELECT
    data->>'id', data->>'projectId', COALESCE(data->>'type', 'routing'), COALESCE(data->>'scope', 'global'),
    COALESCE(data->>'activeVersion', 'v1'), COALESCE(data->'jsonRules', '{}'::jsonb),
    COALESCE((data->>'createdAt')::timestamptz, NOW()), COALESCE(data->>'createdBy', 'migration'),
    COALESCE((data->>'updatedAt')::timestamptz, NOW()), COALESCE(data->>'updatedBy', 'migration')
  FROM entity_records
  WHERE table_name = 'policies'
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO prompt_versions (id, role, version, content_ref, changelog, promoted, created_at, created_by, updated_at, updated_by)
  SELECT
    data->>'id', COALESCE(data->>'role', 'planner'), COALESCE(data->>'version', 'v1'), COALESCE(data->>'contentRef', ''),
    COALESCE(data->>'changelog', ''), COALESCE((data->>'promoted')::boolean, false),
    COALESCE((data->>'createdAt')::timestamptz, NOW()), COALESCE(data->>'createdBy', 'migration'),
    COALESCE((data->>'updatedAt')::timestamptz, NOW()), COALESCE(data->>'updatedBy', 'migration')
  FROM entity_records
  WHERE table_name = 'prompt_versions'
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO routing_rules (
    id, project_id, role, capability, precedence, conditions, fallback_chain, enabled,
    created_at, created_by, updated_at, updated_by
  )
  SELECT
    data->>'id', data->>'projectId', COALESCE(data->>'role', 'planner'), COALESCE(data->>'capability', 'chat_reasoning'),
    COALESCE((data->>'precedence')::integer, 0), COALESCE(data->'conditions', '{}'::jsonb), COALESCE(data->'fallbackChain', '[]'::jsonb),
    COALESCE((data->>'enabled')::boolean, true),
    COALESCE((data->>'createdAt')::timestamptz, NOW()), COALESCE(data->>'createdBy', 'migration'),
    COALESCE((data->>'updatedAt')::timestamptz, NOW()), COALESCE(data->>'updatedBy', 'migration')
  FROM entity_records
  WHERE table_name = 'routing_rules'
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO autoresearch_experiments (
    id, project_id, target_type, status, metric_set, baseline_version_ref,
    created_at, created_by, updated_at, updated_by
  )
  SELECT
    data->>'id', data->>'projectId', COALESCE(data->>'targetType', 'planner_prompt'), COALESCE(data->>'status', 'draft'),
    COALESCE(data->'metricSet', '[]'::jsonb), COALESCE(data->>'baselineVersionRef', ''),
    COALESCE((data->>'createdAt')::timestamptz, NOW()), COALESCE(data->>'createdBy', 'migration'),
    COALESCE((data->>'updatedAt')::timestamptz, NOW()), COALESCE(data->>'updatedBy', 'migration')
  FROM entity_records
  WHERE table_name = 'autoresearch_experiments'
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO autoresearch_runs (
    id, experiment_id, variant_id, status, metrics, winner_flag, rollback_flag,
    created_at, created_by, updated_at, updated_by
  )
  SELECT
    data->>'id', data->>'experimentId', COALESCE(data->>'variantId', ''), COALESCE(data->>'status', 'running'),
    COALESCE(data->'metrics', '{}'::jsonb), COALESCE((data->>'winnerFlag')::boolean, false), COALESCE((data->>'rollbackFlag')::boolean, false),
    COALESCE((data->>'createdAt')::timestamptz, NOW()), COALESCE(data->>'createdBy', 'migration'),
    COALESCE((data->>'updatedAt')::timestamptz, NOW()), COALESCE(data->>'updatedBy', 'migration')
  FROM entity_records
  WHERE table_name = 'autoresearch_runs'
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO approvals (
    id, subject_type, subject_id, status, requested_by, decided_by, reason, decided_at,
    created_at, created_by, updated_at, updated_by
  )
  SELECT
    data->>'id', COALESCE(data->>'subjectType', 'task'), COALESCE(data->>'subjectId', ''), COALESCE(data->>'status', 'pending'),
    COALESCE(data->>'requestedBy', 'migration'), data->>'decidedBy', data->>'reason', (data->>'decidedAt')::timestamptz,
    COALESCE((data->>'createdAt')::timestamptz, NOW()), COALESCE(data->>'createdBy', 'migration'),
    COALESCE((data->>'updatedAt')::timestamptz, NOW()), COALESCE(data->>'updatedBy', 'migration')
  FROM entity_records
  WHERE table_name = 'approvals'
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO chat_threads (id, project_id, context_type, status, title, created_at, created_by, updated_at, updated_by)
  SELECT
    data->>'id', data->>'projectId', COALESCE(data->>'contextType', 'global'), COALESCE(data->>'status', 'open'), data->>'title',
    COALESCE((data->>'createdAt')::timestamptz, NOW()), COALESCE(data->>'createdBy', 'migration'),
    COALESCE((data->>'updatedAt')::timestamptz, NOW()), COALESCE(data->>'updatedBy', 'migration')
  FROM entity_records
  WHERE table_name = 'chat_threads'
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO chat_messages (id, thread_id, role, content, structured_intent, created_at, created_by, updated_at, updated_by)
  SELECT
    data->>'id', data->>'threadId', COALESCE(data->>'role', 'user'), COALESCE(data->>'content', ''), data->'structuredIntent',
    COALESCE((data->>'createdAt')::timestamptz, NOW()), COALESCE(data->>'createdBy', 'migration'),
    COALESCE((data->>'updatedAt')::timestamptz, NOW()), COALESCE(data->>'updatedBy', 'migration')
  FROM entity_records
  WHERE table_name = 'chat_messages'
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO provider_configs (
    id, provider, endpoint, auth_ref, enabled, timeout_ms, metadata,
    created_at, created_by, updated_at, updated_by
  )
  SELECT
    data->>'id', COALESCE(data->>'provider', 'openai'), data->>'endpoint', COALESCE(data->>'authRef', ''),
    COALESCE((data->>'enabled')::boolean, true), COALESCE((data->>'timeoutMs')::integer, 30000), COALESCE(data->'metadata', '{}'::jsonb),
    COALESCE((data->>'createdAt')::timestamptz, NOW()), COALESCE(data->>'createdBy', 'migration'),
    COALESCE((data->>'updatedAt')::timestamptz, NOW()), COALESCE(data->>'updatedBy', 'migration')
  FROM entity_records
  WHERE table_name = 'provider_configs'
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO provider_capabilities (
    id, provider_config_id, capability_class, supported, notes,
    created_at, created_by, updated_at, updated_by
  )
  SELECT
    data->>'id', data->>'providerConfigId', COALESCE(data->>'capabilityClass', 'chat_reasoning'),
    COALESCE((data->>'supported')::boolean, true), data->>'notes',
    COALESCE((data->>'createdAt')::timestamptz, NOW()), COALESCE(data->>'createdBy', 'migration'),
    COALESCE((data->>'updatedAt')::timestamptz, NOW()), COALESCE(data->>'updatedBy', 'migration')
  FROM entity_records
  WHERE table_name = 'provider_capabilities'
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO provider_models (
    id, provider_config_id, model_id, capability_class, context_window, max_output_tokens,
    pricing_meta, enabled, created_at, created_by, updated_at, updated_by
  )
  SELECT
    data->>'id', data->>'providerConfigId', COALESCE(data->>'modelId', ''), COALESCE(data->>'capabilityClass', 'chat_reasoning'),
    (data->>'contextWindow')::integer, (data->>'maxOutputTokens')::integer, data->'pricingMeta',
    COALESCE((data->>'enabled')::boolean, true),
    COALESCE((data->>'createdAt')::timestamptz, NOW()), COALESCE(data->>'createdBy', 'migration'),
    COALESCE((data->>'updatedAt')::timestamptz, NOW()), COALESCE(data->>'updatedBy', 'migration')
  FROM entity_records
  WHERE table_name = 'provider_models'
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO project_provider_bindings (
    id, project_id, role, capability_class, primary_model_id, fallback_model_ids, enabled,
    created_at, created_by, updated_at, updated_by
  )
  SELECT
    data->>'id', data->>'projectId', data->>'role', COALESCE(data->>'capabilityClass', 'chat_reasoning'),
    COALESCE(data->>'primaryModelId', ''), COALESCE(data->'fallbackModelIds', '[]'::jsonb), COALESCE((data->>'enabled')::boolean, true),
    COALESCE((data->>'createdAt')::timestamptz, NOW()), COALESCE(data->>'createdBy', 'migration'),
    COALESCE((data->>'updatedAt')::timestamptz, NOW()), COALESCE(data->>'updatedBy', 'migration')
  FROM entity_records
  WHERE table_name = 'project_provider_bindings'
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO provider_healthchecks (
    id, provider_config_id, model_id, status, latency_ms, error_rate, details, checked_at,
    created_at, created_by, updated_at, updated_by
  )
  SELECT
    data->>'id', data->>'providerConfigId', data->>'modelId', COALESCE(data->>'status', 'unknown'),
    (data->>'latencyMs')::integer, (data->>'errorRate')::double precision, data->>'details',
    COALESCE((data->>'checkedAt')::timestamptz, NOW()),
    COALESCE((data->>'createdAt')::timestamptz, NOW()), COALESCE(data->>'createdBy', 'migration'),
    COALESCE((data->>'updatedAt')::timestamptz, NOW()), COALESCE(data->>'updatedBy', 'migration')
  FROM entity_records
  WHERE table_name = 'provider_healthchecks'
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO model_routing_preferences (
    id, project_id, capability_class, cost_weight, latency_weight, quality_weight,
    created_at, created_by, updated_at, updated_by
  )
  SELECT
    data->>'id', data->>'projectId', COALESCE(data->>'capabilityClass', 'chat_reasoning'),
    COALESCE((data->>'costWeight')::double precision, 0),
    COALESCE((data->>'latencyWeight')::double precision, 0),
    COALESCE((data->>'qualityWeight')::double precision, 0),
    COALESCE((data->>'createdAt')::timestamptz, NOW()), COALESCE(data->>'createdBy', 'migration'),
    COALESCE((data->>'updatedAt')::timestamptz, NOW()), COALESCE(data->>'updatedBy', 'migration')
  FROM entity_records
  WHERE table_name = 'model_routing_preferences'
  ON CONFLICT (id) DO NOTHING;
END $$;
