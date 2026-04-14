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
import type {
  AuditEvent,
  Approval,
  Artifact,
  AutoResearchExperiment,
  AutoResearchRun,
  ChatMessage,
  ChatThread,
  DelegatedPermission,
  MemoryChunk,
  MemoryEntry,
  Policy,
  OidcAuthState,
  ProviderCapability,
  ProviderConfig,
  ProviderHealthcheck,
  ProviderModel,
  Project,
  ProjectProviderBinding,
  ProjectRoleBinding,
  RepositoryRoleBinding,
  Repository,
  Role,
  RetrievalQueryLog,
  ResearchNote,
  RoutingRule,
  RoadmapItem,
  Session,
  Skill,
  Task,
  TaskRun,
  User,
  UserRole,
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
  async getProject(projectId: string): Promise<Project | null> { return this.repo("projects").getById(projectId); }
  async createProject(project: Project): Promise<Project> { return this.repo("projects").create(project); }
  async updateProject(projectId: string, patch: Partial<Project>): Promise<Project> {
    return this.repo("projects").update(projectId, patch);
  }
  async listRepositories(): Promise<Repository[]> { return this.repo("repositories").list(); }
  async getRepository(repositoryId: string): Promise<Repository | null> { return this.repo("repositories").getById(repositoryId); }
  async listRoadmap(projectId?: string): Promise<RoadmapItem[]> { return this.repo("roadmap_items").list(projectId ? { projectId } : undefined); }
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
  async listMemoryEntries(projectId?: string): Promise<MemoryEntry[]> { return this.repo("memory_entries").list(projectId ? { projectId } : undefined); }
  async listMemoryChunks(projectId?: string): Promise<MemoryChunk[]> { return this.repo("memory_chunks").list(projectId ? { projectId } : undefined); }
  async listRetrievalLogs(projectId?: string): Promise<RetrievalQueryLog[]> { return this.repo("retrieval_query_logs").list(projectId ? { projectId } : undefined); }
  async listResearchNotes(projectId?: string): Promise<ResearchNote[]> { return this.repo("research_notes").list(projectId ? { projectId } : undefined); }
  async listPolicies(): Promise<Policy[]> { return this.repo("policies").list(); }
  async listRoutingRules(): Promise<RoutingRule[]> { return this.repo("routing_rules").list(); }
  async listThreads(projectId?: string): Promise<ChatThread[]> { return this.repo("chat_threads").list(projectId ? { projectId } : undefined); }
  async listMessages(threadId?: string): Promise<ChatMessage[]> { return this.repo("chat_messages").list(threadId ? { threadId } : undefined); }
  async listProviderConfigs(): Promise<ProviderConfig[]> { return this.repo("provider_configs").list(); }
  async listProviderCapabilities(): Promise<ProviderCapability[]> { return this.repo("provider_capabilities").list(); }
  async listProviderModels(): Promise<ProviderModel[]> { return this.repo("provider_models").list(); }
  async listProviderBindings(projectId?: string): Promise<ProjectProviderBinding[]> { return this.repo("project_provider_bindings").list(projectId ? { projectId } : undefined); }
  async listProviderHealthchecks(): Promise<ProviderHealthcheck[]> { return this.repo("provider_healthchecks").list(); }
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
    await this.seedTable("projects", this.seed.projects);
    await this.seedTable("repositories", this.seed.repositories);
    await this.seedTable("roadmap_items", this.seed.roadmap);
    await this.seedTable("tasks", this.seed.tasks);
    await this.seedTable("task_runs", this.seed.runs);
    await this.seedTable("approvals", this.seed.approvals);
    await this.seedTable("artifacts", this.seed.artifacts);
    await this.seedTable("verification_results", this.seed.verificationResults);
    await this.seedTable("verification_steps", this.seed.verificationSteps);
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
    await this.seedTable("autoresearch_experiments", this.seed.experiments);
    await this.seedTable("autoresearch_runs", this.seed.experimentRuns);
    await this.seedTable("users", this.seed.users);
    await this.seedTable("roles", this.seed.roles);
    await this.seedTable("user_roles", this.seed.userRoles);
    await this.seedTable("sessions", this.seed.sessions);
    await this.seedTable("audit_events", this.seed.auditEvents);
    await this.seedTable("project_role_bindings", this.seed.projectRoleBindings);
    await this.seedTable("repository_role_bindings", this.seed.repositoryRoleBindings);
    await this.seedTable("delegated_permissions", this.seed.delegatedPermissions);
    await this.seedTable("oidc_auth_states", this.seed.oidcAuthStates);
    await this.seedTable("skills", this.seed.skills);
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
