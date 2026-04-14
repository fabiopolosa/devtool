import { drizzle } from "drizzle-orm/node-postgres";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { loadEnv } from "@cp/config";
import * as schema from "./schema.js";

export type DrizzleDatabase = NodePgDatabase<typeof schema>;

export interface PostgresClient {
  pool: Pool;
  db: DrizzleDatabase;
}

export const createPgPool = (connectionString = loadEnv().DATABASE_URL): Pool =>
  new Pool({ connectionString });

export const createPostgresClient = (connectionString = loadEnv().DATABASE_URL): PostgresClient => {
  const pool = createPgPool(connectionString);
  const db = drizzle(pool, { schema });
  return { pool, db };
};
