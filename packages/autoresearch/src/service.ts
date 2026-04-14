import type { AutoResearchRun, ID } from "@cp/domain";
import type { MetricsCollector } from "./metrics.js";
import type { VariantRunnerRegistry } from "./runners.js";
import type { AutoResearchStore } from "./store.js";
import type {
  ExperimentDefinition,
  ExperimentRunContext,
  ExperimentStatusSummary,
  RollbackSuggestion,
  SelectionOutcome,
  VariantRunResult
} from "./types.js";
import { selectWinner, suggestRollback } from "./selection.js";

export interface AutoResearchService {
  getExperiment(experimentId: ID): Promise<ExperimentDefinition | null>;
  listExperiments(projectId?: ID): Promise<ExperimentDefinition[]>;
  runVariant(context: ExperimentRunContext): Promise<VariantRunResult>;
  collectMetrics(experimentId: ID, variantId: string): Promise<Record<string, Record<string, number>>>;
  evaluateExperiment(experimentId: ID): Promise<SelectionOutcome>;
  suggestRollback(experimentId: ID, fallbackVariantId?: string): Promise<RollbackSuggestion>;
  summarizeExperiment(experimentId: ID): Promise<ExperimentStatusSummary | null>;
}

export interface AutoResearchDependencies {
  store: AutoResearchStore;
  metrics: MetricsCollector;
  runners: VariantRunnerRegistry;
}

export class DefaultAutoResearchService implements AutoResearchService {
  constructor(private readonly deps: AutoResearchDependencies) {}

  async getExperiment(experimentId: ID): Promise<ExperimentDefinition | null> {
    return this.deps.store.getExperiment(experimentId);
  }

  async listExperiments(projectId?: ID): Promise<ExperimentDefinition[]> {
    return this.deps.store.listExperiments(projectId);
  }

  async runVariant(context: ExperimentRunContext): Promise<VariantRunResult> {
    const runner = this.deps.runners.getRunner(context.targetType);
    const result = await runner.run(context);
    const run = createAutoResearchRun({
      id: context.runId ?? `${context.experimentId}:${context.variantId}`,
      experimentId: context.experimentId,
      variantId: context.variantId,
      createdBy: "autoresearch",
      status: result.status,
      metrics: result.metrics
    });

    await this.deps.store.putRun(run);

    await this.deps.store.recordOutcome({
      experimentId: context.experimentId,
      ...result
    });

    await this.deps.metrics.recordBatch(
      context.experimentId,
      context.variantId,
      Object.entries(result.metrics).map(([metricName, value]) => ({
        metricName,
        value,
        recordedAt: new Date().toISOString(),
        source: "experiment_run"
      }))
    );

    return result;
  }

  async collectMetrics(experimentId: ID, variantId: string): Promise<Record<string, Record<string, number>>> {
    const samples = await this.deps.metrics.snapshot(experimentId);
    return variantId ? { [variantId]: samples[variantId] ?? {} } : samples;
  }

  async evaluateExperiment(experimentId: ID): Promise<SelectionOutcome> {
    const experiment = await this.requireExperiment(experimentId);
    const runs = await this.deps.store.listRuns(experimentId);
    const outcomes = await Promise.all(
      runs.map(async (run) => {
        const samples = await this.deps.metrics.list(experimentId, run.variantId);
        const metrics = samples.reduce<Record<string, number>>((acc, sample) => {
          acc[sample.metricName] = sample.value;
          return acc;
        }, {});
        return {
          variantId: run.variantId,
          status: run.status,
          metrics
        };
      })
    );

    return selectWinner({ metricSet: experiment.metricSet, variants: outcomes });
  }

  async suggestRollback(experimentId: ID, fallbackVariantId?: string): Promise<RollbackSuggestion> {
    const outcome = await this.evaluateExperiment(experimentId);
    return suggestRollback(outcome, fallbackVariantId);
  }

  async summarizeExperiment(experimentId: ID): Promise<ExperimentStatusSummary | null> {
    const experiment = await this.deps.store.getExperiment(experimentId);
    if (!experiment) return null;

    const runs = await this.deps.store.listRuns(experimentId);
    const outcome = await this.evaluateExperiment(experimentId).catch(() => null);
    return {
      experimentId,
      status: experiment.status,
      totalRuns: runs.length,
      candidateRuns: runs.filter((run) => run.status === "completed").length,
      ...(outcome?.winnerVariantId ? { winnerVariantId: outcome.winnerVariantId } : {}),
      lastUpdatedAt: experiment.updatedAt
    };
  }

  private async requireExperiment(experimentId: ID): Promise<ExperimentDefinition> {
    const experiment = await this.deps.store.getExperiment(experimentId);
    if (!experiment) {
      throw new Error(`Experiment not found: ${experimentId}`);
    }
    return experiment;
  }
}

export const createAutoResearchRun = (args: {
  id: ID;
  experimentId: ID;
  variantId: string;
  createdBy: string;
  status?: AutoResearchRun["status"];
  metrics?: Record<string, number>;
}): AutoResearchRun => ({
  id: args.id,
  experimentId: args.experimentId,
  variantId: args.variantId,
  createdAt: new Date().toISOString(),
  createdBy: args.createdBy,
  updatedAt: new Date().toISOString(),
  updatedBy: args.createdBy,
  status: args.status ?? "running",
  metrics: args.metrics ?? {},
  winnerFlag: false,
  rollbackFlag: false
});
