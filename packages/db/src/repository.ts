import { and, eq, getTableColumns } from "drizzle-orm";
import type { AnyPgTable } from "drizzle-orm/pg-core";
import type { DrizzleDatabase, PostgresClient } from "./client.js";
import { createPostgresClient } from "./client.js";
import {
  agents,
  auditEvents,
  approvals,
  artifacts,
  autoresearchExperiments,
  autoresearchRuns,
  chatMessages,
  chatThreads,
  delegatedPermissions,
  embeddingJobs,
  memoryChunks,
  memoryEntries,
  modelRoutingPreferences,
  oidcAuthStates,
  policies,
  projectProviderBindings,
  projectRoleBindings,
  projectRepositoryLinks,
  projects,
  promptVersions,
  providerCapabilities,
  providerConfigs,
  providerHealthchecks,
  providerModels,
  repositoryRoleBindings,
  repositories,
  roles,
  researchNotes,
  retrievalQueryLogs,
  roadmapItems,
  routingRules,
  sessions,
  skills,
  tasks,
  taskRuns,
  userRoles,
  users,
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
  embedding_jobs: embeddingJobs,
  retrieval_query_logs: retrievalQueryLogs,
  research_notes: researchNotes,
  policies,
  prompt_versions: promptVersions,
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
  project_role_bindings: projectRoleBindings,
  repository_role_bindings: repositoryRoleBindings,
  delegated_permissions: delegatedPermissions,
  oidc_auth_states: oidcAuthStates,
  skills
};

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

  constructor(
    private readonly db: DrizzleDatabase,
    private readonly table: AnyPgTable,
    private readonly tableName: string
  ) {
    this.columns = getTableColumns(table) as Record<string, unknown>;
  }

  async getById(id: string): Promise<T | null> {
    const idColumn = this.columns.id;
    if (!idColumn) {
      throw new Error(`Table ${this.tableName} does not expose an id column`);
    }

    const rows = await this.db
      .select()
      .from(this.table)
      .where(eq(idColumn as never, id as never))
      .limit(1);

    const row = rows[0];
    return row ? (row as T) : null;
  }

  async list(filters?: Record<string, unknown>): Promise<T[]> {
    const where = buildWhereFromFilters(this.table, filters);
    const rows = where
      ? await this.db.select().from(this.table).where(where)
      : await this.db.select().from(this.table);

    return rows as T[];
  }

  async create(record: T): Promise<T> {
    await this.db.insert(this.table).values(sanitizeRecord(record as Record<string, unknown>) as never);
    return record;
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
      .where(eq(idColumn as never, id as never));

    return next;
  }

  async delete(id: string): Promise<void> {
    const idColumn = this.columns.id;
    if (!idColumn) {
      throw new Error(`Table ${this.tableName} does not expose an id column`);
    }

    await this.db.delete(this.table).where(eq(idColumn as never, id as never));
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

  async getById(id: string): Promise<T | null> {
    return this.store.get(id) ?? null;
  }

  async list(filters?: Record<string, unknown>): Promise<T[]> {
    const values = [...this.store.values()];
    if (!filters) return values;

    return values.filter((record) =>
      Object.entries(filters).every(([key, value]) => {
        if (value === undefined) return true;
        return (record as Record<string, unknown>)[key] === value;
      })
    );
  }

  async create(record: T): Promise<T> {
    this.store.set(record.id, record);
    return record;
  }

  async update(id: string, patch: Partial<T>): Promise<T> {
    const existing = this.store.get(id);
    if (!existing) {
      throw new Error(`Record not found: ${id}`);
    }

    const next = { ...existing, ...patch } as T;
    this.store.set(id, next);
    return next;
  }

  async delete(id: string): Promise<void> {
    this.store.delete(id);
  }
}

export class InMemoryDatabase implements DatabasePort {
  private readonly repositories = new Map<TableName, RepositoryPort<DatabaseTables[TableName]>>();

  repository<K extends TableName>(table: K): RepositoryPort<DatabaseTables[K]> {
    if (!this.repositories.has(table)) {
      this.repositories.set(table, new InMemoryRepository<DatabaseTables[K]>());
    }

    return this.repositories.get(table) as RepositoryPort<DatabaseTables[K]>;
  }
}
