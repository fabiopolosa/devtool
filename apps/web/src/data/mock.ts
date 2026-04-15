import type {
  Approval,
  Artifact,
  AutoResearchExperiment,
  AutoResearchRun,
  ChatMessage,
  ChatThread,
  MemoryChunk,
  MemoryEntry,
  Project,
  ProjectProviderBinding,
  ProjectRepositoryLink,
  PromptVersion,
  ProviderCapability,
  ProviderConfig,
  ProviderHealthcheck,
  ProviderModel,
  Repository,
  ResearchNote,
  RetrievalQueryLog,
  RoadmapItem,
  RoutingRule,
  Task,
  TaskRun,
  VerificationResult,
  VerificationStep
} from '@cp/domain';

const now = new Date().toISOString();
const defaultTenantId = 'tenant_default';

const audit = {
  createdAt: now,
  createdBy: 'system',
  updatedAt: now,
  updatedBy: 'system'
};

export const projects: Project[] = [
  {
    ...audit,
    id: 'proj-control-plane',
    tenantId: defaultTenantId,
    key: 'control-plane',
    name: 'AI Development Control-Plane',
    description: 'Core orchestration platform for multi-agent software execution.',
    status: 'active',
    policySetId: 'policy-main'
  },
  {
    ...audit,
    id: 'proj-web-ops',
    tenantId: defaultTenantId,
    key: 'web-ops',
    name: 'Web Ops Console',
    description: 'Operational UI and workflow oversight workspace.',
    status: 'active',
    policySetId: 'policy-main'
  }
];

export const repositories: Repository[] = [
  {
    ...audit,
    id: 'repo-control-plane',
    tenantId: defaultTenantId,
    name: 'control-plane',
    url: 'git@github.com:acme/control-plane.git',
    vcsProvider: 'github',
    defaultBranch: 'main',
    localPath: '/Users/andromeda/devtool',
    status: 'active'
  },
  {
    ...audit,
    id: 'repo-web-app',
    tenantId: defaultTenantId,
    name: 'web-app',
    url: 'git@github.com:acme/web-app.git',
    vcsProvider: 'github',
    defaultBranch: 'main',
    localPath: '/Users/andromeda/devtool/apps/web',
    status: 'active'
  }
];

export const projectRepositoryLinks: ProjectRepositoryLink[] = [
  {
    ...audit,
    id: 'prl-1',
    tenantId: defaultTenantId,
    projectId: 'proj-control-plane',
    repositoryId: 'repo-control-plane',
    role: 'primary',
    rulesRef: 'routing-policy:v1'
  },
  {
    ...audit,
    id: 'prl-2',
    tenantId: defaultTenantId,
    projectId: 'proj-control-plane',
    repositoryId: 'repo-web-app',
    role: 'secondary',
    rulesRef: 'routing-policy:v1'
  }
];

export const roadmapItems: RoadmapItem[] = [
  {
    ...audit,
    id: 'rm-1',
    tenantId: defaultTenantId,
    projectId: 'proj-control-plane',
    title: 'Provider capability registry',
    description: 'Model and route OpenAI, Anthropic, Gemini, OpenRouter, and Kie.ai by capability.',
    state: 'approved',
    priority: 90,
    orderIndex: 1
  },
  {
    ...audit,
    id: 'rm-2',
    tenantId: defaultTenantId,
    projectId: 'proj-control-plane',
    title: 'Memory and retrieval stack',
    description: 'Centralized memory, chunking, embeddings, and packet builder.',
    state: 'in_progress',
    priority: 80,
    orderIndex: 2
  },
  {
    ...audit,
    id: 'rm-3',
    tenantId: defaultTenantId,
    projectId: 'proj-web-ops',
    title: 'Dashboard polish pass',
    description: 'Operational panels, run inspection, and provider admin flows.',
    state: 'proposed',
    priority: 70,
    orderIndex: 1
  }
];

export const tasks: Task[] = [
  {
    ...audit,
    id: 'task-provider-routing',
    tenantId: defaultTenantId,
    projectId: 'proj-control-plane',
    roadmapItemId: 'rm-1',
    title: 'Implement provider routing and health fallback',
    type: 'feature',
    state: 'running',
    goal: 'Route agent requests by capability with project-aware fallback chains.',
    scopeInclude: ['provider registry', 'capability discovery', 'health checks'],
    scopeExclude: ['billing engine', 'SSO'],
    constraints: ['No vendor logic in agents', 'Config-driven selection'],
    targetRepositoryIds: ['repo-control-plane'],
    successCriteria: ['Capability-first routing', 'Fallback chain is explicit'],
    verificationPlan: ['lint', 'test', 'build'],
    dependencyTaskIds: [],
    riskNotes: ['Credential wiring remains external'],
    budget: { maxRetries: 2 },
    approvalsRequired: true
  },
  {
    ...audit,
    id: 'task-dashboard-ui',
    tenantId: defaultTenantId,
    projectId: 'proj-web-ops',
    roadmapItemId: 'rm-3',
    title: 'Dashboard command center',
    type: 'feature',
    state: 'queued',
    goal: 'Show projects, roadmap, runs, memory, providers, and experiments in one pane.',
    scopeInclude: ['routes', 'panels', 'mock interactions'],
    scopeExclude: ['backend write API'],
    constraints: ['Dense but readable layout', 'Mobile-friendly'],
    targetRepositoryIds: ['repo-web-app'],
    successCriteria: ['All routes render', 'Interactions update local state'],
    verificationPlan: ['lint', 'typecheck', 'build'],
    dependencyTaskIds: ['task-provider-routing'],
    riskNotes: ['Design may need tuning after real data'],
    budget: { maxRetries: 1 },
    approvalsRequired: false
  }
];

export const taskRuns: TaskRun[] = [
  {
    ...audit,
    id: 'run-1',
    tenantId: defaultTenantId,
    taskId: 'task-provider-routing',
    workflowId: 'task_execute',
    status: 'running',
    startedAt: now,
    retryCount: 1,
    costProxyInputTokens: 13200,
    costProxyOutputTokens: 2600,
    reposTouched: ['repo-control-plane']
  },
  {
    ...audit,
    id: 'run-2',
    tenantId: defaultTenantId,
    taskId: 'task-dashboard-ui',
    workflowId: 'task_execute',
    status: 'queued',
    retryCount: 0,
    costProxyInputTokens: 0,
    costProxyOutputTokens: 0,
    reposTouched: ['repo-web-app']
  }
];

export const approvals: Approval[] = [
  {
    ...audit,
    id: 'app-1',
    tenantId: defaultTenantId,
    subjectType: 'roadmap_item',
    subjectId: 'rm-3',
    status: 'pending',
    requestedBy: 'planner',
    reason: 'User review required before dashboard polish enters execution.'
  }
];

export const artifacts: Artifact[] = [
  {
    ...audit,
    id: 'art-1',
    tenantId: defaultTenantId,
    runId: 'run-1',
    taskId: 'task-provider-routing',
    type: 'planner_output',
    schemaVersion: 'v1',
    uri: 'memory://artifacts/planner-output.json',
    summary: 'Planner output for provider routing scope.'
  },
  {
    ...audit,
    id: 'art-2',
    tenantId: defaultTenantId,
    runId: 'run-1',
    taskId: 'task-provider-routing',
    type: 'verification_log',
    schemaVersion: 'v1',
    uri: 'memory://artifacts/verification.log',
    summary: 'Running verification details.'
  }
];

export const verificationResults: VerificationResult[] = [
  {
    ...audit,
    id: 'ver-1',
    runId: 'run-1',
    taskId: 'task-provider-routing',
    overallStatus: 'partial',
    score: 0.78,
    summary: 'Lint and typecheck passed; build is pending routing adapter integration.'
  }
];

export const verificationSteps: VerificationStep[] = [
  {
    ...audit,
    id: 'ver-step-1',
    verificationResultId: 'ver-1',
    runId: 'run-1',
    stepType: 'lint',
    command: 'pnpm lint',
    status: 'pass',
    exitCode: 0,
    durationMs: 12130,
    outputUri: 'memory://verification/lint.txt'
  },
  {
    ...audit,
    id: 'ver-step-2',
    verificationResultId: 'ver-1',
    runId: 'run-1',
    stepType: 'test',
    command: 'pnpm test',
    status: 'pass',
    exitCode: 0,
    durationMs: 9421,
    outputUri: 'memory://verification/test.txt'
  },
  {
    ...audit,
    id: 'ver-step-3',
    verificationResultId: 'ver-1',
    runId: 'run-1',
    stepType: 'build',
    command: 'pnpm build',
    status: 'fail',
    exitCode: 1,
    durationMs: 1780,
    outputUri: 'memory://verification/build.txt'
  }
];

export const memoryEntries: MemoryEntry[] = [
  {
    ...audit,
    id: 'mem-1',
    projectId: 'proj-control-plane',
    category: 'architecture_note',
    title: 'Capability-first routing rule',
    body: 'Agents request capability classes. Provider selection remains in the orchestration layer with project-specific fallback chains and health awareness.',
    priority: 95,
    pinned: true,
    freshnessTtlHours: 168,
    sourceRef: 'docs/architecture.md#provider-contract',
    sourceHash: 'sha256:capability-first',
    isStale: false
  },
  {
    ...audit,
    id: 'mem-2',
    projectId: 'proj-web-ops',
    repositoryId: 'repo-web-app',
    category: 'repo_local_instruction',
    title: 'Dashboard visual language',
    body: 'Use dense operational panels, visible state, and a calm dark command-center palette with blue-violet accents.',
    priority: 80,
    pinned: false,
    sourceRef: 'apps/web/README.md',
    sourceHash: 'sha256:dashboard-ui',
    isStale: false
  }
];

export const memoryChunks: MemoryChunk[] = [
  {
    ...audit,
    id: 'chunk-1',
    memoryEntryId: 'mem-1',
    projectId: 'proj-control-plane',
    category: 'architecture_note',
    chunkIndex: 0,
    chunkText: 'Agents request capability classes. Provider selection stays in orchestration with project-specific fallback chains.',
    chunkTitle: 'Capability-first routing rule',
    tokenEstimate: 34,
    metadata: { source: 'architecture.md', section: 'provider-contract' },
    embeddingRef: 'emb-1'
  },
  {
    ...audit,
    id: 'chunk-2',
    memoryEntryId: 'mem-2',
    projectId: 'proj-web-ops',
    repositoryId: 'repo-web-app',
    category: 'repo_local_instruction',
    chunkIndex: 0,
    chunkText: 'Use dense operational panels, visible state, and a calm dark command-center palette with blue-violet accents.',
    chunkTitle: 'Dashboard visual language',
    tokenEstimate: 31,
    metadata: { source: 'apps/web/README.md' },
    embeddingRef: 'emb-2'
  }
];

export const retrievalLogs: RetrievalQueryLog[] = [
  {
    ...audit,
    id: 'retr-1',
    projectId: 'proj-control-plane',
    taskRunId: 'run-1',
    role: 'codex_builder',
    queryText: 'provider routing fallback health and capability discovery',
    topK: 4,
    filters: { categories: ['architecture_note', 'prompt_policy_note'] },
    returnedChunkIds: ['chunk-1'],
    tokenEstimate: 124
  }
];

export const researchNotes: ResearchNote[] = [
  {
    ...audit,
    id: 'research-1',
    projectId: 'proj-control-plane',
    taskId: 'task-provider-routing',
    title: 'OpenRouter model routing guidance',
    question: 'How should fallback chain semantics be modeled across vendors?',
    summary: 'Treat OpenRouter as an adapter over vendor models and use explicit capability metadata to avoid assuming uniform feature parity.',
    sourceList: [{ title: 'OpenRouter docs', url: 'https://openrouter.ai/docs' }],
    breakingChangeRisk: 'medium',
    caveats: ['Provider model names may differ from underlying vendor IDs.']
  }
];

export const promptVersions: PromptVersion[] = [
  {
    ...audit,
    id: 'prompt-planner-v1',
    role: 'planner',
    version: 'v1',
    contentRef: 'configs/prompts/roles/planner.md',
    changelog: 'Initial planner contract.',
    promoted: true
  },
  {
    ...audit,
    id: 'prompt-builder-v1',
    role: 'codex_builder',
    version: 'v1',
    contentRef: 'configs/prompts/roles/codex-builder.md',
    changelog: 'Initial builder contract.',
    promoted: true
  }
];

export const routingRules: RoutingRule[] = [
  {
    ...audit,
    id: 'route-1',
    role: 'codex_builder',
    capability: 'coding',
    precedence: 10,
    conditions: { projectId: 'proj-control-plane' },
    fallbackChain: ['anthropic:claude-3-7-sonnet', 'openrouter:anthropic/claude-3.7-sonnet'],
    enabled: true
  }
];

export const experiments: AutoResearchExperiment[] = [
  {
    ...audit,
    id: 'exp-1',
    projectId: 'proj-control-plane',
    targetType: 'routing_rule',
    status: 'running',
    metricSet: ['first_pass_success', 'mean_time_to_pass', 'token_proxy'],
    baselineVersionRef: 'routing-policy:v1'
  }
];

export const experimentRuns: AutoResearchRun[] = [
  {
    ...audit,
    id: 'exprun-1',
    experimentId: 'exp-1',
    variantId: 'variant-a',
    status: 'running',
    metrics: { first_pass_success: 0.66, mean_time_to_pass: 18.2, token_proxy: 13400 },
    winnerFlag: false,
    rollbackFlag: false
  },
  {
    ...audit,
    id: 'exprun-2',
    experimentId: 'exp-1',
    variantId: 'variant-b',
    status: 'completed',
    metrics: { first_pass_success: 0.74, mean_time_to_pass: 14.8, token_proxy: 12100 },
    winnerFlag: true,
    rollbackFlag: false
  }
];

export const threads: ChatThread[] = [
  {
    ...audit,
    id: 'thread-1',
    projectId: 'proj-control-plane',
    contextType: 'project',
    status: 'open',
    title: 'Routing strategy and fallback policy'
  }
];

export const messages: ChatMessage[] = [
  {
    ...audit,
    id: 'msg-1',
    threadId: 'thread-1',
    role: 'user',
    content: 'Propose the next safe task sequence for provider routing and dashboard polish.',
    structuredIntent: { type: 'roadmap_request', wantsApproval: true }
  },
  {
    ...audit,
    id: 'msg-2',
    threadId: 'thread-1',
    role: 'assistant',
    content: 'I have split the work into provider routing and dashboard polish, with the latter pending approval.'
  }
];

export const providers: ProviderConfig[] = [
  {
    ...audit,
    id: 'prov-openai',
    provider: 'openai',
    endpoint: 'https://api.openai.com/v1',
    authRef: 'secret://providers/openai',
    enabled: true,
    timeoutMs: 30000,
    metadata: { defaultFor: ['coding', 'image_generation', 'image_editing'] }
  },
  {
    ...audit,
    id: 'prov-anthropic',
    provider: 'anthropic',
    endpoint: 'https://api.anthropic.com',
    authRef: 'secret://providers/anthropic',
    enabled: true,
    timeoutMs: 30000,
    metadata: { defaultFor: ['chat_reasoning'] }
  },
  {
    ...audit,
    id: 'prov-gemini',
    provider: 'gemini',
    endpoint: 'https://generativelanguage.googleapis.com',
    authRef: 'secret://providers/gemini',
    enabled: true,
    timeoutMs: 30000,
    metadata: { defaultFor: ['embedding', 'vision_analysis'] }
  }
];

export const providerCapabilities: ProviderCapability[] = [
  {
    ...audit,
    id: 'pc-1',
    providerConfigId: 'prov-openai',
    capabilityClass: 'coding',
    supported: true,
    notes: 'Preferred for implementation work'
  },
  {
    ...audit,
    id: 'pc-2',
    providerConfigId: 'prov-openai',
    capabilityClass: 'image_generation',
    supported: true
  },
  {
    ...audit,
    id: 'pc-3',
    providerConfigId: 'prov-gemini',
    capabilityClass: 'embedding',
    supported: true
  }
];

export const providerModels: ProviderModel[] = [
  {
    ...audit,
    id: 'pm-openai-41',
    providerConfigId: 'prov-openai',
    modelId: 'gpt-4.1',
    capabilityClass: 'coding',
    contextWindow: 128000,
    maxOutputTokens: 16384,
    pricingMeta: { input: 5, output: 15 },
    enabled: true
  },
  {
    ...audit,
    id: 'pm-openai-image',
    providerConfigId: 'prov-openai',
    modelId: 'gpt-image-1',
    capabilityClass: 'image_generation',
    enabled: true
  },
  {
    ...audit,
    id: 'pm-gemini-emb',
    providerConfigId: 'prov-gemini',
    modelId: 'text-embedding-004',
    capabilityClass: 'embedding',
    contextWindow: 8192,
    enabled: true
  }
];

export const projectBindings: ProjectProviderBinding[] = [
  {
    ...audit,
    id: 'bind-1',
    projectId: 'proj-control-plane',
    role: 'codex_builder',
    capabilityClass: 'coding',
    primaryModelId: 'pm-openai-41',
    fallbackModelIds: ['pm-openai-image'],
    enabled: true
  }
];

export const providerHealthchecks: ProviderHealthcheck[] = [
  {
    ...audit,
    id: 'hc-1',
    providerConfigId: 'prov-openai',
    modelId: 'pm-openai-41',
    status: 'healthy',
    latencyMs: 420,
    errorRate: 0.01,
    details: 'Stable over last 24h',
    checkedAt: now
  },
  {
    ...audit,
    id: 'hc-2',
    providerConfigId: 'prov-gemini',
    modelId: 'pm-gemini-emb',
    status: 'degraded',
    latencyMs: 980,
    errorRate: 0.07,
    details: 'Embedding throughput slower than baseline',
    checkedAt: now
  }
];
