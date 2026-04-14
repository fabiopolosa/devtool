import {
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex
} from "drizzle-orm/pg-core";

const auditColumns = {
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull(),
  createdBy: text("created_by").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" }).notNull(),
  updatedBy: text("updated_by").notNull()
};

export const projects = pgTable(
  "projects",
  {
    id: text("id").primaryKey(),
    key: text("key").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    status: text("status").notNull(),
    policySetId: text("policy_set_id"),
    ...auditColumns
  },
  (table) => [index("idx_projects_status").on(table.status)]
);

export const repositories = pgTable(
  "repositories",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    url: text("url").notNull(),
    vcsProvider: text("vcs_provider").notNull(),
    defaultBranch: text("default_branch").notNull(),
    localPath: text("local_path"),
    status: text("status").notNull(),
    ...auditColumns
  },
  (table) => [index("idx_repositories_status").on(table.status)]
);

export const projectRepositoryLinks = pgTable(
  "project_repository_links",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id").notNull(),
    repositoryId: text("repository_id").notNull(),
    role: text("role").notNull(),
    rulesRef: text("rules_ref"),
    ...auditColumns
  },
  (table) => [
    index("idx_project_repo_links_project").on(table.projectId),
    index("idx_project_repo_links_repo").on(table.repositoryId)
  ]
);

export const roadmapItems = pgTable(
  "roadmap_items",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id").notNull(),
    title: text("title").notNull(),
    description: text("description").notNull(),
    state: text("state").notNull(),
    priority: integer("priority").notNull(),
    orderIndex: integer("order_index").notNull(),
    parentId: text("parent_id"),
    convertedTaskId: text("converted_task_id"),
    ...auditColumns
  },
  (table) => [
    index("idx_roadmap_project").on(table.projectId),
    index("idx_roadmap_state").on(table.state),
    index("idx_roadmap_order").on(table.projectId, table.orderIndex)
  ]
);

export const tasks = pgTable(
  "tasks",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id").notNull(),
    roadmapItemId: text("roadmap_item_id"),
    title: text("title").notNull(),
    type: text("type").notNull(),
    state: text("state").notNull(),
    goal: text("goal").notNull(),
    scopeInclude: jsonb("scope_include").$type<string[]>().notNull(),
    scopeExclude: jsonb("scope_exclude").$type<string[]>().notNull(),
    constraints: jsonb("constraints").$type<string[]>().notNull(),
    targetRepositoryIds: jsonb("target_repository_ids").$type<string[]>().notNull(),
    successCriteria: jsonb("success_criteria").$type<string[]>().notNull(),
    verificationPlan: jsonb("verification_plan").$type<string[]>().notNull(),
    dependencyTaskIds: jsonb("dependency_task_ids").$type<string[]>().notNull(),
    riskNotes: jsonb("risk_notes").$type<string[]>().notNull(),
    budget: jsonb("budget").$type<Record<string, unknown>>().notNull(),
    approvalsRequired: boolean("approvals_required").notNull(),
    ...auditColumns
  },
  (table) => [
    index("idx_tasks_project").on(table.projectId),
    index("idx_tasks_state").on(table.state),
    index("idx_tasks_roadmap").on(table.roadmapItemId)
  ]
);

export const taskRuns = pgTable(
  "task_runs",
  {
    id: text("id").primaryKey(),
    taskId: text("task_id").notNull(),
    workflowId: text("workflow_id").notNull(),
    status: text("status").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true, mode: "string" }),
    endedAt: timestamp("ended_at", { withTimezone: true, mode: "string" }),
    retryCount: integer("retry_count").notNull(),
    costProxyInputTokens: integer("cost_proxy_input_tokens").notNull(),
    costProxyOutputTokens: integer("cost_proxy_output_tokens").notNull(),
    reposTouched: jsonb("repos_touched").$type<string[]>().notNull(),
    ...auditColumns
  },
  (table) => [index("idx_task_runs_task").on(table.taskId), index("idx_task_runs_status").on(table.status)]
);

export const artifacts = pgTable(
  "artifacts",
  {
    id: text("id").primaryKey(),
    runId: text("run_id").notNull(),
    taskId: text("task_id").notNull(),
    type: text("type").notNull(),
    schemaVersion: text("schema_version").notNull(),
    uri: text("uri").notNull(),
    summary: text("summary").notNull(),
    ...auditColumns
  },
  (table) => [index("idx_artifacts_run").on(table.runId), index("idx_artifacts_task").on(table.taskId)]
);

export const verificationResults = pgTable(
  "verification_results",
  {
    id: text("id").primaryKey(),
    runId: text("run_id").notNull(),
    taskId: text("task_id").notNull(),
    overallStatus: text("overall_status").notNull(),
    score: doublePrecision("score"),
    summary: text("summary").notNull(),
    ...auditColumns
  },
  (table) => [index("idx_verification_results_run").on(table.runId), index("idx_verification_results_task").on(table.taskId)]
);

export const verificationSteps = pgTable(
  "verification_steps",
  {
    id: text("id").primaryKey(),
    verificationResultId: text("verification_result_id").notNull(),
    runId: text("run_id").notNull(),
    stepType: text("step_type").notNull(),
    command: text("command").notNull(),
    status: text("status").notNull(),
    exitCode: integer("exit_code"),
    durationMs: integer("duration_ms"),
    outputUri: text("output_uri"),
    ...auditColumns
  },
  (table) => [
    index("idx_verification_steps_result").on(table.verificationResultId),
    index("idx_verification_steps_run").on(table.runId)
  ]
);

export const memoryEntries = pgTable(
  "memory_entries",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id").notNull(),
    repositoryId: text("repository_id"),
    taskId: text("task_id"),
    category: text("category").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    priority: integer("priority").notNull(),
    pinned: boolean("pinned").notNull(),
    freshnessTtlHours: integer("freshness_ttl_hours"),
    sourceRef: text("source_ref"),
    sourceHash: text("source_hash"),
    isStale: boolean("is_stale").notNull(),
    ...auditColumns
  },
  (table) => [
    index("idx_memory_entries_project").on(table.projectId),
    index("idx_memory_entries_repo").on(table.repositoryId),
    index("idx_memory_entries_task").on(table.taskId),
    index("idx_memory_entries_category").on(table.category)
  ]
);

export const memoryChunks = pgTable(
  "memory_chunks",
  {
    id: text("id").primaryKey(),
    memoryEntryId: text("memory_entry_id").notNull(),
    projectId: text("project_id").notNull(),
    repositoryId: text("repository_id"),
    category: text("category").notNull(),
    chunkIndex: integer("chunk_index").notNull(),
    chunkText: text("chunk_text").notNull(),
    chunkTitle: text("chunk_title").notNull(),
    tokenEstimate: integer("token_estimate").notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull(),
    embeddingRef: text("embedding_ref"),
    ...auditColumns
  },
  (table) => [
    index("idx_memory_chunks_entry").on(table.memoryEntryId),
    index("idx_memory_chunks_project").on(table.projectId),
    index("idx_memory_chunks_repo").on(table.repositoryId),
    index("idx_memory_chunks_category").on(table.category)
  ]
);

export const embeddingJobs = pgTable(
  "embedding_jobs",
  {
    id: text("id").primaryKey(),
    sourceType: text("source_type").notNull(),
    sourceId: text("source_id").notNull(),
    projectId: text("project_id").notNull(),
    status: text("status").notNull(),
    batchSize: integer("batch_size").notNull(),
    embeddingModel: text("embedding_model").notNull(),
    errorMessage: text("error_message"),
    ...auditColumns
  },
  (table) => [index("idx_embedding_jobs_project").on(table.projectId), index("idx_embedding_jobs_source").on(table.sourceType, table.sourceId)]
);

export const retrievalQueryLogs = pgTable(
  "retrieval_query_logs",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id").notNull(),
    taskRunId: text("task_run_id"),
    role: text("role").notNull(),
    queryText: text("query_text").notNull(),
    topK: integer("top_k").notNull(),
    filters: jsonb("filters").$type<Record<string, unknown>>().notNull(),
    returnedChunkIds: jsonb("returned_chunk_ids").$type<string[]>().notNull(),
    tokenEstimate: integer("token_estimate").notNull(),
    ...auditColumns
  },
  (table) => [
    index("idx_retrieval_logs_project").on(table.projectId),
    index("idx_retrieval_logs_task_run").on(table.taskRunId),
    index("idx_retrieval_logs_role").on(table.role)
  ]
);

export const researchNotes = pgTable(
  "research_notes",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id").notNull(),
    taskId: text("task_id"),
    title: text("title").notNull(),
    question: text("question").notNull(),
    summary: text("summary").notNull(),
    sourceList: jsonb("source_list").$type<Array<{ title: string; url: string }>>().notNull(),
    breakingChangeRisk: text("breaking_change_risk").notNull(),
    caveats: jsonb("caveats").$type<string[]>().notNull(),
    ...auditColumns
  },
  (table) => [index("idx_research_notes_project").on(table.projectId), index("idx_research_notes_task").on(table.taskId)]
);

export const policies = pgTable(
  "policies",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id"),
    type: text("type").notNull(),
    scope: text("scope").notNull(),
    activeVersion: text("active_version").notNull(),
    jsonRules: jsonb("json_rules").$type<Record<string, unknown>>().notNull(),
    ...auditColumns
  },
  (table) => [index("idx_policies_project").on(table.projectId), index("idx_policies_type").on(table.type)]
);

export const promptVersions = pgTable(
  "prompt_versions",
  {
    id: text("id").primaryKey(),
    role: text("role").notNull(),
    version: text("version").notNull(),
    contentRef: text("content_ref").notNull(),
    changelog: text("changelog").notNull(),
    promoted: boolean("promoted").notNull(),
    ...auditColumns
  },
  (table) => [index("idx_prompt_versions_role").on(table.role)]
);

export const routingRules = pgTable(
  "routing_rules",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id"),
    role: text("role").notNull(),
    capability: text("capability").notNull(),
    precedence: integer("precedence").notNull(),
    conditions: jsonb("conditions").$type<Record<string, unknown>>().notNull(),
    fallbackChain: jsonb("fallback_chain").$type<string[]>().notNull(),
    enabled: boolean("enabled").notNull(),
    ...auditColumns
  },
  (table) => [
    index("idx_routing_rules_project").on(table.projectId),
    index("idx_routing_rules_role").on(table.role),
    index("idx_routing_rules_capability").on(table.capability)
  ]
);

export const autoresearchExperiments = pgTable(
  "autoresearch_experiments",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id"),
    targetType: text("target_type").notNull(),
    status: text("status").notNull(),
    metricSet: jsonb("metric_set").$type<string[]>().notNull(),
    baselineVersionRef: text("baseline_version_ref").notNull(),
    ...auditColumns
  },
  (table) => [index("idx_autoresearch_experiments_project").on(table.projectId), index("idx_autoresearch_experiments_status").on(table.status)]
);

export const autoresearchRuns = pgTable(
  "autoresearch_runs",
  {
    id: text("id").primaryKey(),
    experimentId: text("experiment_id").notNull(),
    variantId: text("variant_id").notNull(),
    status: text("status").notNull(),
    metrics: jsonb("metrics").$type<Record<string, number>>().notNull(),
    winnerFlag: boolean("winner_flag").notNull(),
    rollbackFlag: boolean("rollback_flag").notNull(),
    ...auditColumns
  },
  (table) => [index("idx_autoresearch_runs_experiment").on(table.experimentId), index("idx_autoresearch_runs_variant").on(table.variantId)]
);

export const approvals = pgTable(
  "approvals",
  {
    id: text("id").primaryKey(),
    subjectType: text("subject_type").notNull(),
    subjectId: text("subject_id").notNull(),
    status: text("status").notNull(),
    requestedBy: text("requested_by").notNull(),
    decidedBy: text("decided_by"),
    reason: text("reason"),
    decidedAt: timestamp("decided_at", { withTimezone: true, mode: "string" }),
    ...auditColumns
  },
  (table) => [index("idx_approvals_subject").on(table.subjectType, table.subjectId), index("idx_approvals_status").on(table.status)]
);

export const chatThreads = pgTable(
  "chat_threads",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id"),
    contextType: text("context_type").notNull(),
    status: text("status").notNull(),
    title: text("title"),
    ...auditColumns
  },
  (table) => [index("idx_chat_threads_project").on(table.projectId), index("idx_chat_threads_status").on(table.status)]
);

export const chatMessages = pgTable(
  "chat_messages",
  {
    id: text("id").primaryKey(),
    threadId: text("thread_id").notNull(),
    role: text("role").notNull(),
    content: text("content").notNull(),
    structuredIntent: jsonb("structured_intent").$type<Record<string, unknown>>(),
    ...auditColumns
  },
  (table) => [index("idx_chat_messages_thread").on(table.threadId)]
);

export const providerConfigs = pgTable(
  "provider_configs",
  {
    id: text("id").primaryKey(),
    provider: text("provider").notNull(),
    endpoint: text("endpoint"),
    authRef: text("auth_ref").notNull(),
    enabled: boolean("enabled").notNull(),
    timeoutMs: integer("timeout_ms").notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull(),
    ...auditColumns
  },
  (table) => [index("idx_provider_configs_provider").on(table.provider)]
);

export const providerCapabilities = pgTable(
  "provider_capabilities",
  {
    id: text("id").primaryKey(),
    providerConfigId: text("provider_config_id").notNull(),
    capabilityClass: text("capability_class").notNull(),
    supported: boolean("supported").notNull(),
    notes: text("notes"),
    ...auditColumns
  },
  (table) => [
    index("idx_provider_capabilities_provider").on(table.providerConfigId),
    index("idx_provider_capabilities_capability").on(table.capabilityClass)
  ]
);

export const providerModels = pgTable(
  "provider_models",
  {
    id: text("id").primaryKey(),
    providerConfigId: text("provider_config_id").notNull(),
    modelId: text("model_id").notNull(),
    capabilityClass: text("capability_class").notNull(),
    contextWindow: integer("context_window"),
    maxOutputTokens: integer("max_output_tokens"),
    pricingMeta: jsonb("pricing_meta").$type<Record<string, number>>(),
    enabled: boolean("enabled").notNull(),
    ...auditColumns
  },
  (table) => [
    index("idx_provider_models_provider").on(table.providerConfigId),
    index("idx_provider_models_model").on(table.modelId),
    index("idx_provider_models_capability").on(table.capabilityClass)
  ]
);

export const projectProviderBindings = pgTable(
  "project_provider_bindings",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id").notNull(),
    role: text("role"),
    capabilityClass: text("capability_class").notNull(),
    primaryModelId: text("primary_model_id").notNull(),
    fallbackModelIds: jsonb("fallback_model_ids").$type<string[]>().notNull(),
    enabled: boolean("enabled").notNull(),
    ...auditColumns
  },
  (table) => [
    index("idx_project_provider_bindings_project").on(table.projectId),
    index("idx_project_provider_bindings_capability").on(table.capabilityClass)
  ]
);

export const providerHealthchecks = pgTable(
  "provider_healthchecks",
  {
    id: text("id").primaryKey(),
    providerConfigId: text("provider_config_id").notNull(),
    modelId: text("model_id"),
    status: text("status").notNull(),
    latencyMs: integer("latency_ms"),
    errorRate: doublePrecision("error_rate"),
    details: text("details"),
    checkedAt: timestamp("checked_at", { withTimezone: true, mode: "string" }).notNull(),
    ...auditColumns
  },
  (table) => [
    index("idx_provider_healthchecks_provider").on(table.providerConfigId),
    index("idx_provider_healthchecks_model").on(table.modelId),
    index("idx_provider_healthchecks_status").on(table.status)
  ]
);

export const modelRoutingPreferences = pgTable(
  "model_routing_preferences",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id").notNull(),
    capabilityClass: text("capability_class").notNull(),
    costWeight: doublePrecision("cost_weight").notNull(),
    latencyWeight: doublePrecision("latency_weight").notNull(),
    qualityWeight: doublePrecision("quality_weight").notNull(),
    ...auditColumns
  },
  (table) => [
    index("idx_model_routing_preferences_project").on(table.projectId),
    index("idx_model_routing_preferences_capability").on(table.capabilityClass)
  ]
);

export const users = pgTable(
  "users",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull(),
    displayName: text("display_name").notNull(),
    status: text("status").notNull(),
    passwordHash: text("password_hash").notNull(),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true, mode: "string" }),
    ...auditColumns
  },
  (table) => [
    uniqueIndex("ux_users_email").on(table.email),
    index("idx_users_status").on(table.status)
  ]
);

export const roles = pgTable(
  "roles",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    description: text("description").notNull(),
    permissions: jsonb("permissions").$type<string[]>().notNull(),
    isSystem: boolean("is_system").notNull(),
    ...auditColumns
  },
  (table) => [uniqueIndex("ux_roles_name").on(table.name)]
);

export const userRoles = pgTable(
  "user_roles",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    roleId: text("role_id").notNull(),
    ...auditColumns
  },
  (table) => [
    index("idx_user_roles_user").on(table.userId),
    index("idx_user_roles_role").on(table.roleId),
    uniqueIndex("ux_user_roles_user_role").on(table.userId, table.roleId)
  ]
);

export const sessions = pgTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true, mode: "string" }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true, mode: "string" }),
    refreshTokenHash: text("refresh_token_hash"),
    refreshExpiresAt: timestamp("refresh_expires_at", { withTimezone: true, mode: "string" }),
    refreshRevokedAt: timestamp("refresh_revoked_at", { withTimezone: true, mode: "string" }),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    ...auditColumns
  },
  (table) => [
    uniqueIndex("ux_sessions_token_hash").on(table.tokenHash),
    uniqueIndex("ux_sessions_refresh_token_hash").on(table.refreshTokenHash),
    index("idx_sessions_user").on(table.userId),
    index("idx_sessions_expires").on(table.expiresAt),
    index("idx_sessions_refresh_expires").on(table.refreshExpiresAt)
  ]
);

export const auditEvents = pgTable(
  "audit_events",
  {
    id: text("id").primaryKey(),
    userId: text("user_id"),
    action: text("action").notNull(),
    resourceType: text("resource_type").notNull(),
    resourceId: text("resource_id"),
    status: text("status").notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true, mode: "string" }).notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull(),
    ...auditColumns
  },
  (table) => [
    index("idx_audit_events_user").on(table.userId),
    index("idx_audit_events_action").on(table.action),
    index("idx_audit_events_resource").on(table.resourceType, table.resourceId),
    index("idx_audit_events_occurred").on(table.occurredAt)
  ]
);

export const projectRoleBindings = pgTable(
  "project_role_bindings",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    projectId: text("project_id").notNull(),
    roleId: text("role_id").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true, mode: "string" }),
    ...auditColumns
  },
  (table) => [
    index("idx_project_role_bindings_user").on(table.userId),
    index("idx_project_role_bindings_project").on(table.projectId),
    index("idx_project_role_bindings_role").on(table.roleId),
    uniqueIndex("ux_project_role_bindings_user_project_role").on(table.userId, table.projectId, table.roleId)
  ]
);

export const repositoryRoleBindings = pgTable(
  "repository_role_bindings",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    repositoryId: text("repository_id").notNull(),
    roleId: text("role_id").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true, mode: "string" }),
    ...auditColumns
  },
  (table) => [
    index("idx_repository_role_bindings_user").on(table.userId),
    index("idx_repository_role_bindings_repository").on(table.repositoryId),
    index("idx_repository_role_bindings_role").on(table.roleId),
    uniqueIndex("ux_repository_role_bindings_user_repository_role").on(
      table.userId,
      table.repositoryId,
      table.roleId
    )
  ]
);

export const delegatedPermissions = pgTable(
  "delegated_permissions",
  {
    id: text("id").primaryKey(),
    grantedByUserId: text("granted_by_user_id").notNull(),
    granteeUserId: text("grantee_user_id").notNull(),
    permission: text("permission").notNull(),
    scopeType: text("scope_type").notNull(),
    scopeId: text("scope_id"),
    expiresAt: timestamp("expires_at", { withTimezone: true, mode: "string" }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true, mode: "string" }),
    ...auditColumns
  },
  (table) => [
    index("idx_delegated_permissions_grantee").on(table.granteeUserId),
    index("idx_delegated_permissions_scope").on(table.scopeType, table.scopeId),
    index("idx_delegated_permissions_expires").on(table.expiresAt)
  ]
);

export const oidcAuthStates = pgTable(
  "oidc_auth_states",
  {
    id: text("id").primaryKey(),
    provider: text("provider").notNull(),
    state: text("state").notNull(),
    nonce: text("nonce").notNull(),
    codeVerifier: text("code_verifier").notNull(),
    redirectUri: text("redirect_uri").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true, mode: "string" }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true, mode: "string" }),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    ...auditColumns
  },
  (table) => [
    uniqueIndex("ux_oidc_auth_states_state").on(table.state),
    index("idx_oidc_auth_states_expires").on(table.expiresAt),
    index("idx_oidc_auth_states_consumed").on(table.consumedAt)
  ]
);

export const skills = pgTable(
  "skills",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    description: text("description").notNull(),
    repositoryUrl: text("repository_url").notNull(),
    version: text("version").notNull(),
    installed: boolean("installed").notNull(),
    categories: jsonb("categories").$type<string[]>().notNull(),
    instructions: text("instructions").notNull(),
    ...auditColumns
  },
  (table) => [
    index("idx_skills_name").on(table.name),
    index("idx_skills_installed").on(table.installed),
    uniqueIndex("ux_skills_repository_name").on(table.repositoryUrl, table.name)
  ]
);

export const agents = pgTable(
  "agents",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    role: text("role").notNull(),
    icon: text("icon").notNull(),
    description: text("description").notNull(),
    adapterType: text("adapter_type").notNull(),
    desiredSkills: jsonb("desired_skills").$type<string[]>().notNull(),
    reportTo: text("report_to"),
    runtimeConfig: jsonb("runtime_config").$type<Record<string, unknown>>().notNull(),
    capabilities: jsonb("capabilities").$type<string[]>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" }).notNull(),
    status: text("status").notNull()
  },
  (table) => [index("idx_agents_role").on(table.role), index("idx_agents_status").on(table.status)]
);
