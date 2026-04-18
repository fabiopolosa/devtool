import type { AgentRoleName, CapabilityClass, ProviderName } from "./capabilities.js";
import type {
  ApprovalStatus,
  HealthStatus,
  ProjectStatus,
  RbacRoleName,
  RepositoryStatus,
  RoadmapState,
  TaskRunStatus,
  TaskState,
  UserStatus,
  VerificationStatus
} from "./lifecycle.js";
export type { ContextNote } from "./entities/context-note.js";

export type ID = string;
export type Timestamp = string;

export interface AuditMetadata {
  createdAt: Timestamp;
  createdBy: string;
  updatedAt: Timestamp;
  updatedBy: string;
}

export interface Project extends AuditMetadata {
  id: ID;
  tenantId: ID;
  key: string;
  name: string;
  description?: string;
  status: ProjectStatus;
  policySetId?: ID;
}

export interface Repository extends AuditMetadata {
  id: ID;
  tenantId: ID;
  name: string;
  url: string;
  vcsProvider: "github" | "gitlab" | "bitbucket" | "other";
  defaultBranch: string;
  localPath?: string;
  status: RepositoryStatus;
}

export interface ProjectRepositoryLink extends AuditMetadata {
  id: ID;
  tenantId: ID;
  projectId: ID;
  repositoryId: ID;
  role: "primary" | "secondary" | "shared";
  rulesRef?: string;
}

export interface AgentRole extends AuditMetadata {
  id: ID;
  name: AgentRoleName;
  promptVersionId: ID;
  capabilityNeeds: CapabilityClass[];
  description: string;
}

export interface RoadmapItem extends AuditMetadata {
  id: ID;
  tenantId: ID;
  projectId: ID;
  title: string;
  description: string;
  state: RoadmapState;
  priority: number;
  orderIndex: number;
  parentId?: ID;
  convertedTaskId?: ID;
}

export interface TaskBudget {
  maxInputTokens?: number;
  maxOutputTokens?: number;
  maxLatencyMs?: number;
  maxCostUsd?: number;
  maxRetries: number;
}

export interface Task extends AuditMetadata {
  id: ID;
  tenantId: ID;
  projectId: ID;
  roadmapItemId?: ID;
  title: string;
  type: "feature" | "bugfix" | "refactor" | "research" | "ops";
  state: TaskState;
  goal: string;
  scopeInclude: string[];
  scopeExclude: string[];
  constraints: string[];
  targetRepositoryIds: ID[];
  successCriteria: string[];
  verificationPlan: string[];
  dependencyTaskIds: ID[];
  riskNotes: string[];
  budget: TaskBudget;
  approvalsRequired: boolean;
}

export interface TaskRun extends AuditMetadata {
  id: ID;
  tenantId: ID;
  taskId: ID;
  workflowId: string;
  status: TaskRunStatus;
  startedAt?: Timestamp;
  endedAt?: Timestamp;
  retryCount: number;
  costProxyInputTokens: number;
  costProxyOutputTokens: number;
  reposTouched: ID[];
}

export interface Artifact extends AuditMetadata {
  id: ID;
  tenantId: ID;
  runId: ID;
  taskId: ID;
  type:
    | "planner_output"
    | "handoff"
    | "verification_log"
    | "patch_summary"
    | "research_note"
    | "execution_event"
    | "context_packet";
  schemaVersion: string;
  uri: string;
  summary: string;
}

export interface VerificationResult extends AuditMetadata {
  id: ID;
  runId: ID;
  taskId: ID;
  overallStatus: VerificationStatus;
  score?: number;
  summary: string;
}

export interface VerificationStep extends AuditMetadata {
  id: ID;
  verificationResultId: ID;
  runId: ID;
  stepType: "lint" | "test" | "build" | "smoke" | "visual" | "performance";
  command: string;
  status: VerificationStatus;
  exitCode?: number;
  durationMs?: number;
  outputUri?: string;
}

export type MemoryCategory =
  | "project_overview"
  | "architecture_note"
  | "adr"
  | "roadmap_note"
  | "task_summary"
  | "error_report"
  | "research_note"
  | "coding_standard"
  | "repo_local_instruction"
  | "prompt_policy_note"
  | "run_summary";

export interface MemoryEntry extends AuditMetadata {
  id: ID;
  projectId: ID;
  repositoryId?: ID;
  taskId?: ID;
  category: MemoryCategory;
  title: string;
  body: string;
  priority: number;
  pinned: boolean;
  freshnessTtlHours?: number;
  sourceRef?: string;
  sourceHash?: string;
  isStale: boolean;
}

export interface MemoryChunk extends AuditMetadata {
  id: ID;
  memoryEntryId: ID;
  projectId: ID;
  repositoryId?: ID;
  category: MemoryCategory;
  chunkIndex: number;
  chunkText: string;
  chunkTitle: string;
  tokenEstimate: number;
  metadata: Record<string, unknown>;
  embeddingRef?: string;
}

export type KnowledgeScope = "system" | "tenant" | "project";

export interface KnowledgeNode extends AuditMetadata {
  id: ID;
  tenantId?: ID;
  projectId?: ID;
  scope: KnowledgeScope;
  path: string;
  content: string;
  embedding?: number[];
}

export interface KnowledgeConfig extends AuditMetadata {
  id: ID;
  tenantId: ID;
  projectId?: ID;
  scope: KnowledgeScope;
  autoCapture: boolean;
  captureModes: string[];
  requireApproval: boolean;
  maxNodes: number;
  relevanceThreshold: number;
  versioning: boolean;
  requireReview: boolean;
}

export interface EmbeddingJob extends AuditMetadata {
  id: ID;
  sourceType: "memory_entry" | "roadmap_item" | "task" | "research_note" | "repo_summary";
  sourceId: ID;
  projectId: ID;
  status: "queued" | "running" | "completed" | "failed";
  batchSize: number;
  embeddingModel: string;
  errorMessage?: string;
}

export interface RetrievalQueryLog extends AuditMetadata {
  id: ID;
  projectId: ID;
  taskRunId?: ID;
  role: AgentRoleName;
  queryText: string;
  topK: number;
  filters: Record<string, unknown>;
  returnedChunkIds: ID[];
  tokenEstimate: number;
}

export interface ResearchNote extends AuditMetadata {
  id: ID;
  projectId: ID;
  taskId?: ID;
  title: string;
  question: string;
  summary: string;
  sourceList: { title: string; url: string }[];
  breakingChangeRisk: "low" | "medium" | "high";
  caveats: string[];
}

export * from "./entities/prompt.js";

export interface Policy extends AuditMetadata {
  id: ID;
  projectId?: ID;
  type: "routing" | "budget" | "approval" | "escalation" | "memory_sharing";
  scope: "global" | "project" | "repository";
  activeVersion: string;
  jsonRules: Record<string, unknown>;
}

export interface PromptVersion extends AuditMetadata {
  id: ID;
  role: AgentRoleName;
  version: string;
  contentRef: string;
  changelog: string;
  promoted: boolean;
}

export interface RoutingRule extends AuditMetadata {
  id: ID;
  projectId?: ID;
  role: AgentRoleName;
  capability: CapabilityClass;
  precedence: number;
  conditions: Record<string, unknown>;
  fallbackChain: string[];
  enabled: boolean;
}

export interface AutoResearchExperiment extends AuditMetadata {
  id: ID;
  projectId?: ID;
  targetType:
    | "planner_prompt"
    | "routing_rule"
    | "retry_policy"
    | "budget_policy"
    | "context_packet_format"
    | "invocation_order";
  status: "draft" | "running" | "completed" | "rolled_back";
  metricSet: string[];
  baselineVersionRef: string;
}

export interface AutoResearchRun extends AuditMetadata {
  id: ID;
  experimentId: ID;
  variantId: string;
  status: "running" | "completed" | "failed";
  metrics: Record<string, number>;
  winnerFlag: boolean;
  rollbackFlag: boolean;
}

export interface Approval extends AuditMetadata {
  id: ID;
  tenantId: ID;
  subjectType: "roadmap_item" | "task" | "task_run" | "policy_change";
  subjectId: ID;
  status: ApprovalStatus;
  requestedBy: string;
  decidedBy?: string;
  reason?: string;
  decidedAt?: Timestamp;
}

export interface ChatThread extends AuditMetadata {
  id: ID;
  projectId?: ID;
  contextType: "global" | "project" | "task";
  status: "open" | "closed";
  title?: string;
}

export interface ChatMessage extends AuditMetadata {
  id: ID;
  threadId: ID;
  role: "user" | "assistant" | "system";
  content: string;
  structuredIntent?: Record<string, unknown>;
}

export interface ProviderConfig extends AuditMetadata {
  id: ID;
  tenantId?: ID;
  provider: ProviderName;
  providerId?: ProviderName;
  apiKey?: string;
  apiKeyMasked?: string;
  endpoint?: string;
  authRef: string;
  secretRef?: string;
  enabled: boolean;
  timeoutMs: number;
  validationStatus?: "valid" | "invalid" | "unknown";
  lastValidatedAt?: Timestamp;
  validationError?: string;
  requestsPerMinute?: number;
  tokensPerMinute?: number;
  metadata: Record<string, unknown>;
}

export interface ProviderCapability extends AuditMetadata {
  id: ID;
  providerConfigId: ID;
  capabilityClass: CapabilityClass;
  supported: boolean;
  notes?: string;
}

export interface ProviderModel extends AuditMetadata {
  id: ID;
  providerConfigId: ID;
  modelId: string;
  capabilityClass: CapabilityClass;
  contextWindow?: number;
  maxOutputTokens?: number;
  pricingMeta?: Record<string, number>;
  enabled: boolean;
}

export interface ProjectProviderBinding extends AuditMetadata {
  id: ID;
  projectId: ID;
  role?: AgentRoleName;
  capabilityClass: CapabilityClass;
  primaryModelId: ID;
  fallbackModelIds: ID[];
  enabled: boolean;
}

export interface ProviderHealthcheck extends AuditMetadata {
  id: ID;
  providerConfigId: ID;
  modelId?: ID;
  status: HealthStatus;
  latencyMs?: number;
  errorRate?: number;
  details?: string;
  checkedAt: Timestamp;
}

export interface ModelRoutingPreference extends AuditMetadata {
  id: ID;
  projectId: ID;
  capabilityClass: CapabilityClass;
  costWeight: number;
  latencyWeight: number;
  qualityWeight: number;
}

export interface User extends AuditMetadata {
  id: ID;
  email: string;
  displayName: string;
  status: UserStatus;
  passwordHash: string;
  lastLoginAt?: Timestamp;
}

export interface Role extends AuditMetadata {
  id: ID;
  name: RbacRoleName;
  description: string;
  permissions: string[];
  isSystem: boolean;
}

export interface UserRole extends AuditMetadata {
  id: ID;
  userId: ID;
  roleId: ID;
}

export interface Session extends AuditMetadata {
  id: ID;
  userId: ID;
  tokenHash: string;
  expiresAt: Timestamp;
  revokedAt?: Timestamp;
  refreshTokenHash?: string;
  refreshExpiresAt?: Timestamp;
  refreshRevokedAt?: Timestamp;
  ipAddress?: string;
  userAgent?: string;
}

export interface AuditEvent extends AuditMetadata {
  id: ID;
  tenantId?: ID;
  projectId?: ID;
  jobId?: ID;
  userId?: ID;
  action: string;
  resourceType: string;
  resourceId?: ID;
  status: "success" | "failure";
  occurredAt: Timestamp;
  metadata: Record<string, unknown>;
}

export interface ProjectRoleBinding extends AuditMetadata {
  id: ID;
  userId: ID;
  projectId: ID;
  roleId: ID;
  expiresAt?: Timestamp;
}

export interface RepositoryRoleBinding extends AuditMetadata {
  id: ID;
  userId: ID;
  repositoryId: ID;
  roleId: ID;
  expiresAt?: Timestamp;
}

export interface DelegatedPermission extends AuditMetadata {
  id: ID;
  grantedByUserId: ID;
  granteeUserId: ID;
  permission: string;
  scopeType: "global" | "project" | "repository";
  scopeId?: ID;
  expiresAt: Timestamp;
  revokedAt?: Timestamp;
}

export interface OidcAuthState extends AuditMetadata {
  id: ID;
  provider: "oidc";
  state: string;
  nonce: string;
  codeVerifier: string;
  redirectUri: string;
  expiresAt: Timestamp;
  consumedAt?: Timestamp;
  ipAddress?: string;
  userAgent?: string;
}

export type { AgentConfig, AgentConfigStatus, AgentRuntimeAdapterType } from "./entities/agent.js";
export type { UsageEvent } from "./entities/usage-event.js";
export type { SecretConfig, SecretScope } from "./entities/secret.js";
export type {
  SchemaDoc,
  SchemaDocColumn,
  SchemaDocConvention,
  SchemaDocTable
} from "./entities/schema-doc.js";
export type { Environment, EnvironmentStatus, Machine, MachineStatus } from "./entities/environment.js";
export type {
  HeartbeatIntervalPreset,
  HeartbeatPolicy,
  HeartbeatTriggerPreset
} from "./entities/heartbeat-policy.js";
export { buildHeartbeatPolicy } from "./entities/heartbeat-policy.js";
export type {
  AgentLaunchMode,
  AgentRuntimeHost,
  AgentRuntimeKind,
  AgentRuntimeProfile,
  AgentRuntimeVendor
} from "./entities/runtime-profile.js";
export {
  agentRuntimeAdapterTypeToRuntimeKindMap,
  buildAgentRuntimeProfile,
  resolveAgentRuntimeKind
} from "./entities/runtime-profile.js";
export type { ProjectRuntimeProfile } from "./entities/project-runtime-profile.js";
export { buildProjectRuntimeProfile } from "./entities/project-runtime-profile.js";
export type { Workspace, WorkspaceMode, WorkspaceRuntimeStatus } from "./entities/workspace.js";
export type { LocalRepository, LocalRepositoryStatus } from "./entities/local-repository.js";
export type {
  VersionSnapshot,
  VersionSnapshotFile,
  VersionSnapshotTrigger
} from "./entities/version-snapshot.js";
export type {
  Skill,
  SkillExecutionConfig,
  SkillSandboxProfile,
  SkillScope,
  SkillSourceType,
  SkillValidationStatus,
  SkillVersionRecord
} from "./entities/skill.js";
export type { ProviderDiscoveryLog, ProviderDiscoveryStatus } from "./entities/provider-discovery-log.js";
export type { Subprompt, SubpromptCategory } from "./entities/subprompt.js";
export type { Tenant, TenantPermissions, TenantRole, UserTenant } from "./entities/tenant.js";
export type { Job, JobStatus as JobRecordStatus, JobActionType, JobType } from "./entities/job.js";
export type {
  CodingWorkflow,
  CodingWorkflowDecisionStatus,
  CodingWorkflowPatchProposal,
  CodingWorkflowPlan,
  CodingWorkflowState,
  CodingWorkflowTaskDraft,
  CodingWorkflowTimelineEvent,
  CodingWorkflowTimelineEventType
} from "./entities/coding-workflow.js";
export type {
  BrainstormQuestion,
  BrainstormRoadmapTask,
  BrainstormPlan,
  BrainstormSession,
  BrainstormSessionStatus,
  BrainstormPlanPayload,
  BrainstormPlanLike,
  BrainstormPlanNormalizationOptions
} from "./entities/brainstorm.js";
export { getBrainstormPlanPayload, normalizeBrainstormPlan } from "./entities/brainstorm.js";
export type { McpConnection, McpConnectionStatus, McpDelegationRun } from "./entities/mcp.js";
