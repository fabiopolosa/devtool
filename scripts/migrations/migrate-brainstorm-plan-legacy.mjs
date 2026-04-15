#!/usr/bin/env node
import { readFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import process from "node:process";

const require = createRequire(import.meta.url);
const pgEntry = require.resolve("pg", { paths: [path.resolve(process.cwd(), "packages/db")] });
const { Pool } = require(pgEntry);

const LEGACY_PLAN_FIELDS = [
  "recommendedStack",
  "architecture",
  "suggestedAgents",
  "suggestedSkills",
  "providerBindings",
  "roadmap",
  "assumptions",
  "risks",
  "composedPrompt",
  "selectedSubprompts"
];

const isRecord = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

const nonEmptyString = (value, fallback) =>
  typeof value === "string" && value.trim().length > 0 ? value.trim() : fallback;

const stringArray = (value) =>
  Array.isArray(value) ? value.filter((item) => typeof item === "string" && item.trim().length > 0) : [];

const normalizeRecommendedStack = (value) => {
  const obj = isRecord(value) ? value : {};
  return {
    database: nonEmptyString(obj.database, "PostgreSQL"),
    backend: nonEmptyString(obj.backend, "Node.js + Fastify + Zod"),
    frontend: nonEmptyString(obj.frontend, "React + TypeScript + Tailwind"),
    llmProviders: stringArray(obj.llmProviders),
    vectorStore: nonEmptyString(obj.vectorStore, "pgvector")
  };
};

const normalizeArchitecture = (value) => {
  const obj = isRecord(value) ? value : {};
  const strategy = nonEmptyString(obj.repositoryStrategy, "monorepo");
  const repositoryStrategy =
    strategy === "monorepo" || strategy === "microrepo" || strategy === "hybrid"
      ? strategy
      : "monorepo";
  return {
    repositoryStrategy,
    packageLayout: stringArray(obj.packageLayout),
    rationale: nonEmptyString(obj.rationale, "Legacy migration fallback rationale.")
  };
};

const normalizeObjectArray = (value, mapper) =>
  Array.isArray(value) ? value.filter(isRecord).map((item, index) => mapper(item, index)) : [];

const normalizePlanPayload = (candidate) => ({
  recommendedStack: normalizeRecommendedStack(candidate.recommendedStack),
  architecture: normalizeArchitecture(candidate.architecture),
  suggestedAgents: normalizeObjectArray(candidate.suggestedAgents, (item) => ({
    role: nonEmptyString(item.role, "planner"),
    purpose: nonEmptyString(item.purpose, "Legacy migrated role"),
    capabilities: stringArray(item.capabilities)
  })),
  suggestedSkills: normalizeObjectArray(candidate.suggestedSkills, (item) => ({
    name: nonEmptyString(item.name, "legacy-skill"),
    repositoryUrl: nonEmptyString(item.repositoryUrl, "https://example.com/legacy-skill"),
    reason: nonEmptyString(item.reason, "Migrated from legacy brainstorm payload.")
  })),
  providerBindings: normalizeObjectArray(candidate.providerBindings, (item) => ({
    capabilityClass: nonEmptyString(item.capabilityClass, "chat_reasoning"),
    primaryProvider: nonEmptyString(item.primaryProvider, "openai"),
    fallbackProviders: stringArray(item.fallbackProviders),
    ...(typeof item.primaryModelHint === "string" && item.primaryModelHint.trim().length > 0
      ? { primaryModelHint: item.primaryModelHint.trim() }
      : {})
  })),
  roadmap: normalizeObjectArray(candidate.roadmap, (item, index) => ({
    id: nonEmptyString(item.id, `legacy_task_${index + 1}`),
    title: nonEmptyString(item.title, `Legacy task ${index + 1}`),
    description: nonEmptyString(item.description, "Migrated from legacy brainstorm plan."),
    dependencies: stringArray(item.dependencies),
    targetRepos: stringArray(item.targetRepos),
    suggestedAgentRole: nonEmptyString(item.suggestedAgentRole, "planner"),
    suggestedSkills: stringArray(item.suggestedSkills)
  })),
  assumptions: stringArray(candidate.assumptions),
  risks: stringArray(candidate.risks),
  composedPrompt: nonEmptyString(
    candidate.composedPrompt,
    "Legacy brainstorm payload migrated to canonical plan.* format."
  ),
  selectedSubprompts: normalizeObjectArray(candidate.selectedSubprompts, (item, index) => ({
    id: nonEmptyString(item.id, `legacy_subprompt_${index + 1}`),
    title: nonEmptyString(item.title, `Legacy subprompt ${index + 1}`),
    category: nonEmptyString(item.category, "other"),
    summary: nonEmptyString(item.summary, "Migrated legacy subprompt."),
    prompt: nonEmptyString(item.prompt, "Legacy migrated subprompt."),
    tags: stringArray(item.tags),
    sourcePath: nonEmptyString(item.sourcePath, "legacy://brainstorm-plan"),
    enabled: typeof item.enabled === "boolean" ? item.enabled : true
  }))
});

const hasLegacyFields = (value) =>
  isRecord(value) && LEGACY_PLAN_FIELDS.some((field) => Object.hasOwn(value, field));

const canonicalPlanFromRecord = (row) => {
  const candidates = [];
  if (isRecord(row.plan)) {
    candidates.push(row.plan);
    if (isRecord(row.plan.plan)) {
      candidates.push(row.plan.plan);
    }
  }
  if (hasLegacyFields(row)) {
    candidates.push(row);
  }

  for (const candidate of candidates) {
    if (!hasLegacyFields(candidate)) continue;
    return normalizePlanPayload(candidate);
  }

  return null;
};

const stableStringify = (value) => {
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableStringify(entry)).join(",")}]`;
  }
  if (isRecord(value)) {
    return `{${Object.keys(value)
      .sort((a, b) => a.localeCompare(b))
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
};

const loadDotEnvIfNeeded = () => {
  if (process.env.DATABASE_URL) return;
  const envPath = path.resolve(process.cwd(), ".env");
  if (!existsSync(envPath)) return;

  const raw = readFileSync(envPath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("=");
    if (separator <= 0) continue;
    const key = trimmed.slice(0, separator).trim();
    if (process.env[key] !== undefined) continue;
    const value = trimmed.slice(separator + 1).trim().replace(/^['"]|['"]$/g, "");
    process.env[key] = value;
  }
};

const run = async () => {
  loadDotEnvIfNeeded();
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is required to run brainstorm plan migration.");
  }

  const pool = new Pool({ connectionString });
  const actor = "brainstorm_plan_contract_migration";

  try {
    const result = await pool.query(
      `
      SELECT id, session_id, title, executive_summary, plan
      FROM brainstorm_plans
      ORDER BY created_at ASC
      `
    );

    let updated = 0;
    let unchanged = 0;
    let unrecoverable = 0;
    const unrecoverableIds = [];

    for (const row of result.rows) {
      const canonical = canonicalPlanFromRecord(row);
      if (!canonical) {
        unrecoverable += 1;
        unrecoverableIds.push(row.id);
        continue;
      }

      const currentPlan = row.plan;
      const before = stableStringify(currentPlan);
      const after = stableStringify(canonical);

      if (before === after) {
        unchanged += 1;
        continue;
      }

      await pool.query(
        `
        UPDATE brainstorm_plans
        SET plan = $1::jsonb,
            updated_at = NOW(),
            updated_by = $2
        WHERE id = $3
        `,
        [JSON.stringify(canonical), actor, row.id]
      );
      updated += 1;
    }

    console.log("[brainstorm-plan:migrate] completed");
    console.log(`- total records: ${result.rows.length}`);
    console.log(`- migrated: ${updated}`);
    console.log(`- already canonical: ${unchanged}`);
    console.log(`- unrecoverable: ${unrecoverable}`);
    if (unrecoverableIds.length > 0) {
      console.log(`- unrecoverable ids: ${unrecoverableIds.join(", ")}`);
      process.exitCode = 2;
    }
  } finally {
    await pool.end();
  }
};

run().catch((error) => {
  console.error(
    `[brainstorm-plan:migrate] failed: ${error instanceof Error ? error.message : String(error)}`
  );
  process.exit(1);
});
