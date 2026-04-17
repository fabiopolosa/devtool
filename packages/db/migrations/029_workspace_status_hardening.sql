UPDATE workspaces
SET runtime_status = 'unknown'
WHERE runtime_status IN ('stopping', 'restarting');

ALTER TABLE workspaces
  DROP CONSTRAINT IF EXISTS workspaces_runtime_status_check;

ALTER TABLE workspaces
  ADD CONSTRAINT workspaces_runtime_status_check
  CHECK (runtime_status IN ('stopped', 'starting', 'running', 'deploying', 'unknown', 'error'));
