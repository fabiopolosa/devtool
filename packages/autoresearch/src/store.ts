import type { AutoResearchRun, ID } from "@cp/domain";
import type { ExperimentDefinition, VariantRunResult } from "./types.js";

export interface AutoResearchStore {
  putExperiment(experiment: ExperimentDefinition): Promise<ExperimentDefinition>;
  getExperiment(experimentId: ID): Promise<ExperimentDefinition | null>;
  listExperiments(projectId?: ID): Promise<ExperimentDefinition[]>;
  putRun(run: AutoResearchRun): Promise<AutoResearchRun>;
  listRuns(experimentId: ID): Promise<AutoResearchRun[]>;
  recordOutcome(record: VariantRunResult & { experimentId: ID }): Promise<void>;
  getOutcome(experimentId: ID, variantId: string): Promise<VariantRunResult | null>;
  listOutcomes(experimentId: ID): Promise<VariantRunResult[]>;
}

export class InMemoryAutoResearchStore implements AutoResearchStore {
  private experiments = new Map<ID, ExperimentDefinition>();
  private runs = new Map<ID, AutoResearchRun[]>();
  private outcomes = new Map<string, VariantRunResult>();

  async putExperiment(experiment: ExperimentDefinition): Promise<ExperimentDefinition> {
    this.experiments.set(experiment.id, experiment);
    return experiment;
  }

  async getExperiment(experimentId: ID): Promise<ExperimentDefinition | null> {
    return this.experiments.get(experimentId) ?? null;
  }

  async listExperiments(projectId?: ID): Promise<ExperimentDefinition[]> {
    const experiments = [...this.experiments.values()];
    return projectId ? experiments.filter((experiment) => experiment.projectId === projectId) : experiments;
  }

  async putRun(run: AutoResearchRun): Promise<AutoResearchRun> {
    const next = this.runs.get(run.experimentId) ?? [];
    const index = next.findIndex((candidate) => candidate.id === run.id);
    if (index >= 0) {
      next[index] = run;
    } else {
      next.push(run);
    }
    this.runs.set(run.experimentId, next);
    return run;
  }

  async listRuns(experimentId: ID): Promise<AutoResearchRun[]> {
    return [...(this.runs.get(experimentId) ?? [])];
  }

  async recordOutcome(record: VariantRunResult & { experimentId: ID }): Promise<void> {
    this.outcomes.set(`${record.experimentId}:${record.variantId}`, record);
  }

  async getOutcome(experimentId: ID, variantId: string): Promise<VariantRunResult | null> {
    return this.outcomes.get(`${experimentId}:${variantId}`) ?? null;
  }

  async listOutcomes(experimentId: ID): Promise<VariantRunResult[]> {
    return [...this.outcomes.entries()]
      .filter(([key]) => key.startsWith(`${experimentId}:`))
      .map(([, outcome]) => outcome);
  }
}
