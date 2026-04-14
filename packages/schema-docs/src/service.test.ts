import type { SchemaDoc } from "@cp/domain";
import { describe, expect, it } from "vitest";
import { SchemaDocsService, type SchemaDocStore, type SchemaIntrospector } from "./service.js";

class InMemorySchemaDocStore implements SchemaDocStore {
  private readonly map = new Map<string, SchemaDoc>();

  async listSchemaDocs(): Promise<SchemaDoc[]> {
    return [...this.map.values()];
  }

  async getSchemaDocById(id: string): Promise<SchemaDoc | null> {
    return this.map.get(id) ?? null;
  }

  async createSchemaDoc(doc: SchemaDoc): Promise<SchemaDoc> {
    this.map.set(doc.id, doc);
    return doc;
  }

  async updateSchemaDoc(id: string, patch: Partial<SchemaDoc>): Promise<SchemaDoc> {
    const existing = this.map.get(id);
    if (!existing) {
      throw new Error("missing");
    }
    const next = { ...existing, ...patch };
    this.map.set(id, next);
    return next;
  }
}

const introspector: SchemaIntrospector = {
  async introspect() {
    return {
      databaseName: "devtool",
      dialect: "postgresql",
      tables: [
        {
          tableName: "projects",
          schemaName: "public",
          columns: [
            { name: "id", dataType: "text", nullable: false },
            { name: "name", dataType: "text", nullable: false }
          ],
          primaryKeyColumns: ["id"]
        }
      ]
    };
  }
};

describe("SchemaDocsService", () => {
  it("introspects and stores schema docs", async () => {
    const service = new SchemaDocsService({
      store: new InMemorySchemaDocStore(),
      introspector,
      now: () => new Date("2026-04-14T00:00:00.000Z"),
      idGenerator: () => "schema-doc-1"
    });

    const created = await service.introspectAndStore(
      {
        title: "Main DB",
        description: "Primary schema",
        conventions: [{ key: "table_naming", value: "snake_case plural" }]
      },
      "tester"
    );

    expect(created.id).toBe("schema-doc-1");
    expect(created.tables).toHaveLength(1);
    expect(created.tables[0]?.tableName).toBe("projects");
  });
});
