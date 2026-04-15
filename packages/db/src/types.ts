import type {
  AgentConfig,
  AuditEvent,
  Approval,
  Artifact,
  AutoResearchExperiment,
  AutoResearchRun,
  BrainstormPlan,
  BrainstormSession,
  CodingWorkflow,
  ChatMessage,
  ChatThread,
  DelegatedPermission,
  EmbeddingJob,
  MemoryChunk,
  MemoryEntry,
  Machine,
  McpConnection,
  McpDelegationRun,
  LocalRepository,
  Environment,
  ModelRoutingPreference,
  OidcAuthState,
  Policy,
  PromptRegistryEntry,
  Project,
  ProjectProviderBinding,
  ProjectRoleBinding,
  ProjectRepositoryLink,
  PromptVersion,
  ProviderCapability,
  ProviderConfig,
  ProviderDiscoveryLog,
  ProviderHealthcheck,
  ProviderModel,
  RepositoryRoleBinding,
  Repository,
  ResearchNote,
  Role,
  RetrievalQueryLog,
  RoadmapItem,
  Session,
  Tenant,
  UserTenant,
  Job,
  KnowledgeNode,
  KnowledgeConfig,
  ContextNote,
  SecretConfig,
  SchemaDoc,
  Skill,
  UsageEvent,
  Subprompt,
  RoutingRule,
  Task,
  TaskRun,
  User,
  UserRole,
  VersionSnapshot,
  VerificationResult,
  VerificationStep
} from "@cp/domain";

export interface DatabaseTables {
  agents: AgentConfig;
  secrets: SecretConfig;
  schema_docs: SchemaDoc;
  environments: Environment;
  machines: Machine;
  local_repositories: LocalRepository;
  version_snapshots: VersionSnapshot;
  projects: Project;
  repositories: Repository;
  project_repository_links: ProjectRepositoryLink;
  roadmap_items: RoadmapItem;
  tasks: Task;
  task_runs: TaskRun;
  artifacts: Artifact;
  verification_results: VerificationResult;
  verification_steps: VerificationStep;
  memory_entries: MemoryEntry;
  memory_chunks: MemoryChunk;
  knowledge_nodes: KnowledgeNode;
  knowledge_configs: KnowledgeConfig;
  context_notes: ContextNote;
  embedding_jobs: EmbeddingJob;
  retrieval_query_logs: RetrievalQueryLog;
  research_notes: ResearchNote;
  policies: Policy;
  prompt_versions: PromptVersion;
  prompt_registry: PromptRegistryEntry;
  routing_rules: RoutingRule;
  autoresearch_experiments: AutoResearchExperiment;
  autoresearch_runs: AutoResearchRun;
  approvals: Approval;
  chat_threads: ChatThread;
  chat_messages: ChatMessage;
  provider_configs: ProviderConfig;
  provider_capabilities: ProviderCapability;
  provider_models: ProviderModel;
  project_provider_bindings: ProjectProviderBinding;
  provider_healthchecks: ProviderHealthcheck;
  model_routing_preferences: ModelRoutingPreference;
  users: User;
  roles: Role;
  user_roles: UserRole;
  sessions: Session;
  audit_events: AuditEvent;
  usage_events: UsageEvent;
  project_role_bindings: ProjectRoleBinding;
  repository_role_bindings: RepositoryRoleBinding;
  delegated_permissions: DelegatedPermission;
  oidc_auth_states: OidcAuthState;
  skills: Skill;
  provider_discovery_logs: ProviderDiscoveryLog;
  brainstorm_sessions: BrainstormSession;
  brainstorm_plans: BrainstormPlan;
  coding_workflows: CodingWorkflow;
  mcp_connections: McpConnection;
  mcp_delegation_runs: McpDelegationRun;
  subprompts: Subprompt;
  tenants: Tenant;
  user_tenants: UserTenant;
  jobs: Job;
}

export type TableName = keyof DatabaseTables;
