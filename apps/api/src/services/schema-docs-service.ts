import { createPostgresClient } from "@cp/db";
import type { SchemaDoc } from "@cp/domain";
import {
  PostgresSchemaIntrospector,
  SchemaDocsService,
  type SchemaDocStore,
  type SchemaIntrospector
} from "@cp/schema-docs";
import { apiStore } from "./api-store.js";

class ApiSchemaDocStoreAdapter implements SchemaDocStore {
  async listSchemaDocs(): Promise<SchemaDoc[]> {
    return apiStore.listSchemaDocs();
  }

  async getSchemaDocById(id: string): Promise<SchemaDoc | null> {
    return apiStore.getSchemaDoc(id);
  }

  async createSchemaDoc(doc: SchemaDoc): Promise<SchemaDoc> {
    return apiStore.createSchemaDoc(doc);
  }

  async updateSchemaDoc(id: string, patch: Partial<SchemaDoc>): Promise<SchemaDoc> {
    return apiStore.updateSchemaDoc(id, patch);
  }
}

const inMemoryIntrospector: SchemaIntrospector = {
  async introspect() {
    return {
      databaseName: "in_memory",
      dialect: "in_memory",
      tables: []
    };
  }
};

const resolveDatabaseName = (): string => {
  const connectionString = process.env.DATABASE_URL?.trim();
  if (!connectionString) return "devtool";
  try {
    const parsed = new URL(connectionString);
    const fromPath = parsed.pathname.replace(/^\//, "").trim();
    return fromPath || "devtool";
  } catch {
    return "devtool";
  }
};

const createIntrospector = (): SchemaIntrospector => {
  if (process.env.API_STORE_MODE === "in_memory") {
    return inMemoryIntrospector;
  }
  const client = createPostgresClient();
  return new PostgresSchemaIntrospector({
    databaseName: resolveDatabaseName(),
    runner: {
      query: async (sql: string, params?: unknown[]) => client.pool.query(sql, params)
    }
  });
};

export const schemaDocsService = new SchemaDocsService({
  store: new ApiSchemaDocStoreAdapter(),
  introspector: createIntrospector()
});
