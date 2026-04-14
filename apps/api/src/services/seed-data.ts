import {
  approvalStatuses,
  type AuditEvent,
  type Approval,
  type Artifact,
  type AutoResearchExperiment,
  type AutoResearchRun,
  type ChatMessage,
  type ChatThread,
  type DelegatedPermission,
  type MemoryChunk,
  type MemoryEntry,
  type OidcAuthState,
  type Policy,
  type Project,
  type ProjectProviderBinding,
  type ProjectRoleBinding,
  type ProviderCapability,
  type ProviderConfig,
  type ProviderHealthcheck,
  type ProviderModel,
  type RepositoryRoleBinding,
  type Repository,
  type Role,
  type RetrievalQueryLog,
  type ResearchNote,
  type RoutingRule,
  type RoadmapItem,
  type Session,
  type Skill,
  type Task,
  type TaskRun,
  type User,
  type UserRole,
  type VerificationResult,
  type VerificationStep
} from "@cp/domain";
import type { ApiSeedData, RunEvent } from "../types/api.js";

const now = "2026-04-14T12:00:00.000Z";

const project: Project = {
  id: "proj_001",
  key: "control-plane",
  name: "AI Control Plane",
  description: "Centralized multi-agent development platform",
  status: "active",
  policySetId: "policyset_001",
  createdAt: now,
  createdBy: "system",
  updatedAt: now,
  updatedBy: "system"
};

const repository: Repository = {
  id: "repo_001",
  name: "control-plane",
  url: "git@github.com:example/control-plane.git",
  vcsProvider: "github",
  defaultBranch: "main",
  localPath: "/Users/andromeda/devtool",
  status: "active",
  createdAt: now,
  createdBy: "system",
  updatedAt: now,
  updatedBy: "system"
};

const roadmapItem: RoadmapItem = {
  id: "roadmap_001",
  projectId: project.id,
  title: "Bootstrap API control plane",
  description: "Create Fastify backend, structured routes, and deterministic service stubs.",
  state: "approved",
  priority: 90,
  orderIndex: 1,
  createdAt: now,
  createdBy: "planner",
  updatedAt: now,
  updatedBy: "planner"
};

const task: Task = {
  id: "task_001",
  projectId: project.id,
  roadmapItemId: roadmapItem.id,
  title: "Implement API scaffold",
  type: "feature",
  state: "approved",
  goal: "Expose core control-plane routes through Fastify",
  scopeInclude: ["/projects", "/repositories", "/roadmap", "/tasks", "/runs", "/providers"],
  scopeExclude: ["persistence", "auth"],
  constraints: ["deterministic responses", "structured payloads"],
  targetRepositoryIds: [repository.id],
  successCriteria: ["routes register", "healthcheck passes", "swagger available"],
  verificationPlan: ["lint", "test", "build"],
  dependencyTaskIds: [],
  riskNotes: ["No real persistence in v1"],
  budget: { maxRetries: 2 },
  approvalsRequired: true,
  createdAt: now,
  createdBy: "planner",
  updatedAt: now,
  updatedBy: "planner"
};

const run: TaskRun = {
  id: "run_001",
  taskId: task.id,
  workflowId: "task_execute",
  status: "running",
  startedAt: now,
  retryCount: 0,
  costProxyInputTokens: 320,
  costProxyOutputTokens: 120,
  reposTouched: [repository.id],
  createdAt: now,
  createdBy: "orchestrator",
  updatedAt: now,
  updatedBy: "orchestrator"
};

const approval: Approval = {
  id: "approval_001",
  subjectType: "task",
  subjectId: task.id,
  status: approvalStatuses[0],
  requestedBy: "planner",
  reason: "Task requires approval before execution",
  createdAt: now,
  createdBy: "planner",
  updatedAt: now,
  updatedBy: "planner"
};

const artifact: Artifact = {
  id: "artifact_001",
  runId: run.id,
  taskId: task.id,
  type: "context_packet",
  schemaVersion: "1.0.0",
  uri: "mem://artifact_001",
  summary: "Compact context packet for API scaffold",
  createdAt: now,
  createdBy: "retrieval",
  updatedAt: now,
  updatedBy: "retrieval"
};

const verificationResult: VerificationResult = {
  id: "vr_001",
  runId: run.id,
  taskId: task.id,
  overallStatus: "partial",
  score: 0.5,
  summary: "Verification has not run yet",
  createdAt: now,
  createdBy: "verifier",
  updatedAt: now,
  updatedBy: "verifier"
};

const verificationStep: VerificationStep = {
  id: "vs_001",
  verificationResultId: verificationResult.id,
  runId: run.id,
  stepType: "lint",
  command: "pnpm lint",
  status: "skipped",
  createdAt: now,
  createdBy: "verifier",
  updatedAt: now,
  updatedBy: "verifier"
};

const memoryEntry: MemoryEntry = {
  id: "mem_001",
  projectId: project.id,
  repositoryId: repository.id,
  taskId: task.id,
  category: "project_overview",
  title: "Control plane overview",
  body: "This project coordinates agents, memory, provider routing, and verification through structured artifacts.",
  priority: 100,
  pinned: true,
  freshnessTtlHours: 168,
  sourceRef: "docs/architecture.md",
  sourceHash: "sha256:demo",
  isStale: false,
  createdAt: now,
  createdBy: "system",
  updatedAt: now,
  updatedBy: "system"
};

const memoryChunk: MemoryChunk = {
  id: "chunk_001",
  memoryEntryId: memoryEntry.id,
  projectId: project.id,
  repositoryId: repository.id,
  category: memoryEntry.category,
  chunkIndex: 0,
  chunkText: memoryEntry.body,
  chunkTitle: memoryEntry.title,
  tokenEstimate: 22,
  metadata: { sourceRef: memoryEntry.sourceRef ?? "", pinned: true },
  embeddingRef: "emb_001",
  createdAt: now,
  createdBy: "system",
  updatedAt: now,
  updatedBy: "system"
};

const retrievalLog: RetrievalQueryLog = {
  id: "retrieval_001",
  projectId: project.id,
  taskRunId: run.id,
  role: "planner",
  queryText: "bootstrap api route scaffold",
  topK: 3,
  filters: { projectId: project.id, categories: ["project_overview"] },
  returnedChunkIds: [memoryChunk.id],
  tokenEstimate: 24,
  createdAt: now,
  createdBy: "retrieval",
  updatedAt: now,
  updatedBy: "retrieval"
};

const researchNote: ResearchNote = {
  id: "research_001",
  projectId: project.id,
  taskId: task.id,
  title: "Fastify route structure",
  question: "How should route plugins be organized?",
  summary: "Use modular plugins per resource and a shared app factory.",
  sourceList: [{ title: "Fastify docs", url: "https://fastify.dev" }],
  breakingChangeRisk: "low",
  caveats: ["Avoid custom decorators until the DB layer exists"],
  createdAt: now,
  createdBy: "gemini_researcher",
  updatedAt: now,
  updatedBy: "gemini_researcher"
};

const policy: Policy = {
  id: "policy_001",
  projectId: project.id,
  type: "routing",
  scope: "project",
  activeVersion: "v1",
  jsonRules: { defaultProvider: "openai", fallbackProviders: ["anthropic", "gemini"] },
  createdAt: now,
  createdBy: "system",
  updatedAt: now,
  updatedBy: "system"
};

const routingRule: RoutingRule = {
  id: "route_001",
  projectId: project.id,
  role: "codex_builder",
  capability: "coding",
  precedence: 1,
  conditions: { taskType: "feature" },
  fallbackChain: ["anthropic", "openrouter"],
  enabled: true,
  createdAt: now,
  createdBy: "system",
  updatedAt: now,
  updatedBy: "system"
};

const chatThread: ChatThread = {
  id: "thread_001",
  projectId: project.id,
  contextType: "project",
  status: "open",
  title: "Control plane command center",
  createdAt: now,
  createdBy: "user",
  updatedAt: now,
  updatedBy: "user"
};

const chatMessage: ChatMessage = {
  id: "msg_001",
  threadId: chatThread.id,
  role: "user",
  content: "Add the API scaffold and route shell.",
  structuredIntent: { action: "create_task", projectId: project.id },
  createdAt: now,
  createdBy: "user",
  updatedAt: now,
  updatedBy: "user"
};

const providerConfig: ProviderConfig = {
  id: "provider_001",
  provider: "openai",
  endpoint: "https://api.openai.com/v1",
  authRef: "secret://openai/api-key",
  enabled: true,
  timeoutMs: 30000,
  metadata: { defaultFor: ["chat_reasoning", "embedding"] },
  createdAt: now,
  createdBy: "system",
  updatedAt: now,
  updatedBy: "system"
};

const providerCapability: ProviderCapability = {
  id: "pc_001",
  providerConfigId: providerConfig.id,
  capabilityClass: "chat_reasoning",
  supported: true,
  notes: "Primary reasoning provider",
  createdAt: now,
  createdBy: "system",
  updatedAt: now,
  updatedBy: "system"
};

const providerModel: ProviderModel = {
  id: "model_001",
  providerConfigId: providerConfig.id,
  modelId: "gpt-4.1",
  capabilityClass: "chat_reasoning",
  contextWindow: 128000,
  maxOutputTokens: 8192,
  pricingMeta: { input: 1.0, output: 3.0 },
  enabled: true,
  createdAt: now,
  createdBy: "system",
  updatedAt: now,
  updatedBy: "system"
};

const providerBinding: ProjectProviderBinding = {
  id: "binding_001",
  projectId: project.id,
  role: "codex_builder",
  capabilityClass: "coding",
  primaryModelId: providerModel.id,
  fallbackModelIds: [providerModel.id],
  enabled: true,
  createdAt: now,
  createdBy: "system",
  updatedAt: now,
  updatedBy: "system"
};

const providerHealthcheck: ProviderHealthcheck = {
  id: "health_001",
  providerConfigId: providerConfig.id,
  modelId: providerModel.id,
  status: "healthy",
  latencyMs: 245,
  errorRate: 0.001,
  details: "Synthetic check passed",
  checkedAt: now,
  createdAt: now,
  createdBy: "system",
  updatedAt: now,
  updatedBy: "system"
};

const experiment: AutoResearchExperiment = {
  id: "exp_001",
  projectId: project.id,
  targetType: "planner_prompt",
  status: "draft",
  metricSet: ["first_pass_success_rate", "avg_time_to_verification"],
  baselineVersionRef: "planner@v1",
  createdAt: now,
  createdBy: "system",
  updatedAt: now,
  updatedBy: "system"
};

const experimentRun: AutoResearchRun = {
  id: "exprun_001",
  experimentId: experiment.id,
  variantId: "planner_prompt_v2",
  status: "completed",
  metrics: { first_pass_success_rate: 0.64, avg_time_to_verification: 92 },
  winnerFlag: false,
  rollbackFlag: false,
  createdAt: now,
  createdBy: "system",
  updatedAt: now,
  updatedBy: "system"
};

const adminRole: Role = {
  id: "role_admin",
  name: "admin",
  description: "Full control over control-plane operations",
  permissions: ["*"],
  isSystem: true,
  createdAt: now,
  createdBy: "system",
  updatedAt: now,
  updatedBy: "system"
};

const operatorRole: Role = {
  id: "role_operator",
  name: "operator",
  description: "Operational role for day-to-day management",
  permissions: [
    "project.read",
    "project.write",
    "repository.read",
    "repository.write",
    "roadmap.read",
    "roadmap.write",
    "task.read",
    "task.write",
    "approval.read",
    "approval.decide",
    "provider.read",
    "experiment.read",
    "experiment.write",
    "chat.read",
    "chat.write"
  ],
  isSystem: true,
  createdAt: now,
  createdBy: "system",
  updatedAt: now,
  updatedBy: "system"
};

const editorRole: Role = {
  id: "role_editor",
  name: "editor",
  description: "Editor role for project and task modifications",
  permissions: [
    "project.read",
    "project.write",
    "repository.read",
    "roadmap.read",
    "roadmap.write",
    "task.read",
    "task.write",
    "approval.read",
    "memory.read",
    "memory.write",
    "experiment.read",
    "chat.read",
    "chat.write"
  ],
  isSystem: true,
  createdAt: now,
  createdBy: "system",
  updatedAt: now,
  updatedBy: "system"
};

const viewerRole: Role = {
  id: "role_viewer",
  name: "viewer",
  description: "Read-only access",
  permissions: [
    "project.read",
    "repository.read",
    "roadmap.read",
    "task.read",
    "approval.read",
    "provider.read",
    "experiment.read",
    "chat.read"
  ],
  isSystem: true,
  createdAt: now,
  createdBy: "system",
  updatedAt: now,
  updatedBy: "system"
};

const adminUser: User = {
  id: "user_admin_001",
  email: "admin@control-plane.local",
  displayName: "Control Plane Admin",
  status: "active",
  passwordHash:
    "scrypt$a4f1e8b7c2d4f6a8910b1c2d3e4f5a6b$c12161475cba853323a878ed0ba69929659945893e5f1f7ec87a2676be881c6585c0d828fe9aa3f9e8831b588b25d8b6b36c858596c85c080622d4d940f9f635",
  createdAt: now,
  createdBy: "system",
  updatedAt: now,
  updatedBy: "system"
};

const viewerUser: User = {
  id: "user_viewer_001",
  email: "viewer@control-plane.local",
  displayName: "Control Plane Viewer",
  status: "active",
  passwordHash:
    "scrypt$b5e2f9c8d3a7e1f4021b2c3d4e5f6a7b$e8aee88110adb83fa01dc4ad1d599b57d3cea28da45f87a906e2048da88d17c9f2b23786d8c130f7eb340f9a0cd066765cc54461832325d304266fecaf7e79f9",
  createdAt: now,
  createdBy: "system",
  updatedAt: now,
  updatedBy: "system"
};

const adminUserRole: UserRole = {
  id: "user_role_admin_001",
  userId: adminUser.id,
  roleId: adminRole.id,
  createdAt: now,
  createdBy: "system",
  updatedAt: now,
  updatedBy: "system"
};

const viewerUserRole: UserRole = {
  id: "user_role_viewer_001",
  userId: viewerUser.id,
  roleId: viewerRole.id,
  createdAt: now,
  createdBy: "system",
  updatedAt: now,
  updatedBy: "system"
};

const scopedProjectRoleBinding: ProjectRoleBinding = {
  id: "prb_001",
  userId: viewerUser.id,
  projectId: project.id,
  roleId: editorRole.id,
  createdAt: now,
  createdBy: "system",
  updatedAt: now,
  updatedBy: "system"
};

const scopedRepositoryRoleBinding: RepositoryRoleBinding = {
  id: "rrb_001",
  userId: viewerUser.id,
  repositoryId: repository.id,
  roleId: viewerRole.id,
  createdAt: now,
  createdBy: "system",
  updatedAt: now,
  updatedBy: "system"
};

const delegatedPermission: DelegatedPermission = {
  id: "del_001",
  grantedByUserId: adminUser.id,
  granteeUserId: viewerUser.id,
  permission: "memory.read",
  scopeType: "project",
  scopeId: project.id,
  expiresAt: "2026-12-31T23:59:59.000Z",
  createdAt: now,
  createdBy: adminUser.id,
  updatedAt: now,
  updatedBy: adminUser.id
};

const oidcAuthState: OidcAuthState = {
  id: "oidc_state_seed_001",
  provider: "oidc",
  state: "seed_state",
  nonce: "seed_nonce",
  codeVerifier: "seed_verifier",
  redirectUri: "http://localhost:5173/auth/oidc/callback",
  expiresAt: "2026-12-31T23:59:59.000Z",
  consumedAt: "2026-01-01T00:00:00.000Z",
  createdAt: now,
  createdBy: "system",
  updatedAt: now,
  updatedBy: "system"
};

const auditEvent: AuditEvent = {
  id: "audit_001",
  userId: adminUser.id,
  action: "seed.bootstrap",
  resourceType: "project",
  resourceId: project.id,
  status: "success",
  occurredAt: now,
  metadata: { source: "seed-data" },
  createdAt: now,
  createdBy: "system",
  updatedAt: now,
  updatedBy: "system"
};

const seededSession: Session = {
  id: "session_seed_001",
  userId: adminUser.id,
  tokenHash: "seeded_session_hash_placeholder",
  expiresAt: "2026-12-31T23:59:59.000Z",
  revokedAt: "2026-01-01T00:00:00.000Z",
  createdAt: now,
  createdBy: "system",
  updatedAt: now,
  updatedBy: "system"
};

const installedSkill: Skill = {
  id: "skill_001",
  name: "checks",
  description: "Verification and quality check helpers for code changes.",
  repositoryUrl: "https://github.com/example/skills-checks",
  version: "1.0.0",
  installed: true,
  categories: ["quality", "verification"],
  instructions: "Run repository checks before finalizing changes and summarize failures with remediation hints.",
  createdAt: now,
  createdBy: "system",
  updatedAt: now,
  updatedBy: "system"
};

const availableSkill: Skill = {
  id: "skill_002",
  name: "release-notes",
  description: "Generate structured release notes from merged changes.",
  repositoryUrl: "https://github.com/example/skills-release-notes",
  version: "0.9.0",
  installed: false,
  categories: ["documentation", "release"],
  instructions: "Collect PR metadata and produce concise release notes grouped by feature area.",
  createdAt: now,
  createdBy: "system",
  updatedAt: now,
  updatedBy: "system"
};

export const seedData: ApiSeedData = {
  projects: [project],
  repositories: [repository],
  roadmap: [roadmapItem],
  tasks: [task],
  runs: [run],
  approvals: [approval],
  artifacts: [artifact],
  verificationResults: [verificationResult],
  verificationSteps: [verificationStep],
  memoryEntries: [memoryEntry],
  memoryChunks: [memoryChunk],
  retrievalLogs: [retrievalLog],
  researchNotes: [researchNote],
  policies: [policy],
  routingRules: [routingRule],
  chatThreads: [chatThread],
  chatMessages: [chatMessage],
  providerConfigs: [providerConfig],
  providerCapabilities: [providerCapability],
  providerModels: [providerModel],
  providerBindings: [providerBinding],
  providerHealthchecks: [providerHealthcheck],
  experiments: [experiment],
  experimentRuns: [experimentRun],
  users: [adminUser, viewerUser],
  roles: [adminRole, editorRole, operatorRole, viewerRole],
  userRoles: [adminUserRole, viewerUserRole],
  sessions: [seededSession],
  auditEvents: [auditEvent],
  projectRoleBindings: [scopedProjectRoleBinding],
  repositoryRoleBindings: [scopedRepositoryRoleBinding],
  delegatedPermissions: [delegatedPermission],
  oidcAuthStates: [oidcAuthState],
  skills: [installedSkill, availableSkill]
};

export const runEventsByRunId: Record<string, RunEvent[]> = {
  [run.id]: [
    { runId: run.id, type: "queued", message: "Task queued for execution", timestamp: now },
    { runId: run.id, type: "started", message: "Run started", timestamp: now },
    {
      runId: run.id,
      type: "step",
      message: "Planner context packet assembled",
      timestamp: now,
      payload: { artifactId: artifact.id }
    },
    {
      runId: run.id,
      type: "verification",
      message: "Verification pending",
      timestamp: now,
      payload: { resultId: verificationResult.id }
    }
  ]
};
