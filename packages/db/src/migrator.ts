import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import type { Pool } from "pg";

const MIGRATION_TABLE = "cp_schema_migrations";

export interface MigrationRunnerOptions {
  pool: Pool;
  migrationsDir?: string;
  logger?: Pick<Console, "info" | "warn" | "error">;
}

export interface AppliedMigration {
  filename: string;
  appliedAt: string;
}

const defaultLogger: Pick<Console, "info" | "warn" | "error"> = console;

export async function runDatabaseMigrations(options: MigrationRunnerOptions): Promise<AppliedMigration[]> {
  const logger = options.logger ?? defaultLogger;
  const migrationsDir = options.migrationsDir ?? path.resolve(process.cwd(), "packages/db/migrations");

  await options.pool.query(`
    CREATE TABLE IF NOT EXISTS ${MIGRATION_TABLE} (
      filename TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  const appliedRows = await options.pool.query<{ filename: string; applied_at: string }>(
    `SELECT filename, applied_at FROM ${MIGRATION_TABLE} ORDER BY filename ASC`
  );
  const applied = new Set(appliedRows.rows.map((row) => row.filename));

  const dirEntries = await readdir(migrationsDir, { withFileTypes: true });
  const files = dirEntries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".sql"))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));

  for (const file of files) {
    if (applied.has(file)) {
      continue;
    }

    const fullPath = path.join(migrationsDir, file);
    const sql = await readFile(fullPath, "utf8");

    logger.info(`[db:migrate] applying ${file}`);
    const client = await options.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(sql);
      await client.query(`INSERT INTO ${MIGRATION_TABLE} (filename) VALUES ($1)`, [file]);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      logger.error(`[db:migrate] failed ${file}`);
      throw error;
    } finally {
      client.release();
    }
  }

  const finalRows = await options.pool.query<{ filename: string; applied_at: string }>(
    `SELECT filename, applied_at FROM ${MIGRATION_TABLE} ORDER BY filename ASC`
  );

  return finalRows.rows.map((row) => ({ filename: row.filename, appliedAt: row.applied_at }));
}
