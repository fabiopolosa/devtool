import type {
  AuditEvent,
  Approval,
  Artifact,
  AutoResearchExperiment,
  AutoResearchRun,
  ChatMessage,
  ChatThread,
  DelegatedPermission,
  EmbeddingJob,
  MemoryChunk,
  MemoryEntry,
  ModelRoutingPreference,
  OidcAuthState,
  Policy,
  Project,
  ProjectProviderBinding,
  ProjectRoleBinding,
  ProjectRepositoryLink,
  PromptVersion,
  ProviderCapability,
  ProviderConfig,
  ProviderHealthcheck,
  ProviderModel,
  RepositoryRoleBinding,
  Repository,
  ResearchNote,
  Role,
  RetrievalQueryLog,
  RoadmapItem,
  Session,
  RoutingRule,
  Task,
  TaskRun,
  User,
  UserRole,
  VerificationResult,
  VerificationStep
} from "@cp/domain";

export interface DatabaseTables {
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
  embedding_jobs: EmbeddingJob;
  retrieval_query_logs: RetrievalQueryLog;
  research_notes: ResearchNote;
  policies: Policy;
  prompt_versions: PromptVersion;
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
  project_role_bindings: ProjectRoleBinding;
  repository_role_bindings: RepositoryRoleBinding;
  delegated_permissions: DelegatedPermission;
  oidc_auth_states: OidcAuthState;
}

export type TableName = keyof DatabaseTables;
