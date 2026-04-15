import path from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  InMemoryDatabase,
  PostgresDatabase,
  createPostgresClient,
  runDatabaseMigrations,
  type DatabasePort,
  type DatabaseTables,
  type TableName
} from "@cp/db";
import { normalizeBrainstormPlan } from "@cp/domain";
import type {
  AgentConfig,
  BrainstormPlan,
  BrainstormSession,
  CodingWorkflow,
  AuditEvent,
  Approval,
  Artifact,
  AutoResearchExperiment,
  AutoResearchRun,
  ChatMessage,
  ChatThread,
  ContextNote,
  DelegatedPermission,
  Environment,
  KnowledgeConfig,
  KnowledgeNode,
  LocalRepository,
  MemoryChunk,
  MemoryEntry,
  Machine,
  McpConnection,
  McpDelegationRun,
  Policy,
  PromptRegistryEntry,
  OidcAuthState,
  ProviderCapability,
  ProviderConfig,
  ProviderDiscoveryLog,
  ProviderHealthcheck,
  ProviderModel,
  Project,
  ProjectRepositoryLink,
  ProjectProviderBinding,
  ProjectRoleBinding,
  RepositoryRoleBinding,
  Repository,
  Role,
  SchemaDoc,
  SecretConfig,
  Subprompt,
  RetrievalQueryLog,
  ResearchNote,
  RoutingRule,
  RoadmapItem,
  Session,
  Tenant,
  UserTenant,
  Job,
  Skill,
  Task,
  TaskRun,
  User,
  UserRole,
  VersionSnapshot,
  VerificationResult,
  VerificationStep
} from "@cp/domain";
import { seedData, runEventsByRunId } from "./seed-data.js";
import type { ApiSeedData, RunEvent } from "../types/api.js";

export type ApiStoreMode = "postgres" | "in_memory";

export interface ApiStoreOptions {
  mode?: ApiStoreMode;
  database?: DatabasePort;
  seed?: ApiSeedData;
  migrationsDir?: string;
  runEvents?: Record<string, RunEvent[]>;
}

const defaultMode = (): ApiStoreMode =>
  process.env.API_STORE_MODE === "in_memory" ? "in_memory" : "postgres";

const resolveDefaultMigrationsDir = (): string => {
  const fromCwd = path.resolve(process.cwd(), "packages/db/migrations");
  if (existsSync(fromCwd)) {
    return fromCwd;
  }

  // Fallback for commands executed from workspace packages (for example apps/api).
  const moduleDir = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(moduleDir, "../../../../packages/db/migrations");
};

const normalizePostgresDateTime = (value: unknown): string => {
  if (value instanceof Date) return value.toISOString();
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  if (trimmed.length === 0) return trimmed;

  let normalized = trimmed.includes("T") ? trimmed : trimmed.replace(" ", "T");
  if (/[+-]\d{2}$/.test(normalized)) {
    normalized = `${normalized}:00`;
  } else if (/[+-]\d{4}$/.test(normalized)) {
    normalized = `${normalized.slice(0, -2)}:${normalized.slice(-2)}`;
  }

  return normalized;
};

const normalizeBrainstormPlanRecord = (plan: BrainstormPlan): BrainstormPlan =>
  normalizeBrainstormPlan({
    ...plan,
    createdAt: normalizePostgresDateTime(plan.createdAt),
    updatedAt: normalizePostgresDateTime(plan.updatedAt)
  });

export class ApiStore {
  private readonly seed: ApiSeedData;
  private readonly runEvents: Record<string, RunEvent[]>;
  private readonly configuredMode: ApiStoreMode | undefined;
  private database: DatabasePort | null = null;
  private initialized = false;

  constructor(private readonly options: ApiStoreOptions = {}) {
    this.seed = options.seed ?? seedData;
    this.runEvents = options.runEvents ?? runEventsByRunId;
    this.configuredMode = options.mode;
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    const mode = this.configuredMode ?? defaultMode();

    if (this.options.database) {
      this.database = this.options.database;
    } else if (mode === "in_memory") {
      this.database = new InMemoryDatabase();
    } else {
      const client = createPostgresClient();
      const migrationsDir = this.options.migrationsDir ?? resolveDefaultMigrationsDir();
      await runDatabaseMigrations({ pool: client.pool, migrationsDir });
      this.database = new PostgresDatabase(client);
    }

    await this.seedIfEmpty();
    this.initialized = true;
  }

  async close(): Promise<void> {
    if (this.database?.close) {
      await this.database.close();
    }
    this.database = null;
    this.initialized = false;
  }

  async listProjects(): Promise<Project[]> { return this.repo("projects").list(); }
  async listTenants(): Promise<Tenant[]> { return this.repo("tenants").list(); }
  async getTenant(tenantId: string): Promise<Tenant | null> { return this.repo("tenants").getById(tenantId); }
  async createTenant(tenant: Tenant): Promise<Tenant> { return this.repo("tenants").create(tenant); }
  async listUserTenants(filters?: { userId?: string; tenantId?: string; role?: UserTenant["role"] }): Promise<UserTenant[]> {
    return this.repo("user_tenants").list(filters);
  }
  async createUserTenant(userTenant: UserTenant): Promise<UserTenant> {
    return this.repo("user_tenants").create(userTenant);
  }
  async listJobs(filters?: {
    type?: Job["type"];
    status?: Job["status"];
    actionRequired?: boolean;
    actionType?: Job["actionType"];
    resourceType?: string;
    resourceId?: string;
    ready?: boolean;
    projectId?: string;
  }): Promise<Job[]> {
    return this.repo("jobs").list(filters);
  }
  async getJob(jobId: string): Promise<Job | null> {
    return this.repo("jobs").getById(jobId);
  }
  async createJob(job: Job): Promise<Job> {
    return this.repo("jobs").create(job);
  }
  async updateJob(jobId: string, patch: Partial<Job>): Promise<Job> {
    return this.repo("jobs").update(jobId, patch);
  }
  async listSecrets(scope?: SecretConfig["scope"]): Promise<SecretConfig[]> {
    return this.repo("secrets").list(scope ? { scope } : undefined);
  }
  async getSecret(secretId: string): Promise<SecretConfig | null> { return this.repo("secrets").getById(secretId); }
  async findSecretByName(name: string, scope?: SecretConfig["scope"]): Promise<SecretConfig | null> {
    const normalizedName = name.trim();
    const secrets = await this.repo("secrets").list(scope ? { scope } : undefined);
    return secrets.find((secret) => secret.name === normalizedName) ?? null;
  }
  async createSecret(secret: SecretConfig): Promise<SecretConfig> { return this.repo("secrets").create(secret); }
  async updateSecret(secretId: string, patch: Partial<SecretConfig>): Promise<SecretConfig> {
    return this.repo("secrets").update(secretId, patch);
  }
  async deleteSecret(secretId: string): Promise<void> { await this.repo("secrets").delete(secretId); }
  async listSchemaDocs(): Promise<SchemaDoc[]> { return this.repo("schema_docs").list(); }
  async getSchemaDoc(schemaDocId: string): Promise<SchemaDoc | null> { return this.repo("schema_docs").getById(schemaDocId); }
  async createSchemaDoc(schemaDoc: SchemaDoc): Promise<SchemaDoc> { return this.repo("schema_docs").create(schemaDoc); }
  async updateSchemaDoc(schemaDocId: string, patch: Partial<SchemaDoc>): Promise<SchemaDoc> {
    return this.repo("schema_docs").update(schemaDocId, patch);
  }
  async listEnvironments(): Promise<Environment[]> { return this.repo("environments").list(); }
  async getEnvironment(environmentId: string): Promise<Environment | null> {
    return this.repo("environments").getById(environmentId);
  }
  async createEnvironment(environment: Environment): Promise<Environment> {
    return this.repo("environments").create(environment);
  }
  async updateEnvironment(environmentId: string, patch: Partial<Environment>): Promise<Environment> {
    return this.repo("environments").update(environmentId, patch);
  }
  async deleteEnvironment(environmentId: string): Promise<void> {
    await this.repo("environments").delete(environmentId);
  }
  async listMachines(environmentId?: string): Promise<Machine[]> {
    return this.repo("machines").list(environmentId ? { environmentId } : undefined);
  }
  async getMachine(machineId: string): Promise<Machine | null> { return this.repo("machines").getById(machineId); }
  async createMachine(machine: Machine): Promise<Machine> { return this.repo("machines").create(machine); }
  async updateMachine(machineId: string, patch: Partial<Machine>): Promise<Machine> {
    return this.repo("machines").update(machineId, patch);
  }
  async deleteMachine(machineId: string): Promise<void> { await this.repo("machines").delete(machineId); }
  async listLocalRepositories(): Promise<LocalRepository[]> { return this.repo("local_repositories").list(); }
  async getLocalRepository(localRepositoryId: string): Promise<LocalRepository | null> {
    return this.repo("local_repositories").getById(localRepositoryId);
  }
  async createLocalRepository(localRepository: LocalRepository): Promise<LocalRepository> {
    return this.repo("local_repositories").create(localRepository);
  }
  async updateLocalRepository(
    localRepositoryId: string,
    patch: Partial<LocalRepository>
  ): Promise<LocalRepository> {
    return this.repo("local_repositories").update(localRepositoryId, patch);
  }
  async deleteLocalRepository(localRepositoryId: string): Promise<void> {
    await this.repo("local_repositories").delete(localRepositoryId);
  }
  async listVersionSnapshots(filters?: {
    localRepositoryId?: string;
    taskId?: string;
  }): Promise<VersionSnapshot[]> {
    return this.repo("version_snapshots").list(filters);
  }
  async getVersionSnapshot(snapshotId: string): Promise<VersionSnapshot | null> {
    return this.repo("version_snapshots").getById(snapshotId);
  }
  async createVersionSnapshot(snapshot: VersionSnapshot): Promise<VersionSnapshot> {
    return this.repo("version_snapshots").create(snapshot);
  }
  async listAgents(): Promise<AgentConfig[]> { return this.repo("agents").list(); }
  async getAgent(agentId: string): Promise<AgentConfig | null> { return this.repo("agents").getById(agentId); }
  async createAgent(agent: AgentConfig): Promise<AgentConfig> { return this.repo("agents").create(agent); }
  async updateAgent(agentId: string, patch: Partial<AgentConfig>): Promise<AgentConfig> {
    return this.repo("agents").update(agentId, patch);
  }
  async deleteAgent(agentId: string): Promise<void> { await this.repo("agents").delete(agentId); }
  async getProject(projectId: string): Promise<Project | null> { return this.repo("projects").getById(projectId); }
  async createProject(project: Project): Promise<Project> { return this.repo("projects").create(project); }
  async updateProject(projectId: string, patch: Partial<Project>): Promise<Project> {
    return this.repo("projects").update(projectId, patch);
  }
  async listRepositories(): Promise<Repository[]> { return this.repo("repositories").list(); }
  async getRepository(repositoryId: string): Promise<Repository | null> { return this.repo("repositories").getById(repositoryId); }
  async createRepository(repository: Repository): Promise<Repository> { return this.repo("repositories").create(repository); }
  async createProjectRepositoryLink(link: ProjectRepositoryLink): Promise<ProjectRepositoryLink> {
    return this.repo("project_repository_links").create(link);
  }
  async listRoadmap(projectId?: string): Promise<RoadmapItem[]> { return this.repo("roadmap_items").list(projectId ? { projectId } : undefined); }
  async createRoadmapItem(item: RoadmapItem): Promise<RoadmapItem> { return this.repo("roadmap_items").create(item); }
  async listTasks(projectId?: string): Promise<Task[]> { return this.repo("tasks").list(projectId ? { projectId } : undefined); }
  async getTask(taskId: string): Promise<Task | null> { return this.repo("tasks").getById(taskId); }
  async createTask(task: Task): Promise<Task> { return this.repo("tasks").create(task); }
  async updateTask(taskId: string, patch: Partial<Task>): Promise<Task> { return this.repo("tasks").update(taskId, patch); }
  async listRuns(taskId?: string): Promise<TaskRun[]> { return this.repo("task_runs").list(taskId ? { taskId } : undefined); }
  async getRun(runId: string): Promise<TaskRun | null> { return this.repo("task_runs").getById(runId); }
  async listApprovals(): Promise<Approval[]> { return this.repo("approvals").list(); }
  async listArtifacts(runId?: string): Promise<Artifact[]> { return this.repo("artifacts").list(runId ? { runId } : undefined); }
  async listVerificationResults(runId?: string): Promise<VerificationResult[]> { return this.repo("verification_results").list(runId ? { runId } : undefined); }
  async listVerificationSteps(runId?: string): Promise<VerificationStep[]> { return this.repo("verification_steps").list(runId ? { runId } : undefined); }
  async listKnowledgeNodes(filters?: {
    tenantId?: string;
    projectId?: string;
    scope?: KnowledgeNode["scope"];
    path?: string;
  }): Promise<KnowledgeNode[]> {
    return this.repo("knowledge_nodes").list(filters);
  }
  async getKnowledgeNode(knowledgeNodeId: string): Promise<KnowledgeNode | null> {
    return this.repo("knowledge_nodes").getById(knowledgeNodeId);
  }
  async findKnowledgeNodeByScopePath(
    scope: KnowledgeNode["scope"],
    nodePath: string
  ): Promise<KnowledgeNode | null> {
    const rows = await this.repo("knowledge_nodes").list({ scope, path: nodePath });
    return rows[0] ?? null;
  }
  async createKnowledgeNode(node: KnowledgeNode): Promise<KnowledgeNode> {
    return this.repo("knowledge_nodes").create(node);
  }
  async updateKnowledgeNode(knowledgeNodeId: string, patch: Partial<KnowledgeNode>): Promise<KnowledgeNode> {
    return this.repo("knowledge_nodes").update(knowledgeNodeId, patch);
  }
  async deleteKnowledgeNode(knowledgeNodeId: string): Promise<void> {
    await this.repo("knowledge_nodes").delete(knowledgeNodeId);
  }
  async listContextNotes(filters?: {
    tenantId?: string;
    projectId?: string;
    path?: string;
  }): Promise<ContextNote[]> {
    return this.repo("context_notes").list(filters);
  }
  async getContextNote(contextNoteId: string): Promise<ContextNote | null> {
    return this.repo("context_notes").getById(contextNoteId);
  }
  async findContextNoteByProjectPath(
    tenantId: string,
    projectId: string,
    notePath: string
  ): Promise<ContextNote | null> {
    const rows = await this.repo("context_notes").list({ tenantId, projectId, path: notePath });
    return rows[0] ?? null;
  }
  async createContextNote(note: ContextNote): Promise<ContextNote> {
    return this.repo("context_notes").create(note);
  }
  async updateContextNote(contextNoteId: string, patch: Partial<ContextNote>): Promise<ContextNote> {
    return this.repo("context_notes").update(contextNoteId, patch);
  }
  async deleteContextNote(contextNoteId: string): Promise<void> {
    await this.repo("context_notes").delete(contextNoteId);
  }
  async listKnowledgeConfigs(filters?: {
    scope?: KnowledgeConfig["scope"];
    projectId?: string;
  }): Promise<KnowledgeConfig[]> {
    return this.repo("knowledge_configs").list(filters);
  }
  async getKnowledgeConfig(knowledgeConfigId: string): Promise<KnowledgeConfig | null> {
    return this.repo("knowledge_configs").getById(knowledgeConfigId);
  }
  async createKnowledgeConfig(config: KnowledgeConfig): Promise<KnowledgeConfig> {
    return this.repo("knowledge_configs").create(config);
  }
  async updateKnowledgeConfig(
    knowledgeConfigId: string,
    patch: Partial<KnowledgeConfig>
  ): Promise<KnowledgeConfig> {
    return this.repo("knowledge_configs").update(knowledgeConfigId, patch);
  }
  async listMemoryEntries(projectId?: string): Promise<MemoryEntry[]> { return this.repo("memory_entries").list(projectId ? { projectId } : undefined); }
  async listMemoryChunks(projectId?: string): Promise<MemoryChunk[]> { return this.repo("memory_chunks").list(projectId ? { projectId } : undefined); }
  async listRetrievalLogs(projectId?: string): Promise<RetrievalQueryLog[]> { return this.repo("retrieval_query_logs").list(projectId ? { projectId } : undefined); }
  async listResearchNotes(projectId?: string): Promise<ResearchNote[]> { return this.repo("research_notes").list(projectId ? { projectId } : undefined); }
  async listPolicies(): Promise<Policy[]> { return this.repo("policies").list(); }
  async listRoutingRules(): Promise<RoutingRule[]> { return this.repo("routing_rules").list(); }
  async listThreads(projectId?: string): Promise<ChatThread[]> { return this.repo("chat_threads").list(projectId ? { projectId } : undefined); }
  async listMessages(threadId?: string): Promise<ChatMessage[]> { return this.repo("chat_messages").list(threadId ? { threadId } : undefined); }
  async listProviderConfigs(): Promise<ProviderConfig[]> {
    return (await this.repo("provider_configs").list()).map((item) => ({
      ...item,
      providerId: item.providerId ?? item.provider,
      validationStatus: item.validationStatus ?? "unknown"
    }));
  }
  async createProviderConfig(config: ProviderConfig): Promise<ProviderConfig> {
    return this.repo("provider_configs").create({
      ...config,
      providerId: config.providerId ?? config.provider,
      validationStatus: config.validationStatus ?? "unknown"
    });
  }
  async updateProviderConfig(providerConfigId: string, patch: Partial<ProviderConfig>): Promise<ProviderConfig> {
    const normalizedPatch: Partial<ProviderConfig> = { ...patch };
    if (normalizedPatch.provider && !normalizedPatch.providerId) {
      normalizedPatch.providerId = normalizedPatch.provider;
    }
    return this.repo("provider_configs").update(providerConfigId, normalizedPatch);
  }
  async listProviderCapabilities(): Promise<ProviderCapability[]> { return this.repo("provider_capabilities").list(); }
  async createProviderCapability(capability: ProviderCapability): Promise<ProviderCapability> {
    return this.repo("provider_capabilities").create(capability);
  }
  async updateProviderCapability(
    providerCapabilityId: string,
    patch: Partial<ProviderCapability>
  ): Promise<ProviderCapability> {
    return this.repo("provider_capabilities").update(providerCapabilityId, patch);
  }
  async listProviderModels(): Promise<ProviderModel[]> { return this.repo("provider_models").list(); }
  async createProviderModel(model: ProviderModel): Promise<ProviderModel> {
    return this.repo("provider_models").create(model);
  }
  async updateProviderModel(providerModelId: string, patch: Partial<ProviderModel>): Promise<ProviderModel> {
    return this.repo("provider_models").update(providerModelId, patch);
  }
  async listProviderBindings(projectId?: string): Promise<ProjectProviderBinding[]> { return this.repo("project_provider_bindings").list(projectId ? { projectId } : undefined); }
  async createProviderBinding(binding: ProjectProviderBinding): Promise<ProjectProviderBinding> {
    return this.repo("project_provider_bindings").create(binding);
  }
  async updateProviderBinding(
    bindingId: string,
    patch: Partial<ProjectProviderBinding>
  ): Promise<ProjectProviderBinding> {
    return this.repo("project_provider_bindings").update(bindingId, patch);
  }
  async listProviderHealthchecks(): Promise<ProviderHealthcheck[]> { return this.repo("provider_healthchecks").list(); }
  async createProviderHealthcheck(healthcheck: ProviderHealthcheck): Promise<ProviderHealthcheck> {
    return this.repo("provider_healthchecks").create(healthcheck);
  }
  async updateProviderHealthcheck(
    providerHealthcheckId: string,
    patch: Partial<ProviderHealthcheck>
  ): Promise<ProviderHealthcheck> {
    return this.repo("provider_healthchecks").update(providerHealthcheckId, patch);
  }
  async listProviderDiscoveryLogs(): Promise<ProviderDiscoveryLog[]> {
    return this.repo("provider_discovery_logs").list();
  }
  async createProviderDiscoveryLog(log: ProviderDiscoveryLog): Promise<ProviderDiscoveryLog> {
    return this.repo("provider_discovery_logs").create(log);
  }
  async listPromptRegistry(filters?: {
    tenantId?: string;
    projectId?: string;
    scope?: PromptRegistryEntry["scope"];
    type?: string;
    target?: string;
    status?: PromptRegistryEntry["status"];
  }): Promise<PromptRegistryEntry[]> {
    return this.repo("prompt_registry").list(filters);
  }
  async getPromptRegistry(promptId: string): Promise<PromptRegistryEntry | null> {
    return this.repo("prompt_registry").getById(promptId);
  }
  async createPromptRegistry(prompt: PromptRegistryEntry): Promise<PromptRegistryEntry> {
    return this.repo("prompt_registry").create(prompt);
  }
  async updatePromptRegistry(promptId: string, patch: Partial<PromptRegistryEntry>): Promise<PromptRegistryEntry> {
    return this.repo("prompt_registry").update(promptId, patch);
  }
  async listSubprompts(filters?: { category?: Subprompt["category"]; enabled?: boolean }): Promise<Subprompt[]> {
    return this.repo("subprompts").list(filters);
  }
  async getSubprompt(subpromptId: string): Promise<Subprompt | null> {
    return this.repo("subprompts").getById(subpromptId);
  }
  async createSubprompt(subprompt: Subprompt): Promise<Subprompt> {
    return this.repo("subprompts").create(subprompt);
  }
  async updateSubprompt(subpromptId: string, patch: Partial<Subprompt>): Promise<Subprompt> {
    return this.repo("subprompts").update(subpromptId, patch);
  }
  async listBrainstormSessions(filters?: {
    threadId?: string;
    projectId?: string;
    status?: BrainstormSession["status"];
  }): Promise<BrainstormSession[]> {
    return this.repo("brainstorm_sessions").list(filters);
  }
  async getBrainstormSession(sessionId: string): Promise<BrainstormSession | null> {
    return this.repo("brainstorm_sessions").getById(sessionId);
  }
  async createBrainstormSession(session: BrainstormSession): Promise<BrainstormSession> {
    return this.repo("brainstorm_sessions").create(session);
  }
  async updateBrainstormSession(
    sessionId: string,
    patch: Partial<BrainstormSession>
  ): Promise<BrainstormSession> {
    return this.repo("brainstorm_sessions").update(sessionId, patch);
  }
  async listBrainstormPlans(filters?: { sessionId?: string }): Promise<BrainstormPlan[]> {
    const items = await this.repo("brainstorm_plans").list(filters);
    return items.map((item) => normalizeBrainstormPlanRecord(item));
  }
  async getBrainstormPlan(planId: string): Promise<BrainstormPlan | null> {
    const item = await this.repo("brainstorm_plans").getById(planId);
    return item ? normalizeBrainstormPlanRecord(item) : null;
  }
  async createBrainstormPlan(plan: BrainstormPlan): Promise<BrainstormPlan> {
    const normalized = normalizeBrainstormPlan(plan);
    return this.repo("brainstorm_plans").create(normalized);
  }
  async updateBrainstormPlan(planId: string, patch: Partial<BrainstormPlan>): Promise<BrainstormPlan> {
    const existing = await this.getBrainstormPlan(planId);
    if (!existing) {
      throw new Error(`Record not found: brainstorm_plans/${planId}`);
    }
    const merged = normalizeBrainstormPlan(
      {
        ...existing,
        ...patch
      }
    );
    return this.repo("brainstorm_plans").update(planId, merged);
  }
  async listCodingWorkflows(filters?: { projectId?: string; state?: CodingWorkflow["state"] }): Promise<CodingWorkflow[]> {
    return this.repo("coding_workflows").list(filters);
  }
  async getCodingWorkflow(workflowId: string): Promise<CodingWorkflow | null> {
    return this.repo("coding_workflows").getById(workflowId);
  }
  async createCodingWorkflow(workflow: CodingWorkflow): Promise<CodingWorkflow> {
    return this.repo("coding_workflows").create(workflow);
  }
  async updateCodingWorkflow(workflowId: string, patch: Partial<CodingWorkflow>): Promise<CodingWorkflow> {
    return this.repo("coding_workflows").update(workflowId, patch);
  }
  async listMcpConnections(): Promise<McpConnection[]> {
    return this.repo("mcp_connections").list();
  }
  async getMcpConnection(connectionId: string): Promise<McpConnection | null> {
    return this.repo("mcp_connections").getById(connectionId);
  }
  async createMcpConnection(connection: McpConnection): Promise<McpConnection> {
    return this.repo("mcp_connections").create(connection);
  }
  async updateMcpConnection(connectionId: string, patch: Partial<McpConnection>): Promise<McpConnection> {
    return this.repo("mcp_connections").update(connectionId, patch);
  }
  async listMcpDelegationRuns(filters?: { connectionId?: string }): Promise<McpDelegationRun[]> {
    return this.repo("mcp_delegation_runs").list(filters);
  }
  async createMcpDelegationRun(run: McpDelegationRun): Promise<McpDelegationRun> {
    return this.repo("mcp_delegation_runs").create(run);
  }
  async updateMcpDelegationRun(
    runId: string,
    patch: Partial<McpDelegationRun>
  ): Promise<McpDelegationRun> {
    return this.repo("mcp_delegation_runs").update(runId, patch);
  }
  async listSkills(): Promise<Skill[]> { return this.repo("skills").list(); }
  async getSkill(skillId: string): Promise<Skill | null> { return this.repo("skills").getById(skillId); }
  async createSkill(skill: Skill): Promise<Skill> { return this.repo("skills").create(skill); }
  async updateSkill(skillId: string, patch: Partial<Skill>): Promise<Skill> { return this.repo("skills").update(skillId, patch); }
  async findSkillByNameAndRepository(name: string, repositoryUrl: string): Promise<Skill | null> {
    const normalizedName = name.trim().toLowerCase();
    const normalizedRepositoryUrl = repositoryUrl.trim();
    const rows = await this.repo("skills").list();
    return (
      rows.find(
        (row) =>
          row.name.trim().toLowerCase() === normalizedName &&
          row.repositoryUrl.trim() === normalizedRepositoryUrl
      ) ?? null
    );
  }
  async listExperiments(): Promise<AutoResearchExperiment[]> { return this.repo("autoresearch_experiments").list(); }
  async listExperimentRuns(experimentId?: string): Promise<AutoResearchRun[]> { return this.repo("autoresearch_runs").list(experimentId ? { experimentId } : undefined); }
  async listUsers(): Promise<User[]> { return this.repo("users").list(); }
  async getUserById(userId: string): Promise<User | null> { return this.repo("users").getById(userId); }
  async getUserByEmail(email: string): Promise<User | null> {
    const normalized = email.trim().toLowerCase();
    const users = await this.repo("users").list({ email: normalized });
    return users[0] ?? null;
  }
  async createUser(user: User): Promise<User> { return this.repo("users").create(user); }
  async updateUser(userId: string, patch: Partial<User>): Promise<User> { return this.repo("users").update(userId, patch); }
  async listRoles(): Promise<Role[]> { return this.repo("roles").list(); }
  async getRoleById(roleId: string): Promise<Role | null> { return this.repo("roles").getById(roleId); }
  async getRoleByName(name: Role["name"]): Promise<Role | null> {
    const roles = await this.repo("roles").list({ name });
    return roles[0] ?? null;
  }
  async createRole(role: Role): Promise<Role> { return this.repo("roles").create(role); }
  async updateRole(roleId: string, patch: Partial<Role>): Promise<Role> { return this.repo("roles").update(roleId, patch); }
  async listUserRoles(userId?: string): Promise<UserRole[]> {
    return this.repo("user_roles").list(userId ? { userId } : undefined);
  }
  async createUserRole(userRole: UserRole): Promise<UserRole> { return this.repo("user_roles").create(userRole); }
  async listSessions(userId?: string): Promise<Session[]> { return this.repo("sessions").list(userId ? { userId } : undefined); }
  async getSessionByTokenHash(tokenHash: string): Promise<Session | null> {
    const sessions = await this.repo("sessions").list({ tokenHash });
    return sessions[0] ?? null;
  }
  async getSessionByRefreshTokenHash(refreshTokenHash: string): Promise<Session | null> {
    const sessions = await this.repo("sessions").list({ refreshTokenHash });
    return sessions[0] ?? null;
  }
  async createSession(session: Session): Promise<Session> { return this.repo("sessions").create(session); }
  async updateSession(sessionId: string, patch: Partial<Session>): Promise<Session> {
    return this.repo("sessions").update(sessionId, patch);
  }
  async listAuditEvents(userId?: string): Promise<AuditEvent[]> {
    return this.repo("audit_events").list(userId ? { userId } : undefined);
  }
  async createAuditEvent(event: AuditEvent): Promise<AuditEvent> { return this.repo("audit_events").create(event); }
  async listProjectRoleBindings(
    filters?: { userId?: string; projectId?: string; roleId?: string }
  ): Promise<ProjectRoleBinding[]> {
    return this.repo("project_role_bindings").list(filters);
  }
  async createProjectRoleBinding(binding: ProjectRoleBinding): Promise<ProjectRoleBinding> {
    return this.repo("project_role_bindings").create(binding);
  }
  async deleteProjectRoleBinding(bindingId: string): Promise<void> {
    await this.repo("project_role_bindings").delete(bindingId);
  }
  async listRepositoryRoleBindings(
    filters?: { userId?: string; repositoryId?: string; roleId?: string }
  ): Promise<RepositoryRoleBinding[]> {
    return this.repo("repository_role_bindings").list(filters);
  }
  async createRepositoryRoleBinding(binding: RepositoryRoleBinding): Promise<RepositoryRoleBinding> {
    return this.repo("repository_role_bindings").create(binding);
  }
  async deleteRepositoryRoleBinding(bindingId: string): Promise<void> {
    await this.repo("repository_role_bindings").delete(bindingId);
  }
  async listDelegatedPermissions(
    filters?: { granteeUserId?: string; permission?: string; scopeType?: string; scopeId?: string }
  ): Promise<DelegatedPermission[]> {
    return this.repo("delegated_permissions").list(filters);
  }
  async createDelegatedPermission(permission: DelegatedPermission): Promise<DelegatedPermission> {
    return this.repo("delegated_permissions").create(permission);
  }
  async updateDelegatedPermission(
    delegatedPermissionId: string,
    patch: Partial<DelegatedPermission>
  ): Promise<DelegatedPermission> {
    return this.repo("delegated_permissions").update(delegatedPermissionId, patch);
  }
  async createOidcAuthState(state: OidcAuthState): Promise<OidcAuthState> {
    return this.repo("oidc_auth_states").create(state);
  }
  async getOidcAuthStateByState(stateValue: string): Promise<OidcAuthState | null> {
    const rows = await this.repo("oidc_auth_states").list({ state: stateValue });
    return rows[0] ?? null;
  }
  async updateOidcAuthState(stateId: string, patch: Partial<OidcAuthState>): Promise<OidcAuthState> {
    return this.repo("oidc_auth_states").update(stateId, patch);
  }
  getRunEvents(runId: string): RunEvent[] { return this.runEvents[runId] ?? []; }

  private repo<K extends TableName>(table: K) {
    if (!this.database) {
      throw new Error("ApiStore not initialized. Call initialize() before use.");
    }
    return this.database.repository(table);
  }

  private async seedIfEmpty(): Promise<void> {
    await this.seedTable("secrets", this.seed.secrets);
    await this.seedTable("schema_docs", this.seed.schemaDocs);
    await this.seedTable("environments", this.seed.environments);
    await this.seedTable("machines", this.seed.machines);
    await this.seedTable("local_repositories", this.seed.localRepositories);
    await this.seedTable("version_snapshots", this.seed.versionSnapshots);
    await this.seedTable("agents", this.seed.agents);
    await this.seedTable("projects", this.seed.projects);
    await this.seedTable("repositories", this.seed.repositories);
    await this.seedTable("roadmap_items", this.seed.roadmap);
    await this.seedTable("tasks", this.seed.tasks);
    await this.seedTable("task_runs", this.seed.runs);
    await this.seedTable("approvals", this.seed.approvals);
    await this.seedTable("artifacts", this.seed.artifacts);
    await this.seedTable("verification_results", this.seed.verificationResults);
    await this.seedTable("verification_steps", this.seed.verificationSteps);
    await this.seedTable("knowledge_nodes", this.seed.knowledgeNodes);
    await this.seedTable("knowledge_configs", this.seed.knowledgeConfigs);
    await this.seedTable("memory_entries", this.seed.memoryEntries);
    await this.seedTable("memory_chunks", this.seed.memoryChunks);
    await this.seedTable("retrieval_query_logs", this.seed.retrievalLogs);
    await this.seedTable("research_notes", this.seed.researchNotes);
    await this.seedTable("policies", this.seed.policies);
    await this.seedTable("routing_rules", this.seed.routingRules);
    await this.seedTable("chat_threads", this.seed.chatThreads);
    await this.seedTable("chat_messages", this.seed.chatMessages);
    await this.seedTable("provider_configs", this.seed.providerConfigs);
    await this.seedTable("provider_capabilities", this.seed.providerCapabilities);
    await this.seedTable("provider_models", this.seed.providerModels);
    await this.seedTable("project_provider_bindings", this.seed.providerBindings);
    await this.seedTable("provider_healthchecks", this.seed.providerHealthchecks);
    await this.seedTable("provider_discovery_logs", this.seed.providerDiscoveryLogs);
    await this.seedTable("autoresearch_experiments", this.seed.experiments);
    await this.seedTable("autoresearch_runs", this.seed.experimentRuns);
    await this.seedTable("users", this.seed.users);
    await this.seedTable("roles", this.seed.roles);
    await this.seedTable("user_roles", this.seed.userRoles);
    await this.seedTable("tenants", this.seed.tenants);
    await this.seedTable("user_tenants", this.seed.userTenants);
    await this.seedTable("jobs", this.seed.jobs);
    await this.seedTable("sessions", this.seed.sessions);
    await this.seedTable("audit_events", this.seed.auditEvents);
    await this.seedTable("project_role_bindings", this.seed.projectRoleBindings);
    await this.seedTable("repository_role_bindings", this.seed.repositoryRoleBindings);
    await this.seedTable("delegated_permissions", this.seed.delegatedPermissions);
    await this.seedTable("oidc_auth_states", this.seed.oidcAuthStates);
    await this.seedTable("skills", this.seed.skills);
    await this.seedTable("subprompts", this.seed.subprompts);
    await this.seedTable("brainstorm_sessions", this.seed.brainstormSessions);
    await this.seedTable("brainstorm_plans", this.seed.brainstormPlans);
    await this.seedTable("mcp_connections", this.seed.mcpConnections);
    await this.seedTable("mcp_delegation_runs", this.seed.mcpDelegationRuns);
  }

  private async seedTable<K extends TableName>(table: K, rows: DatabaseTables[K][]): Promise<void> {
    const repo = this.repo(table);
    const existing = await repo.list();
    if (existing.length > 0) {
      return;
    }

    for (const row of rows) {
      await repo.create(row);
    }
  }
}

export const apiStore = new ApiStore();
