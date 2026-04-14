import type { ID } from "@cp/domain";
import type { ExperimentRunContext, VariantRunResult } from "./types.js";

export interface VariantRunner {
  run(context: ExperimentRunContext): Promise<VariantRunResult>;
}

export interface VariantRunnerRegistry {
  getRunner(targetType: string): VariantRunner;
}

export interface VariantRunRequest {
  experimentId: ID;
  variantId: string;
  targetType: string;
  runId?: ID;
  promptVersionRef?: string;
  routingRuleRef?: string;
  policyRef?: string;
}

export class StaticVariantRunner implements VariantRunner {
  constructor(private readonly resultFactory: (context: ExperimentRunContext) => VariantRunResult) {}

  async run(context: ExperimentRunContext): Promise<VariantRunResult> {
    return this.resultFactory(context);
  }
}

export class InMemoryVariantRunnerRegistry implements VariantRunnerRegistry {
  private readonly runners = new Map<string, VariantRunner>();

  register(targetType: string, runner: VariantRunner): void {
    this.runners.set(targetType, runner);
  }

  getRunner(targetType: string): VariantRunner {
    const runner = this.runners.get(targetType);
    if (!runner) {
      throw new Error(`No variant runner registered for target type: ${targetType}`);
    }
    return runner;
  }
}
