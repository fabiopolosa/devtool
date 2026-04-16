import {
  approvalStatuses,
  type AgentConfig,
  type BrainstormPlan,
  type BrainstormSession,
  type AuditEvent,
  type Approval,
  type Artifact,
  type AutoResearchExperiment,
  type AutoResearchRun,
  type ChatMessage,
  type ChatThread,
  type DelegatedPermission,
  type Environment,
  type KnowledgeConfig,
  type LocalRepository,
  type KnowledgeNode,
  type MemoryChunk,
  type MemoryEntry,
  type Machine,
  type McpConnection,
  type McpDelegationRun,
  type OidcAuthState,
  type Policy,
  type Project,
  type ProjectProviderBinding,
  type ProjectRoleBinding,
  type PromptRegistryEntry,
  type SchemaDoc,
  type SecretConfig,
  type ProviderCapability,
  type ProviderConfig,
  type ProviderDiscoveryLog,
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
  type Tenant,
  type UserTenant,
  type Job,
  type Skill,
  type Subprompt,
  type Task,
  type TaskRun,
  type User,
  type UserRole,
  type VersionSnapshot,
  type VerificationResult,
  type VerificationStep
} from "@cp/domain";
import type { ApiSeedData, RunEvent } from "../types/api.js";

const now = "2026-04-14T12:00:00.000Z";
const defaultTenantId = "tenant_default";

const defaultTenant: Tenant = {
  id: defaultTenantId,
  name: "Default Tenant",
  createdAt: now
};

const project: Project = {
  id: "proj_001",
  tenantId: defaultTenantId,
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
  tenantId: defaultTenantId,
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
  tenantId: defaultTenantId,
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
  tenantId: defaultTenantId,
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
  tenantId: defaultTenantId,
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
  tenantId: defaultTenantId,
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
  tenantId: defaultTenantId,
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
  tenantId: defaultTenantId,
  provider: "openai",
  providerId: "openai",
  endpoint: "https://api.openai.com/v1",
  authRef: "env://OPENAI_API_KEY",
  secretRef: "env://OPENAI_API_KEY",
  validationStatus: "unknown",
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

const providerDiscoveryLog: ProviderDiscoveryLog = {
  id: "provider_discovery_log_001",
  source: "startup",
  queries: [
    "2026 most popular AI providers large language models widely used providers",
    "best enterprise LLM providers 2026",
    "top AI model providers 2026 chat coding embeddings"
  ],
  discoveredProviders: ["openai", "anthropic", "gemini", "openrouter", "kie_ai"],
  discoveredModels: ["gpt-4.1", "claude-3.7-sonnet", "gemini-2.0-flash", "openrouter/auto", "kie-vl-1"],
  status: "fallback",
  searchStartedAt: now,
  searchFinishedAt: now,
  notes: "Seeded fallback snapshot before first live discovery run.",
  rawResults: { seeded: true },
  createdAt: now,
  createdBy: "system",
  updatedAt: now,
  updatedBy: "system"
};

const codexBuilderPrompt: PromptRegistryEntry = {
  id: "prompt_role_codex_builder_v1",
  type: "role",
  scope: "system",
  target: "codex_builder",
  version: "v1",
  content:
    "Implement requested changes with strict scope discipline, deterministic verification steps, and concise output.",
  status: "active",
  createdAt: now,
  createdBy: "system",
  updatedAt: now,
  updatedBy: "system"
};

const plannerPrompt: PromptRegistryEntry = {
  id: "prompt_role_planner_v1",
  type: "role",
  scope: "system",
  target: "planner",
  version: "v1",
  content:
    "Produce structured plans with explicit tasks, risks, and acceptance criteria. Keep execution-ready detail.",
  status: "active",
  createdAt: now,
  createdBy: "system",
  updatedAt: now,
  updatedBy: "system"
};

const claudeDebuggerPrompt: PromptRegistryEntry = {
  id: "prompt_role_claude_debugger_v1",
  type: "role",
  scope: "system",
  target: "claude_debugger",
  version: "v1",
  content:
    "Diagnose failures with evidence-first reasoning, propose minimal safe fixes, and include regression checks.",
  status: "active",
  createdAt: now,
  createdBy: "system",
  updatedAt: now,
  updatedBy: "system"
};

const geminiResearcherPrompt: PromptRegistryEntry = {
  id: "prompt_role_gemini_researcher_v1",
  type: "role",
  scope: "system",
  target: "gemini_researcher",
  version: "v1",
  content:
    "Run structured multi-step research, preserve source provenance, and return concise evidence-backed conclusions.",
  status: "active",
  createdAt: now,
  createdBy: "system",
  updatedAt: now,
  updatedBy: "system"
};

const stackSubprompt: Subprompt = {
  id: "subprompt_stack_postgres_prisma",
  title: "Stack: PostgreSQL + Prisma",
  category: "stack",
  summary: "Balanced default stack for maintainable products with relational data and migrations.",
  prompt:
    "Recommend PostgreSQL + Prisma, Node.js TypeScript backend, React TypeScript frontend, and capability-first LLM provider routing with explicit fallback.",
  tags: ["stack", "postgres", "prisma", "typescript"],
  sourcePath: "configs/subprompts/stack-postgres-prisma.json",
  enabled: true
};

const architectureSubprompt: Subprompt = {
  id: "subprompt_arch_monorepo",
  title: "Architecture: Modular Monorepo",
  category: "architecture",
  summary: "Prefer modular monorepo boundaries with additive packages and explicit contracts.",
  prompt:
    "Use a modular monorepo with explicit package contracts, additive migrations, inspectable workflow defs, and capability abstraction for providers.",
  tags: ["architecture", "monorepo", "contracts"],
  sourcePath: "configs/subprompts/architecture-monorepo.json",
  enabled: true
};

const brainstormSession: BrainstormSession = {
  id: "brainstorm_session_001",
  tenantId: defaultTenantId,
  threadId: chatThread.id,
  projectId: project.id,
  status: "planned",
  projectIntent: "Bootstrap an AI development control-plane with provider routing and memory retrieval.",
  selectedSubpromptIds: [stackSubprompt.id, architectureSubprompt.id],
  questions: [
    {
      id: "q_target_users",
      question: "Who are the primary operators of the control-plane?",
      rationale: "Determines UX density, approval strategy, and auth model."
    }
  ],
  answers: {
    q_target_users: "Small internal platform team with one admin and editors."
  },
  planId: "brainstorm_plan_001",
  createdAt: now,
  createdBy: "planner",
  updatedAt: now,
  updatedBy: "planner"
};

const brainstormPlan: BrainstormPlan = {
  id: "brainstorm_plan_001",
  tenantId: defaultTenantId,
  sessionId: brainstormSession.id,
  title: "Initial platform execution plan",
  executiveSummary:
    "Establish a modular monorepo control-plane with additive routes for providers, memory, orchestration, auth, and runtime observability.",
  plan: {
    recommendedStack: {
      database: "PostgreSQL + pgvector",
      backend: "Node.js + Fastify + Zod",
      frontend: "React + TypeScript + Tailwind",
      llmProviders: ["openai", "anthropic", "gemini"],
      vectorStore: "pgvector"
    },
    architecture: {
      repositoryStrategy: "monorepo",
      packageLayout: ["apps/api", "apps/web", "apps/worker", "packages/*"],
      rationale: "Single control-plane workspace with explicit package boundaries and reusable contracts."
    },
    suggestedAgents: [
      { role: "planner", purpose: "Generate structured specs and roadmap", capabilities: ["chat_reasoning"] },
      { role: "codex_builder", purpose: "Implement scoped changes", capabilities: ["coding"] }
    ],
    suggestedSkills: [
      {
        name: "checks",
        repositoryUrl: "https://github.com/example/skills-checks",
        reason: "Keep verification summaries deterministic."
      }
    ],
    providerBindings: [
      {
        capabilityClass: "coding",
        primaryProvider: "openai",
        fallbackProviders: ["anthropic", "openrouter"],
        primaryModelHint: "gpt-4.1"
      }
    ],
    roadmap: [
      {
        id: "bs_task_1",
        title: "Stabilize contracts and schema",
        description: "Freeze domain schemas and additive migrations.",
        dependencies: [],
        targetRepos: [repository.id],
        suggestedAgentRole: "planner",
        suggestedSkills: ["checks"]
      }
    ],
    assumptions: ["Single tenant by default", "Auth enabled selectively via env flag"],
    risks: ["Provider credentials may be missing in local environments"],
    composedPrompt:
      "Seed brainstorm plan generated from stack and architecture subprompts for initial workspace bootstrap.",
    selectedSubprompts: [stackSubprompt, architectureSubprompt]
  },
  createdAt: now,
  createdBy: "planner",
  updatedAt: now,
  updatedBy: "planner"
};

const mcpConnection: McpConnection = {
  id: "mcp_connection_001",
  name: "openclaw-default",
  baseUrl: "http://localhost:7777",
  authSecretRef: "secret://mcp/openclaw-token",
  enabled: false,
  status: "disabled",
  capabilities: ["diagnostics", "auto_config"],
  metadata: { default: true },
  createdAt: now,
  createdBy: "system",
  updatedAt: now,
  updatedBy: "system"
};

const mcpDelegationRun: McpDelegationRun = {
  id: "mcp_run_001",
  connectionId: mcpConnection.id,
  operation: "bootstrap.check",
  payload: { dryRun: true },
  status: "completed",
  response: { ok: true, source: "seed" },
  startedAt: now,
  endedAt: now,
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

const adminUserTenant: UserTenant = {
  id: "user_tenant_admin_001",
  userId: adminUser.id,
  tenantId: defaultTenantId,
  role: "owner",
  createdAt: now
};

const viewerUserTenant: UserTenant = {
  id: "user_tenant_viewer_001",
  userId: viewerUser.id,
  tenantId: defaultTenantId,
  role: "user",
  createdAt: now
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

const secretConfig: SecretConfig = {
  id: "secret_001",
  name: "OPENAI_API_KEY",
  description: "Primary OpenAI API key reference for provider calls",
  encryptedValue: "v1:seeded-demo-ciphertext",
  scope: "provider",
  createdAt: now,
  createdBy: "system",
  updatedAt: now,
  updatedBy: "system"
};

const schemaDoc: SchemaDoc = {
  id: "schema_doc_001",
  title: "Control Plane PostgreSQL schema",
  description: "Normalized schema for control-plane entities and operational modules.",
  databaseName: "devtool",
  dialect: "postgresql",
  tables: [
    {
      tableName: "projects",
      schemaName: "public",
      columns: [
        { name: "id", dataType: "text", nullable: false },
        { name: "name", dataType: "text", nullable: false },
        { name: "status", dataType: "text", nullable: false }
      ],
      primaryKeyColumns: ["id"]
    },
    {
      tableName: "tasks",
      schemaName: "public",
      columns: [
        { name: "id", dataType: "text", nullable: false },
        { name: "project_id", dataType: "text", nullable: false },
        { name: "state", dataType: "text", nullable: false }
      ],
      primaryKeyColumns: ["id"]
    }
  ],
  conventions: [
    { key: "table_naming", value: "snake_case plural" },
    { key: "json_columns", value: "jsonb for structured payloads" }
  ],
  stackNotes: ["TypeScript + Drizzle", "PostgreSQL + pgvector", "Additive migrations only"],
  lastIntrospectedAt: now,
  createdAt: now,
  createdBy: "system",
  updatedAt: now,
  updatedBy: "system"
};

const environment: Environment = {
  id: "env_001",
  name: "Local Development",
  description: "Primary local development environment",
  type: "development",
  region: "eu-central-local",
  baseUrl: "http://localhost:3000",
  status: "active",
  notes: ["Docker compose for Postgres/Redis", "Auth disabled by default"],
  createdAt: now,
  createdBy: "system",
  updatedAt: now,
  updatedBy: "system"
};

const machine: Machine = {
  id: "machine_001",
  environmentId: environment.id,
  name: "andromeda-workstation",
  host: "http://localhost:3000",
  status: "online",
  cpuCores: 12,
  gpuCount: 1,
  ramGb: 32,
  services: ["api", "web", "worker", "postgres", "redis"],
  agents: ["codex-builder-primary"],
  lastHeartbeatAt: now,
  metadata: { os: "macOS", arch: "arm64" },
  createdAt: now,
  createdBy: "system",
  updatedAt: now,
  updatedBy: "system"
};

const localRepository: LocalRepository = {
  id: "local_repo_001",
  name: "devtool",
  rootPath: "/Users/andromeda/devtool",
  description: "Main control-plane monorepo",
  status: "active",
  detectedGit: true,
  currentBranch: "main",
  lastCommitSha: "d912d30",
  indexedFileCount: 1200,
  lastScannedAt: now,
  createdAt: now,
  createdBy: "system",
  updatedAt: now,
  updatedBy: "system"
};

const versionSnapshot: VersionSnapshot = {
  id: "snapshot_001",
  localRepositoryId: localRepository.id,
  taskId: task.id,
  label: "task_start",
  trigger: "task_start",
  files: [
    {
      path: "apps/api/src/app.ts",
      contentHash: "seeded-hash-api-app",
      content: "seeded snapshot content"
    }
  ],
  metadata: { fileCount: 1 },
  createdAt: now,
  createdBy: "system",
  updatedAt: now,
  updatedBy: "system"
};

const systemKnowledgeNode: KnowledgeNode = {
  id: "knowledge_system_001",
  scope: "system",
  path: "/system/architecture/dev-vs-ops-separation.md",
  content: [
    "# Dev vs Ops Separation",
    "",
    "## Principle",
    "Development defines deterministic contracts, operations executes verified pipelines.",
    "",
    "## Decision",
    "Keep orchestration explicit and inspectable through Ruflo workflows and contract-typed artifacts.",
    "",
    "## Implications",
    "- Project navigation is scoped; platform settings stay owner-only.",
    "- Job execution state is persisted and auditable."
  ].join("\n"),
  createdAt: now,
  createdBy: "system",
  updatedAt: now,
  updatedBy: "system"
};

const tenantKnowledgeNode: KnowledgeNode = {
  id: "knowledge_tenant_001",
  tenantId: defaultTenantId,
  scope: "tenant",
  path: `/tenants/${defaultTenantId}/standards/coding-conventions.md`,
  content: [
    "# Coding Conventions",
    "",
    "- Keep APIs additive and backwards-compatible.",
    "- Validate payloads with Zod schemas before persistence.",
    "- Emit structured artifacts for every significant workflow transition."
  ].join("\n"),
  createdAt: now,
  createdBy: "system",
  updatedAt: now,
  updatedBy: "system"
};

const projectKnowledgeNode: KnowledgeNode = {
  id: "knowledge_project_001",
  tenantId: defaultTenantId,
  projectId: project.id,
  scope: "project",
  path: `/projects/${project.id}/decisions/runner-dag-execution.md`,
  content: [
    "# Runner DAG Execution",
    "",
    "## Decision",
    "Use scheduler + executor separation with optimistic claim and retry semantics.",
    "",
    "## Pattern",
    "- Scheduler claims executable jobs ordered by priority.",
    "- Executor performs typed handler dispatch and telemetry emission.",
    "- Failed jobs retry deterministically before terminal error."
  ].join("\n"),
  createdAt: now,
  createdBy: "system",
  updatedAt: now,
  updatedBy: "system"
};

const tenantKnowledgeConfig: KnowledgeConfig = {
  id: "knowledge_cfg_tenant_001",
  tenantId: defaultTenantId,
  scope: "tenant",
  autoCapture: false,
  captureModes: ["generation_output"],
  requireApproval: false,
  maxNodes: 8,
  relevanceThreshold: 0.2,
  versioning: true,
  requireReview: false,
  createdAt: now,
  createdBy: "system",
  updatedAt: now,
  updatedBy: "system"
};

const plannerAgent: AgentConfig = {
  id: "agent_001",
  name: "planner",
  role: "planner",
  icon: "plan",
  description: "Default planning agent for scoped roadmap and task decomposition.",
  adapterType: "mcp_runtime",
  desiredSkills: [],
  runtimeConfig: {
    promptSource: "registry"
  },
  capabilities: ["chat_reasoning"],
  createdAt: now,
  updatedAt: now,
  status: "active"
};

const coderAgent: AgentConfig = {
  id: "agent_002",
  name: "coder",
  role: "codex_builder",
  icon: "code",
  description: "Default coding agent for implementation and patch generation.",
  adapterType: "mcp_runtime",
  desiredSkills: ["checks"],
  reportTo: "planner",
  runtimeConfig: {
    promptSource: "registry"
  },
  capabilities: ["coding"],
  createdAt: now,
  updatedAt: now,
  status: "active"
};

const reviewerAgent: AgentConfig = {
  id: "agent_003",
  name: "reviewer",
  role: "claude_debugger",
  icon: "review",
  description: "Default review agent for diagnostics and regression checks.",
  adapterType: "mcp_runtime",
  desiredSkills: [],
  reportTo: "planner",
  runtimeConfig: {
    promptSource: "registry"
  },
  capabilities: ["chat_reasoning", "coding"],
  createdAt: now,
  updatedAt: now,
  status: "active"
};

const researcherAgent: AgentConfig = {
  id: "agent_004",
  name: "researcher",
  role: "gemini_researcher",
  icon: "research",
  description: "Default research agent for source gathering and synthesis.",
  adapterType: "mcp_runtime",
  desiredSkills: [],
  reportTo: "planner",
  runtimeConfig: {
    promptSource: "registry"
  },
  capabilities: ["chat_reasoning"],
  createdAt: now,
  updatedAt: now,
  status: "active"
};

const brainstormJob: Job = {
  id: "job_brainstorm_seed_001",
  tenantId: defaultTenantId,
  type: "brainstorm",
  title: "Seed brainstorming orchestration",
  status: "done",
  priority: 10,
  retryCount: 0,
  maxRetries: 3,
  actionRequired: false,
  resourceType: "brainstorm",
  resourceId: "plan_001",
  payload: {
    source: "seed"
  },
  dependencies: [],
  dependsOnCount: 0,
  ready: false,
  completedAt: now,
  createdBy: "system",
  createdAt: now,
  updatedAt: now
};

export const seedData: ApiSeedData = {
  secrets: [secretConfig],
  schemaDocs: [schemaDoc],
  environments: [environment],
  machines: [machine],
  localRepositories: [localRepository],
  versionSnapshots: [versionSnapshot],
  agents: [plannerAgent, coderAgent, reviewerAgent, researcherAgent],
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
  knowledgeNodes: [systemKnowledgeNode, tenantKnowledgeNode, projectKnowledgeNode],
  knowledgeConfigs: [tenantKnowledgeConfig],
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
  providerDiscoveryLogs: [providerDiscoveryLog],
  promptRegistry: [codexBuilderPrompt, plannerPrompt, claudeDebuggerPrompt, geminiResearcherPrompt],
  experiments: [experiment],
  experimentRuns: [experimentRun],
  tenants: [defaultTenant],
  users: [adminUser, viewerUser],
  roles: [adminRole, editorRole, operatorRole, viewerRole],
  userRoles: [adminUserRole, viewerUserRole],
  userTenants: [adminUserTenant, viewerUserTenant],
  jobs: [brainstormJob],
  sessions: [seededSession],
  auditEvents: [auditEvent],
  projectRoleBindings: [scopedProjectRoleBinding],
  repositoryRoleBindings: [scopedRepositoryRoleBinding],
  delegatedPermissions: [delegatedPermission],
  oidcAuthStates: [oidcAuthState],
  skills: [installedSkill, availableSkill],
  subprompts: [stackSubprompt, architectureSubprompt],
  brainstormSessions: [brainstormSession],
  brainstormPlans: [brainstormPlan],
  mcpConnections: [mcpConnection],
  mcpDelegationRuns: [mcpDelegationRun]
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
