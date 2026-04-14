import path from "node:path";
import { createPgPool } from "../client.js";
import { runDatabaseMigrations } from "../migrator.js";

const pool = createPgPool();

try {
  const applied = await runDatabaseMigrations({
    pool,
    migrationsDir: path.resolve(process.cwd(), "migrations")
  });

  console.info(`[db:migrate] complete (${applied.length} migrations tracked)`);
} catch (error) {
  console.error("[db:migrate] failed", error);
  process.exitCode = 1;
} finally {
  await pool.end();
}
