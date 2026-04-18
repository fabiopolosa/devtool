ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS runtime_profile JSONB NOT NULL DEFAULT jsonb_build_object(
    'defaultHost',
    'local_worker',
    'defaultExecutionMode',
    'queued',
    'heartbeatPolicy',
    jsonb_build_object(
      'interval',
      'manual',
      'triggers',
      jsonb_build_array('manual'),
      'enabled',
      true,
      'metadata',
      '{}'::jsonb
    ),
    'agentSelectionPolicy',
    '{}'::jsonb,
    'metadata',
    '{}'::jsonb
  );

ALTER TABLE agents
  ADD COLUMN IF NOT EXISTS runtime_profile JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS heartbeat_policy JSONB NOT NULL DEFAULT jsonb_build_object(
    'interval',
    'manual',
    'triggers',
    jsonb_build_array('manual'),
    'enabled',
    true,
    'metadata',
    '{}'::jsonb
  );
