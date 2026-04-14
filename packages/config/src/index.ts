import { readFileSync } from "node:fs";
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  LOG_LEVEL: z.string().default("info"),
  API_PORT: z.coerce.number().int().positive().default(4000),
  API_STORE_MODE: z.enum(["postgres", "in_memory"]).default("postgres"),
  WEB_ORIGIN: z.string().default("http://localhost:5173"),
  AUTH_ENABLED: z
    .string()
    .optional()
    .transform((value) => {
      if (!value) return false;
      const normalized = value.trim().toLowerCase();
      return normalized === "1" || normalized === "true" || normalized === "yes";
    }),
  AUTH_SESSION_TTL_HOURS: z.coerce.number().int().positive().default(24),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  ARTIFACT_STORAGE_BACKEND: z.enum(["local", "s3"]).default("local"),
  ARTIFACT_STORAGE_LOCAL_ROOT: z.string().default("./artifacts/runtime"),
  SECRETS_MASTER_KEY: z.string().min(16),
  OPENAI_API_KEY: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  GEMINI_API_KEY: z.string().optional(),
  OPENROUTER_API_KEY: z.string().optional(),
  KIE_AI_API_KEY: z.string().optional()
});

export type EnvConfig = z.infer<typeof envSchema>;

export const loadEnv = (raw: NodeJS.ProcessEnv = process.env): EnvConfig => envSchema.parse(raw);

export const loadJsonConfig = <T>(filePath: string): T => {
  const content = readFileSync(filePath, "utf8");
  return JSON.parse(content) as T;
};
