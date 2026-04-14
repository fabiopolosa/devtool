import { randomUUID } from "node:crypto";
import type { SchemaDoc, SchemaDocConvention, SchemaDocTable } from "@cp/domain";

export interface SchemaDocStore {
  listSchemaDocs(): Promise<SchemaDoc[]>;
  getSchemaDocById(id: string): Promise<SchemaDoc | null>;
  createSchemaDoc(doc: SchemaDoc): Promise<SchemaDoc>;
  updateSchemaDoc(id: string, patch: Partial<SchemaDoc>): Promise<SchemaDoc>;
}

export interface SchemaIntrospectionResult {
  databaseName: string;
  dialect: string;
  tables: SchemaDocTable[];
}

export interface SchemaIntrospector {
  introspect(): Promise<SchemaIntrospectionResult>;
}

export interface SchemaDocsServiceOptions {
  store: SchemaDocStore;
  introspector: SchemaIntrospector;
  now?: () => Date;
  idGenerator?: () => string;
}

export interface UpsertSchemaDocInput {
  id?: string;
  title: string;
  description: string;
  conventions?: SchemaDocConvention[];
  stackNotes?: string[];
}

export class SchemaDocsService {
  private readonly now: () => Date;
  private readonly idGenerator: () => string;

  constructor(private readonly options: SchemaDocsServiceOptions) {
    this.now = options.now ?? (() => new Date());
    this.idGenerator = options.idGenerator ?? (() => randomUUID());
  }

  async listSchemaDocs(): Promise<SchemaDoc[]> {
    return this.options.store.listSchemaDocs();
  }

  async getSchemaDoc(docId: string): Promise<SchemaDoc | null> {
    return this.options.store.getSchemaDocById(docId);
  }

  async introspectAndStore(input: UpsertSchemaDocInput, actor: string): Promise<SchemaDoc> {
    const nowIso = this.now().toISOString();
    const details = await this.options.introspector.introspect();
    const id = input.id ?? this.idGenerator();
    const existing = await this.options.store.getSchemaDocById(id);

    if (!existing) {
      const created: SchemaDoc = {
        id,
        title: input.title.trim(),
        description: input.description.trim(),
        databaseName: details.databaseName,
        dialect: details.dialect,
        tables: details.tables,
        conventions: input.conventions ?? [],
        stackNotes: input.stackNotes ?? [],
        lastIntrospectedAt: nowIso,
        createdAt: nowIso,
        createdBy: actor,
        updatedAt: nowIso,
        updatedBy: actor
      };
      return this.options.store.createSchemaDoc(created);
    }

    return this.options.store.updateSchemaDoc(existing.id, {
      title: input.title.trim(),
      description: input.description.trim(),
      databaseName: details.databaseName,
      dialect: details.dialect,
      tables: details.tables,
      conventions: input.conventions ?? existing.conventions,
      stackNotes: input.stackNotes ?? existing.stackNotes,
      lastIntrospectedAt: nowIso,
      updatedAt: nowIso,
      updatedBy: actor
    });
  }
}
