import { promises as fs } from "node:fs";
import path from "node:path";
import { workflowDefinitionSchema, type WorkflowDefinition } from "../types/workflow.js";

export interface WorkflowLoaderOptions {
  baseDir?: string;
}

export class WorkflowLoader {
  constructor(private readonly options: WorkflowLoaderOptions = {}) {}

  async loadAll(): Promise<WorkflowDefinition[]> {
    const baseDir = this.options.baseDir ?? path.resolve(process.cwd(), "configs/workflows");
    const entries = await fs.readdir(baseDir, { withFileTypes: true });
    const files = entries.filter((entry) => entry.isFile() && entry.name.endsWith(".json"));

    const loaded = await Promise.all(
      files.map(async (file) => {
        const fullPath = path.join(baseDir, file.name);
        const raw = await fs.readFile(fullPath, "utf8");
        return workflowDefinitionSchema.parse(this.normalizeLegacyDefinition(JSON.parse(raw)));
      })
    );

    return loaded.sort((a, b) => a.id.localeCompare(b.id));
  }

  async loadById(id: string): Promise<WorkflowDefinition | null> {
    const all = await this.loadAll();
    return all.find((workflow) => workflow.id === id) ?? null;
  }

  private normalizeLegacyDefinition(raw: Record<string, unknown>): Record<string, unknown> {
    const normalized = { ...raw };
    const steps = Array.isArray(normalized.steps) ? normalized.steps : [];
    normalized.steps = steps.map((step) => {
      if (!step || typeof step !== "object") return step;
      const typed = { ...(step as Record<string, unknown>) };
      if (typed.type === "decision") {
        typed.type = "transition";
      }
      return typed;
    });
    const firstStep = (normalized.steps as Array<{ id?: string }>)[0];
    const lastStep = (normalized.steps as Array<{ id?: string }>)[(normalized.steps as Array<{ id?: string }>).length - 1];

    if (typeof normalized.entrypoint !== "string" && typeof firstStep?.id === "string") {
      normalized.entrypoint = firstStep.id;
    }

    if (Array.isArray(normalized.transitions)) {
      return normalized;
    }

    if (normalized.transitions && typeof normalized.transitions === "object" && typeof lastStep?.id === "string") {
      const entries = Object.entries(normalized.transitions as Record<string, unknown>);
      normalized.transitions = entries
        .filter(([, to]) => typeof to === "string")
        .map(([on, to]) => ({ from: lastStep.id, on, to }));
      return normalized;
    }

    normalized.transitions = [];
    return normalized;
  }
}
