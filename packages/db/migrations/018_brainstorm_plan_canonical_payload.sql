-- Canonicalize brainstorm plan payloads so the `plan` column always stores
-- BrainstormPlan.plan.* and never nested/legacy wrappers.

-- Case 1: unwrap nested payloads where plan = { plan: { ...canonical... }, ...metadata }
UPDATE brainstorm_plans
SET
  plan = plan -> 'plan',
  updated_at = NOW(),
  updated_by = 'migration_018_brainstorm_plan_canonical_payload'
WHERE jsonb_typeof(plan) = 'object'
  AND plan ? 'plan'
  AND jsonb_typeof(plan -> 'plan') = 'object'
  AND (plan -> 'plan') ? 'recommendedStack'
  AND NOT (plan ? 'recommendedStack');

-- Case 2: trim metadata if a full BrainstormPlan object was persisted in `plan`.
UPDATE brainstorm_plans
SET
  plan = jsonb_build_object(
    'recommendedStack', plan -> 'recommendedStack',
    'architecture', plan -> 'architecture',
    'suggestedAgents', plan -> 'suggestedAgents',
    'suggestedSkills', plan -> 'suggestedSkills',
    'providerBindings', plan -> 'providerBindings',
    'roadmap', plan -> 'roadmap',
    'assumptions', plan -> 'assumptions',
    'risks', plan -> 'risks',
    'composedPrompt', plan -> 'composedPrompt',
    'selectedSubprompts', plan -> 'selectedSubprompts'
  ),
  updated_at = NOW(),
  updated_by = 'migration_018_brainstorm_plan_canonical_payload'
WHERE jsonb_typeof(plan) = 'object'
  AND plan ? 'recommendedStack'
  AND (
    plan ? 'id'
    OR plan ? 'sessionId'
    OR plan ? 'title'
    OR plan ? 'executiveSummary'
    OR plan ? 'createdAt'
    OR plan ? 'createdBy'
    OR plan ? 'updatedAt'
    OR plan ? 'updatedBy'
  );

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'brainstorm_plans_plan_canonical_shape'
  ) THEN
    ALTER TABLE brainstorm_plans
      ADD CONSTRAINT brainstorm_plans_plan_canonical_shape
      CHECK (
        jsonb_typeof(plan) = 'object'
        AND plan ? 'recommendedStack'
        AND plan ? 'architecture'
        AND plan ? 'suggestedAgents'
        AND plan ? 'suggestedSkills'
        AND plan ? 'providerBindings'
        AND plan ? 'roadmap'
        AND plan ? 'assumptions'
        AND plan ? 'risks'
        AND plan ? 'composedPrompt'
        AND plan ? 'selectedSubprompts'
      ) NOT VALID;
  END IF;
END
$$;
