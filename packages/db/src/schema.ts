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
    tenantId: text("tenant_id").notNull(),
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
    tenantId: text("tenant_id").notNull(),
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
    tenantId: text("tenant_id").notNull(),
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
    tenantId: text("tenant_id").notNull(),
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
    tenantId: text("tenant_id").notNull(),
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
    tenantId: text("tenant_id").notNull(),
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
    tenantId: text("tenant_id").notNull(),
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

export const knowledgeNodes = pgTable(
  "knowledge_nodes",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id"),
    projectId: text("project_id"),
    scope: text("scope").notNull(),
    path: text("path").notNull(),
    content: text("content").notNull(),
    embedding: jsonb("embedding").$type<number[]>(),
    ...auditColumns
  },
  (table) => [
    uniqueIndex("ux_knowledge_nodes_scope_path").on(table.scope, table.path),
    index("idx_knowledge_nodes_scope").on(table.scope),
    index("idx_knowledge_nodes_tenant").on(table.tenantId),
    index("idx_knowledge_nodes_project").on(table.projectId),
    index("idx_knowledge_nodes_path").on(table.path)
  ]
);

export const knowledgeConfigs = pgTable(
  "knowledge_configs",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id").notNull(),
    projectId: text("project_id"),
    scope: text("scope").notNull(),
    autoCapture: boolean("auto_capture").notNull(),
    captureModes: jsonb("capture_modes").$type<string[]>().notNull(),
    requireApproval: boolean("require_approval").notNull(),
    maxNodes: integer("max_nodes").notNull(),
    relevanceThreshold: doublePrecision("relevance_threshold").notNull(),
    versioning: boolean("versioning").notNull(),
    requireReview: boolean("require_review").notNull(),
    ...auditColumns
  },
  (table) => [
    uniqueIndex("ux_knowledge_configs_tenant_scope_project").on(
      table.tenantId,
      table.scope,
      table.projectId
    ),
    index("idx_knowledge_configs_tenant").on(table.tenantId),
    index("idx_knowledge_configs_project").on(table.projectId),
    index("idx_knowledge_configs_scope").on(table.scope)
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

export const contextNotes = pgTable(
  "context_notes",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id").notNull(),
    projectId: text("project_id").notNull(),
    path: text("path").notNull(),
    title: text("title").notNull(),
    content: text("content").notNull(),
    tags: jsonb("tags").$type<string[]>().notNull(),
    linkRefs: jsonb("link_refs").$type<string[]>().notNull(),
    pinned: boolean("pinned").notNull(),
    ...auditColumns
  },
  (table) => [
    uniqueIndex("ux_context_notes_tenant_project_path").on(table.tenantId, table.projectId, table.path),
    index("idx_context_notes_tenant").on(table.tenantId),
    index("idx_context_notes_project").on(table.projectId),
    index("idx_context_notes_path").on(table.path)
  ]
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

export const promptRegistry = pgTable(
  "prompt_registry",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id"),
    projectId: text("project_id"),
    type: text("type").notNull(),
    scope: text("scope").notNull(),
    target: text("target").notNull(),
    version: text("version").notNull(),
    content: text("content").notNull(),
    status: text("status").notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    ...auditColumns
  },
  (table) => [
    index("idx_prompt_registry_tenant").on(table.tenantId),
    index("idx_prompt_registry_project").on(table.projectId),
    index("idx_prompt_registry_scope").on(table.scope),
    index("idx_prompt_registry_status").on(table.status),
    index("idx_prompt_registry_scope_type_target").on(table.scope, table.type, table.target)
  ]
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
    tenantId: text("tenant_id").notNull(),
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
    tenantId: text("tenant_id").notNull(),
    provider: text("provider").notNull(),
    providerId: text("provider_id").notNull(),
    apiKey: text("api_key"),
    endpoint: text("endpoint"),
    authRef: text("auth_ref").notNull(),
    secretRef: text("secret_ref"),
    enabled: boolean("enabled").notNull(),
    timeoutMs: integer("timeout_ms").notNull(),
    validationStatus: text("validation_status").notNull(),
    lastValidatedAt: timestamp("last_validated_at", { withTimezone: true, mode: "string" }),
    validationError: text("validation_error"),
    requestsPerMinute: integer("requests_per_minute"),
    tokensPerMinute: integer("tokens_per_minute"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull(),
    ...auditColumns
  },
  (table) => [
    index("idx_provider_configs_tenant").on(table.tenantId),
    index("idx_provider_configs_provider").on(table.provider),
    index("idx_provider_configs_provider_id").on(table.providerId)
  ]
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
    tenantId: text("tenant_id"),
    projectId: text("project_id"),
    jobId: text("job_id"),
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
    index("idx_audit_events_tenant").on(table.tenantId),
    index("idx_audit_events_project").on(table.projectId),
    index("idx_audit_events_job").on(table.jobId),
    index("idx_audit_events_user").on(table.userId),
    index("idx_audit_events_action").on(table.action),
    index("idx_audit_events_resource").on(table.resourceType, table.resourceId),
    index("idx_audit_events_occurred").on(table.occurredAt)
  ]
);

export const usageEvents = pgTable(
  "usage_events",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id").notNull(),
    projectId: text("project_id"),
    jobId: text("job_id"),
    provider: text("provider").notNull(),
    model: text("model").notNull(),
    inputTokens: integer("input_tokens").notNull(),
    outputTokens: integer("output_tokens").notNull(),
    cost: doublePrecision("cost").notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull(),
    ...auditColumns
  },
  (table) => [
    index("idx_usage_events_tenant").on(table.tenantId),
    index("idx_usage_events_project").on(table.projectId),
    index("idx_usage_events_job").on(table.jobId),
    index("idx_usage_events_provider").on(table.provider),
    index("idx_usage_events_model").on(table.model),
    index("idx_usage_events_created").on(table.createdAt)
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
    scope: text("scope").notNull(),
    sourceType: text("source_type").notNull(),
    sourceRef: text("source_ref"),
    capabilities: jsonb("capabilities").$type<string[]>().notNull(),
    validationStatus: text("validation_status").notNull(),
    validationErrors: jsonb("validation_errors").$type<string[]>().notNull(),
    validationWarnings: jsonb("validation_warnings").$type<string[]>().notNull(),
    lastValidatedAt: timestamp("last_validated_at", { withTimezone: true, mode: "string" }),
    sandboxProfile: jsonb("sandbox_profile").$type<Record<string, unknown>>().notNull(),
    executionConfig: jsonb("execution_config").$type<Record<string, unknown>>().notNull(),
    currentVersion: text("current_version"),
    versionHistory: jsonb("version_history").$type<Record<string, unknown>[]>().notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull(),
    ...auditColumns
  },
  (table) => [
    index("idx_skills_name").on(table.name),
    index("idx_skills_installed").on(table.installed),
    index("idx_skills_scope").on(table.scope),
    index("idx_skills_validation_status").on(table.validationStatus),
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

export const secrets = pgTable(
  "secrets",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    description: text("description").notNull(),
    encryptedValue: text("encrypted_value").notNull(),
    scope: text("scope").notNull(),
    ...auditColumns
  },
  (table) => [
    uniqueIndex("ux_secrets_name_scope").on(table.name, table.scope),
    index("idx_secrets_scope").on(table.scope)
  ]
);

export const schemaDocs = pgTable(
  "schema_docs",
  {
    id: text("id").primaryKey(),
    title: text("title").notNull(),
    description: text("description").notNull(),
    databaseName: text("database_name").notNull(),
    dialect: text("dialect").notNull(),
    tables: jsonb("tables").$type<Record<string, unknown>[]>().notNull(),
    conventions: jsonb("conventions").$type<Record<string, string>[]>().notNull(),
    stackNotes: jsonb("stack_notes").$type<string[]>().notNull(),
    lastIntrospectedAt: timestamp("last_introspected_at", { withTimezone: true, mode: "string" }).notNull(),
    ...auditColumns
  },
  (table) => [index("idx_schema_docs_database").on(table.databaseName)]
);

export const environments = pgTable(
  "environments",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    description: text("description").notNull(),
    type: text("type").notNull(),
    region: text("region"),
    baseUrl: text("base_url"),
    status: text("status").notNull(),
    notes: jsonb("notes").$type<string[]>().notNull(),
    ...auditColumns
  },
  (table) => [index("idx_environments_status").on(table.status), index("idx_environments_type").on(table.type)]
);

export const machines = pgTable(
  "machines",
  {
    id: text("id").primaryKey(),
    environmentId: text("environment_id").notNull(),
    name: text("name").notNull(),
    host: text("host").notNull(),
    status: text("status").notNull(),
    cpuCores: integer("cpu_cores").notNull(),
    gpuCount: integer("gpu_count").notNull(),
    ramGb: integer("ram_gb").notNull(),
    services: jsonb("services").$type<string[]>().notNull(),
    agents: jsonb("agents").$type<string[]>().notNull(),
    lastHeartbeatAt: timestamp("last_heartbeat_at", { withTimezone: true, mode: "string" }),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull(),
    ...auditColumns
  },
  (table) => [index("idx_machines_environment").on(table.environmentId), index("idx_machines_status").on(table.status)]
);

export const workspaces = pgTable(
  "workspaces",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id").notNull(),
    projectId: text("project_id").notNull(),
    mode: text("mode").notNull(),
    localPath: text("local_path"),
    runtimeStatus: text("runtime_status").notNull(),
    runtimeDetails: jsonb("runtime_details").$type<Record<string, unknown>>().notNull(),
    lastStartedAt: timestamp("last_started_at", { withTimezone: true, mode: "string" }),
    lastStoppedAt: timestamp("last_stopped_at", { withTimezone: true, mode: "string" }),
    lastDeployedAt: timestamp("last_deployed_at", { withTimezone: true, mode: "string" }),
    ...auditColumns
  },
  (table) => [
    uniqueIndex("ux_workspaces_tenant_project").on(table.tenantId, table.projectId),
    index("idx_workspaces_project").on(table.projectId),
    index("idx_workspaces_runtime_status").on(table.runtimeStatus)
  ]
);

export const localRepositories = pgTable(
  "local_repositories",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    rootPath: text("root_path").notNull(),
    description: text("description").notNull(),
    status: text("status").notNull(),
    detectedGit: boolean("detected_git").notNull(),
    currentBranch: text("current_branch"),
    lastCommitSha: text("last_commit_sha"),
    indexedFileCount: integer("indexed_file_count").notNull(),
    lastScannedAt: timestamp("last_scanned_at", { withTimezone: true, mode: "string" }),
    ...auditColumns
  },
  (table) => [uniqueIndex("ux_local_repositories_root_path").on(table.rootPath), index("idx_local_repositories_status").on(table.status)]
);

export const versionSnapshots = pgTable(
  "version_snapshots",
  {
    id: text("id").primaryKey(),
    localRepositoryId: text("local_repository_id").notNull(),
    taskId: text("task_id"),
    label: text("label").notNull(),
    trigger: text("trigger").notNull(),
    files: jsonb("files").$type<Record<string, string>[]>().notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull(),
    ...auditColumns
  },
  (table) => [
    index("idx_version_snapshots_repo").on(table.localRepositoryId),
    index("idx_version_snapshots_task").on(table.taskId),
    index("idx_version_snapshots_trigger").on(table.trigger)
  ]
);

export const providerDiscoveryLogs = pgTable(
  "provider_discovery_logs",
  {
    id: text("id").primaryKey(),
    source: text("source").notNull(),
    queries: jsonb("queries").$type<string[]>().notNull(),
    discoveredProviders: jsonb("discovered_providers").$type<string[]>().notNull(),
    discoveredModels: jsonb("discovered_models").$type<string[]>().notNull(),
    status: text("status").notNull(),
    searchStartedAt: timestamp("search_started_at", { withTimezone: true, mode: "string" }).notNull(),
    searchFinishedAt: timestamp("search_finished_at", { withTimezone: true, mode: "string" }).notNull(),
    notes: text("notes"),
    rawResults: jsonb("raw_results").$type<Record<string, unknown>>(),
    ...auditColumns
  },
  (table) => [
    index("idx_provider_discovery_logs_status").on(table.status),
    index("idx_provider_discovery_logs_finished").on(table.searchFinishedAt)
  ]
);

export const subprompts = pgTable(
  "subprompts",
  {
    id: text("id").primaryKey(),
    title: text("title").notNull(),
    category: text("category").notNull(),
    summary: text("summary").notNull(),
    prompt: text("prompt").notNull(),
    tags: jsonb("tags").$type<string[]>().notNull(),
    sourcePath: text("source_path").notNull(),
    enabled: boolean("enabled").notNull()
  },
  (table) => [index("idx_subprompts_category").on(table.category), index("idx_subprompts_enabled").on(table.enabled)]
);

export const brainstormSessions = pgTable(
  "brainstorm_sessions",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id").notNull(),
    threadId: text("thread_id"),
    projectId: text("project_id"),
    status: text("status").notNull(),
    projectIntent: text("project_intent").notNull(),
    selectedSubpromptIds: jsonb("selected_subprompt_ids").$type<string[]>().notNull(),
    questions: jsonb("questions").$type<Record<string, unknown>[]>().notNull(),
    answers: jsonb("answers").$type<Record<string, string>>().notNull(),
    planId: text("plan_id"),
    approvedAt: timestamp("approved_at", { withTimezone: true, mode: "string" }),
    appliedAt: timestamp("applied_at", { withTimezone: true, mode: "string" }),
    ...auditColumns
  },
  (table) => [
    index("idx_brainstorm_sessions_status").on(table.status),
    index("idx_brainstorm_sessions_project").on(table.projectId),
    index("idx_brainstorm_sessions_thread").on(table.threadId)
  ]
);

export const brainstormPlans = pgTable(
  "brainstorm_plans",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id").notNull(),
    sessionId: text("session_id").notNull(),
    title: text("title").notNull(),
    executiveSummary: text("executive_summary").notNull(),
    plan: jsonb("plan").$type<Record<string, unknown>>().notNull(),
    ...auditColumns
  },
  (table) => [index("idx_brainstorm_plans_session").on(table.sessionId)]
);

export const mcpConnections = pgTable(
  "mcp_connections",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    baseUrl: text("base_url").notNull(),
    authSecretRef: text("auth_secret_ref"),
    enabled: boolean("enabled").notNull(),
    status: text("status").notNull(),
    capabilities: jsonb("capabilities").$type<string[]>().notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull(),
    lastCheckedAt: timestamp("last_checked_at", { withTimezone: true, mode: "string" }),
    ...auditColumns
  },
  (table) => [index("idx_mcp_connections_status").on(table.status)]
);

export const mcpDelegationRuns = pgTable(
  "mcp_delegation_runs",
  {
    id: text("id").primaryKey(),
    connectionId: text("connection_id").notNull(),
    operation: text("operation").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    status: text("status").notNull(),
    response: jsonb("response").$type<Record<string, unknown>>(),
    error: text("error"),
    startedAt: timestamp("started_at", { withTimezone: true, mode: "string" }),
    endedAt: timestamp("ended_at", { withTimezone: true, mode: "string" }),
    ...auditColumns
  },
  (table) => [
    index("idx_mcp_delegation_runs_connection").on(table.connectionId),
    index("idx_mcp_delegation_runs_status").on(table.status),
    index("idx_mcp_delegation_runs_operation").on(table.operation)
  ]
);

export const tenants = pgTable(
  "tenants",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull()
  },
  (table) => [uniqueIndex("ux_tenants_name").on(table.name)]
);

export const userTenants = pgTable(
  "user_tenants",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    tenantId: text("tenant_id").notNull(),
    role: text("role").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull()
  },
  (table) => [
    index("idx_user_tenants_user").on(table.userId),
    index("idx_user_tenants_tenant").on(table.tenantId),
    uniqueIndex("ux_user_tenants_user_tenant").on(table.userId, table.tenantId)
  ]
);

export const jobs = pgTable(
  "jobs",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id").notNull(),
    projectId: text("project_id"),
    type: text("type").notNull(),
    title: text("title").notNull(),
    status: text("status").notNull(),
    priority: integer("priority").notNull().default(0),
    retryCount: integer("retry_count").notNull().default(0),
    maxRetries: integer("max_retries").notNull().default(3),
    actionRequired: boolean("action_required").notNull().default(false),
    actionType: text("action_type"),
    resourceType: text("resource_type"),
    resourceId: text("resource_id"),
    payload: jsonb("payload").$type<Record<string, unknown>>(),
    dependencies: jsonb("dependencies").$type<string[]>().notNull(),
    dependsOnCount: integer("depends_on_count").notNull().default(0),
    ready: boolean("ready").notNull().default(false),
    startedAt: timestamp("started_at", { withTimezone: true, mode: "string" }),
    completedAt: timestamp("completed_at", { withTimezone: true, mode: "string" }),
    createdBy: text("created_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" }).notNull()
  },
  (table) => [
    index("idx_jobs_tenant").on(table.tenantId),
    index("idx_jobs_project").on(table.projectId),
    index("idx_jobs_status").on(table.status),
    index("idx_jobs_type").on(table.type),
    index("idx_jobs_priority").on(table.priority),
    index("idx_jobs_action_required").on(table.actionRequired),
    index("idx_jobs_resource").on(table.resourceType, table.resourceId),
    index("idx_jobs_ready").on(table.ready),
    index("idx_jobs_depends_on_count").on(table.dependsOnCount)
  ]
);

export const codingWorkflows = pgTable(
  "coding_workflows",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id").notNull(),
    projectId: text("project_id").notNull(),
    title: text("title").notNull(),
    request: text("request").notNull(),
    state: text("state").notNull(),
    planDecision: text("plan_decision").notNull(),
    patchDecision: text("patch_decision").notNull(),
    plan: jsonb("plan").$type<Record<string, unknown>>().notNull(),
    generatedTaskIds: jsonb("generated_task_ids").$type<string[]>().notNull(),
    actionRequired: boolean("action_required").notNull().default(false),
    reviewSummary: text("review_summary"),
    timeline: jsonb("timeline").$type<Record<string, unknown>[]>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull(),
    createdBy: text("created_by").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" }).notNull(),
    updatedBy: text("updated_by").notNull()
  },
  (table) => [
    index("idx_coding_workflows_tenant").on(table.tenantId),
    index("idx_coding_workflows_project").on(table.projectId),
    index("idx_coding_workflows_state").on(table.state),
    index("idx_coding_workflows_plan_decision").on(table.planDecision),
    index("idx_coding_workflows_patch_decision").on(table.patchDecision),
    index("idx_coding_workflows_action_required").on(table.actionRequired)
  ]
);
