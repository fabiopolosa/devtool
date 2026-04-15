CREATE TABLE IF NOT EXISTS coding_workflows (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  title TEXT NOT NULL,
  request TEXT NOT NULL,
  state TEXT NOT NULL,
  plan_decision TEXT NOT NULL,
  patch_decision TEXT NOT NULL,
  plan JSONB NOT NULL DEFAULT '{}'::jsonb,
  generated_task_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  action_required BOOLEAN NOT NULL DEFAULT FALSE,
  review_summary TEXT,
  timeline JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL,
  created_by TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  updated_by TEXT NOT NULL,
  CONSTRAINT ck_coding_workflows_state CHECK (
    state IN (
      'request',
      'planning',
      'awaiting_plan_approval',
      'plan_rejected',
      'plan_approved',
      'task_generation',
      'awaiting_patch_approval',
      'executing',
      'review',
      'completed',
      'rejected'
    )
  ),
  CONSTRAINT ck_coding_workflows_plan_decision CHECK (
    plan_decision IN ('pending', 'approved', 'rejected', 'revision_requested')
  ),
  CONSTRAINT ck_coding_workflows_patch_decision CHECK (
    patch_decision IN ('pending', 'approved', 'rejected', 'revision_requested')
  )
);

CREATE INDEX IF NOT EXISTS idx_coding_workflows_tenant
  ON coding_workflows (tenant_id);

CREATE INDEX IF NOT EXISTS idx_coding_workflows_project
  ON coding_workflows (project_id);

CREATE INDEX IF NOT EXISTS idx_coding_workflows_state
  ON coding_workflows (state);

CREATE INDEX IF NOT EXISTS idx_coding_workflows_plan_decision
  ON coding_workflows (plan_decision);

CREATE INDEX IF NOT EXISTS idx_coding_workflows_patch_decision
  ON coding_workflows (patch_decision);

CREATE INDEX IF NOT EXISTS idx_coding_workflows_action_required
  ON coding_workflows (action_required);

