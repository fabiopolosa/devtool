import type {
  AgentConfig,
  AuditEvent,
  Approval,
  Artifact,
  ChatMessage,
  ChatThread,
  DelegatedPermission,
  MemoryChunk,
  MemoryEntry,
  OidcAuthState,
  ProviderCapability,
  ProviderConfig,
  ProviderHealthcheck,
  ProviderModel,
  Project,
  ProjectProviderBinding,
  ProjectRoleBinding,
  Repository,
  RepositoryRoleBinding,
  Role,
  RetrievalQueryLog,
  RoadmapItem,
  Session,
  Skill,
  Task,
  TaskRun,
  User,
  UserRole,
  VerificationResult,
  VerificationStep,
  AutoResearchExperiment,
  AutoResearchRun,
  ResearchNote,
  RoutingRule,
  Policy
} from "@cp/domain";

export interface ApiSeedData {
  agents: AgentConfig[];
  projects: Project[];
  repositories: Repository[];
  roadmap: RoadmapItem[];
  tasks: Task[];
  runs: TaskRun[];
  approvals: Approval[];
  artifacts: Artifact[];
  verificationResults: VerificationResult[];
  verificationSteps: VerificationStep[];
  memoryEntries: MemoryEntry[];
  memoryChunks: MemoryChunk[];
  retrievalLogs: RetrievalQueryLog[];
  researchNotes: ResearchNote[];
  policies: Policy[];
  routingRules: RoutingRule[];
  chatThreads: ChatThread[];
  chatMessages: ChatMessage[];
  providerConfigs: ProviderConfig[];
  providerCapabilities: ProviderCapability[];
  providerModels: ProviderModel[];
  providerBindings: ProjectProviderBinding[];
  providerHealthchecks: ProviderHealthcheck[];
  experiments: AutoResearchExperiment[];
  experimentRuns: AutoResearchRun[];
  users: User[];
  roles: Role[];
  userRoles: UserRole[];
  sessions: Session[];
  auditEvents: AuditEvent[];
  projectRoleBindings: ProjectRoleBinding[];
  repositoryRoleBindings: RepositoryRoleBinding[];
  delegatedPermissions: DelegatedPermission[];
  oidcAuthStates: OidcAuthState[];
  skills: Skill[];
}

export interface RunEvent {
  runId: string;
  type: "queued" | "started" | "step" | "verification" | "complete" | "failed";
  message: string;
  timestamp: string;
  payload?: Record<string, unknown>;
}

export interface RouteListResponse<T> {
  items: T[];
}

export interface RouteDetailResponse<T> {
  item: T | null;
}

export interface OperationResponse {
  ok: true;
  message: string;
}
