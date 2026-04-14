import type { SchemaDocTable } from "@cp/domain";

interface QueryRow {
  [key: string]: unknown;
}

export interface SqlQueryRunner {
  query<T extends QueryRow = QueryRow>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
}

export interface PostgresSchemaIntrospectorOptions {
  runner: SqlQueryRunner;
  schemaName?: string;
  databaseName: string;
}

interface ColumnRow extends QueryRow {
  table_name: string;
  column_name: string;
  data_type: string;
  is_nullable: string;
  column_default: string | null;
}

interface PrimaryKeyRow extends QueryRow {
  table_name: string;
  column_name: string;
}

export class PostgresSchemaIntrospector {
  constructor(private readonly options: PostgresSchemaIntrospectorOptions) {}

  async introspect(): Promise<{ databaseName: string; dialect: string; tables: SchemaDocTable[] }> {
    const schemaName = this.options.schemaName ?? "public";

    const [columnsResult, primaryKeysResult] = await Promise.all([
      this.options.runner.query<ColumnRow>(
        `
        SELECT table_name, column_name, data_type, is_nullable, column_default
        FROM information_schema.columns
        WHERE table_schema = $1
        ORDER BY table_name, ordinal_position
        `,
        [schemaName]
      ),
      this.options.runner.query<PrimaryKeyRow>(
        `
        SELECT kcu.table_name, kcu.column_name
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
          ON tc.constraint_name = kcu.constraint_name
         AND tc.table_schema = kcu.table_schema
        WHERE tc.constraint_type = 'PRIMARY KEY'
          AND tc.table_schema = $1
        ORDER BY kcu.table_name, kcu.ordinal_position
        `,
        [schemaName]
      )
    ]);

    const columnsByTable = new Map<string, SchemaDocTable["columns"]>();
    for (const row of columnsResult.rows) {
      const tableName = String(row.table_name);
      const list = columnsByTable.get(tableName) ?? [];
      list.push({
        name: String(row.column_name),
        dataType: String(row.data_type),
        nullable: String(row.is_nullable).toUpperCase() === "YES",
        ...(row.column_default ? { defaultValue: String(row.column_default) } : {})
      });
      columnsByTable.set(tableName, list);
    }

    const primaryKeysByTable = new Map<string, string[]>();
    for (const row of primaryKeysResult.rows) {
      const tableName = String(row.table_name);
      const list = primaryKeysByTable.get(tableName) ?? [];
      list.push(String(row.column_name));
      primaryKeysByTable.set(tableName, list);
    }

    const tables = [...columnsByTable.entries()].map(([tableName, columns]) => ({
      tableName,
      schemaName,
      columns,
      primaryKeyColumns: primaryKeysByTable.get(tableName) ?? []
    }));

    return {
      databaseName: this.options.databaseName,
      dialect: "postgresql",
      tables
    };
  }
}
