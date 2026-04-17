import { and, eq, getTableColumns } from "drizzle-orm";
import type { AnyPgTable } from "drizzle-orm/pg-core";
import type { DrizzleDatabase, PostgresClient } from "./client.js";
import { createPostgresClient } from "./client.js";
import { DEFAULT_TENANT_ID, getCurrentTenantId } from "./tenant-context.js";
import {
  agents,
  environments,
  auditEvents,
  approvals,
  artifacts,
  autoresearchExperiments,
  autoresearchRuns,
  brainstormPlans,
  brainstormSessions,
  codingWorkflows,
  chatMessages,
  chatThreads,
  delegatedPermissions,
  embeddingJobs,
  knowledgeConfigs,
  knowledgeNodes,
  contextNotes,
  localRepositories,
  memoryChunks,
  memoryEntries,
  machines,
  workspaces,
  mcpConnections,
  mcpDelegationRuns,
  modelRoutingPreferences,
  oidcAuthStates,
  policies,
  jobs,
  projectProviderBindings,
  projectRoleBindings,
  projectRepositoryLinks,
  projects,
  promptVersions,
  promptRegistry,
  providerCapabilities,
  providerConfigs,
  providerDiscoveryLogs,
  providerHealthchecks,
  providerModels,
  repositoryRoleBindings,
  usageEvents,
  repositories,
  roles,
  researchNotes,
  schemaDocs,
  secrets,
  subprompts,
  retrievalQueryLogs,
  roadmapItems,
  routingRules,
  sessions,
  skills,
  tasks,
  tenants,
  taskRuns,
  userTenants,
  userRoles,
  users,
  versionSnapshots,
  verificationResults,
  verificationSteps
} from "./schema.js";
import type { DatabaseTables, TableName } from "./types.js";

export interface RepositoryPort<T> {
  getById(id: string): Promise<T | null>;
  list(filters?: Record<string, unknown>): Promise<T[]>;
  create(record: T): Promise<T>;
  update(id: string, patch: Partial<T>): Promise<T>;
  delete(id: string): Promise<void>;
}

export interface DatabasePort {
  repository<K extends TableName>(table: K): RepositoryPort<DatabaseTables[K]>;
  close?(): Promise<void>;
}

const tableMap: Record<TableName, AnyPgTable> = {
  agents,
  secrets,
  schema_docs: schemaDocs,
  environments,
  machines,
  workspaces,
  local_repositories: localRepositories,
  version_snapshots: versionSnapshots,
  projects,
  repositories,
  project_repository_links: projectRepositoryLinks,
  roadmap_items: roadmapItems,
  tasks,
  task_runs: taskRuns,
  artifacts,
  verification_results: verificationResults,
  verification_steps: verificationSteps,
  memory_entries: memoryEntries,
  memory_chunks: memoryChunks,
  knowledge_nodes: knowledgeNodes,
  knowledge_configs: knowledgeConfigs,
  context_notes: contextNotes,
  embedding_jobs: embeddingJobs,
  retrieval_query_logs: retrievalQueryLogs,
  research_notes: researchNotes,
  policies,
  prompt_versions: promptVersions,
  prompt_registry: promptRegistry,
  routing_rules: routingRules,
  autoresearch_experiments: autoresearchExperiments,
  autoresearch_runs: autoresearchRuns,
  approvals,
  chat_threads: chatThreads,
  chat_messages: chatMessages,
  provider_configs: providerConfigs,
  provider_capabilities: providerCapabilities,
  provider_models: providerModels,
  project_provider_bindings: projectProviderBindings,
  provider_healthchecks: providerHealthchecks,
  model_routing_preferences: modelRoutingPreferences,
  users,
  roles,
  user_roles: userRoles,
  sessions,
  audit_events: auditEvents,
  usage_events: usageEvents,
  project_role_bindings: projectRoleBindings,
  repository_role_bindings: repositoryRoleBindings,
  delegated_permissions: delegatedPermissions,
  oidc_auth_states: oidcAuthStates,
  skills,
  provider_discovery_logs: providerDiscoveryLogs,
  brainstorm_sessions: brainstormSessions,
  brainstorm_plans: brainstormPlans,
  coding_workflows: codingWorkflows,
  mcp_connections: mcpConnections,
  mcp_delegation_runs: mcpDelegationRuns,
  subprompts,
  tenants,
  user_tenants: userTenants,
  jobs
};

const tenantAwareTables = new Set<TableName>([
  "provider_configs",
  "workspaces",
  "skills",
  "projects",
  "repositories",
  "project_repository_links",
  "roadmap_items",
  "tasks",
  "task_runs",
  "approvals",
  "artifacts",
  "provider_configs",
  "brainstorm_sessions",
  "brainstorm_plans",
  "context_notes",
  "coding_workflows",
  "prompt_registry",
  "knowledge_configs",
  "audit_events",
  "usage_events",
  "jobs"
]);

const sanitizeRecord = (value: Record<string, unknown>): Record<string, unknown> =>
  Object.fromEntries(Object.entries(value).filter(([, entryValue]) => entryValue !== undefined));

const buildWhereFromFilters = (table: AnyPgTable, filters?: Record<string, unknown>) => {
  if (!filters || Object.keys(filters).length === 0) {
    return undefined;
  }

  const columns = getTableColumns(table) as Record<string, unknown>;
  const clauses = Object.entries(filters)
    .filter(([, value]) => value !== undefined)
    .flatMap(([key, value]) => {
      const column = columns[key];
      if (!column) return [];
      return [eq(column as never, value as never)];
    });

  if (clauses.length === 0) return undefined;
  if (clauses.length === 1) return clauses[0];
  return and(...clauses);
};

class PostgresTableRepository<T extends { id: string }> implements RepositoryPort<T> {
  private readonly columns: Record<string, unknown>;
  private readonly tenantColumn: unknown;

  constructor(
    private readonly db: DrizzleDatabase,
    private readonly table: AnyPgTable,
    private readonly tableName: string
  ) {
    this.columns = getTableColumns(table) as Record<string, unknown>;
    this.tenantColumn = this.columns.tenantId;
  }

  private tenantId(): string {
    return getCurrentTenantId() ?? DEFAULT_TENANT_ID;
  }

  private scopedWhere(baseWhere?: unknown): unknown {
    if (!this.tenantColumn) {
      return baseWhere;
    }
    const tenantWhere = eq(this.tenantColumn as never, this.tenantId() as never);
    if (!baseWhere) return tenantWhere;
    return and(tenantWhere, baseWhere as never);
  }

  async getById(id: string): Promise<T | null> {
    const idColumn = this.columns.id;
    if (!idColumn) {
      throw new Error(`Table ${this.tableName} does not expose an id column`);
    }

    const rows = await this.db
      .select()
      .from(this.table)
      .where(this.scopedWhere(eq(idColumn as never, id as never)) as never)
      .limit(1);

    const row = rows[0];
    return row ? (row as T) : null;
  }

  async list(filters?: Record<string, unknown>): Promise<T[]> {
    const where = buildWhereFromFilters(this.table, filters);
    const scoped = this.scopedWhere(where);
    const rows = scoped
      ? await this.db.select().from(this.table).where(scoped as never)
      : await this.db.select().from(this.table);

    return rows as T[];
  }

  async create(record: T): Promise<T> {
    const next = this.tenantColumn
      ? ({ ...record, tenantId: (record as Record<string, unknown>).tenantId ?? this.tenantId() } as T)
      : record;
    await this.db.insert(this.table).values(sanitizeRecord(next as Record<string, unknown>) as never);
    return next;
  }

  async update(id: string, patch: Partial<T>): Promise<T> {
    const existing = await this.getById(id);
    if (!existing) {
      throw new Error(`Record not found: ${this.tableName}/${id}`);
    }

    const next = { ...existing, ...patch } as T;
    const idColumn = this.columns.id;
    if (!idColumn) {
      throw new Error(`Table ${this.tableName} does not expose an id column`);
    }

    await this.db
      .update(this.table)
      .set(sanitizeRecord(next as Record<string, unknown>) as never)
      .where(this.scopedWhere(eq(idColumn as never, id as never)) as never);

    return next;
  }

  async delete(id: string): Promise<void> {
    const idColumn = this.columns.id;
    if (!idColumn) {
      throw new Error(`Table ${this.tableName} does not expose an id column`);
    }

    await this.db.delete(this.table).where(this.scopedWhere(eq(idColumn as never, id as never)) as never);
  }
}

export class PostgresDatabase implements DatabasePort {
  private readonly repositories = new Map<TableName, RepositoryPort<DatabaseTables[TableName]>>();

  constructor(private readonly client: PostgresClient) {}

  repository<K extends TableName>(table: K): RepositoryPort<DatabaseTables[K]> {
    if (!this.repositories.has(table)) {
      const resolvedTable = tableMap[table];
      this.repositories.set(
        table,
        new PostgresTableRepository<DatabaseTables[K]>(this.client.db, resolvedTable, table)
      );
    }

    return this.repositories.get(table) as RepositoryPort<DatabaseTables[K]>;
  }

  async close(): Promise<void> {
    await this.client.pool.end();
  }
}

export const createPostgresDatabase = (connectionString?: string): PostgresDatabase =>
  new PostgresDatabase(createPostgresClient(connectionString));

export class InMemoryRepository<T extends { id: string }> implements RepositoryPort<T> {
  private readonly store = new Map<string, T>();

  constructor(private readonly tenantAware: boolean) {}

  private tenantId(): string {
    return getCurrentTenantId() ?? DEFAULT_TENANT_ID;
  }

  private recordVisible(record: T): boolean {
    if (!this.tenantAware) return true;
    return (record as Record<string, unknown>).tenantId === this.tenantId();
  }

  async getById(id: string): Promise<T | null> {
    const record = this.store.get(id);
    if (!record) return null;
    return this.recordVisible(record) ? record : null;
  }

  async list(filters?: Record<string, unknown>): Promise<T[]> {
    const values = [...this.store.values()].filter((record) => this.recordVisible(record));
    if (!filters) return values;

    return values.filter((record) =>
      Object.entries(filters).every(([key, value]) => {
        if (value === undefined) return true;
        return (record as Record<string, unknown>)[key] === value;
      })
    );
  }

  async create(record: T): Promise<T> {
    const next = this.tenantAware
      ? ({ ...record, tenantId: (record as Record<string, unknown>).tenantId ?? this.tenantId() } as T)
      : record;
    this.store.set(next.id, next);
    return next;
  }

  async update(id: string, patch: Partial<T>): Promise<T> {
    const existing = await this.getById(id);
    if (!existing) {
      throw new Error(`Record not found: ${id}`);
    }

    const next = { ...existing, ...patch } as T;
    this.store.set(id, next);
    return next;
  }

  async delete(id: string): Promise<void> {
    const existing = await this.getById(id);
    if (!existing) return;
    this.store.delete(id);
  }
}

export class InMemoryDatabase implements DatabasePort {
  private readonly repositories = new Map<TableName, RepositoryPort<DatabaseTables[TableName]>>();

  repository<K extends TableName>(table: K): RepositoryPort<DatabaseTables[K]> {
    if (!this.repositories.has(table)) {
      this.repositories.set(
        table,
        new InMemoryRepository<DatabaseTables[K]>(tenantAwareTables.has(table))
      );
    }

    return this.repositories.get(table) as RepositoryPort<DatabaseTables[K]>;
  }
}
