import { DefaultAutoResearchService } from "./service.js";
import { InMemoryMetricsCollector } from "./metrics.js";
import { InMemoryVariantRunnerRegistry, StaticVariantRunner } from "./runners.js";
import { InMemoryAutoResearchStore } from "./store.js";
import { selectWinner, suggestRollback } from "./selection.js";

describe("autoresearch", () => {
  it("scores variants and selects winner", () => {
    const outcome = selectWinner({
      metricSet: [
        { name: "first_pass_success_rate", direction: "higher_better", weight: 2 },
        { name: "cost_per_task", direction: "lower_better", weight: 1 }
      ],
      variants: [
        {
          variantId: "v1",
          status: "completed",
          metrics: { first_pass_success_rate: 0.75, cost_per_task: 1.8 }
        },
        {
          variantId: "v2",
          status: "completed",
          metrics: { first_pass_success_rate: 0.82, cost_per_task: 1.4 }
        }
      ]
    });

    expect(outcome.winnerVariantId).toBe("v2");
    expect(outcome.rollbackSuggested).toBe(false);
  });

  it("suggests rollback when no viable winner exists", () => {
    const outcome = selectWinner({
      metricSet: [{ name: "first_pass_success_rate", direction: "higher_better", weight: 1 }],
      variants: [
        { variantId: "v1", status: "failed", metrics: {} },
        { variantId: "v2", status: "failed", metrics: {} }
      ]
    });

    const rollback = suggestRollback(outcome, "baseline");
    expect(rollback.shouldRollback).toBe(true);
    expect(rollback.fallbackVariantId).toBe("baseline");
  });

  it("runs variant, records metrics, and evaluates experiment", async () => {
    const store = new InMemoryAutoResearchStore();
    const metrics = new InMemoryMetricsCollector();
    const runners = new InMemoryVariantRunnerRegistry();

    runners.register(
      "planner_prompt",
      new StaticVariantRunner((context) => ({
        variantId: context.variantId,
        status: "completed",
        metrics: {
          first_pass_success_rate: context.variantId === "v2" ? 0.85 : 0.7,
          avg_time_to_pass: context.variantId === "v2" ? 120 : 160
        }
      }))
    );

    const now = new Date().toISOString();
    await store.putExperiment({
      id: "exp_001",
      projectId: "proj_001",
      targetType: "planner_prompt",
      status: "running",
      baselineVersionRef: "prompt_v1",
      metricSet: [
        { name: "first_pass_success_rate", direction: "higher_better", weight: 2 },
        { name: "avg_time_to_pass", direction: "lower_better", weight: 1 }
      ],
      variants: [
        { variantId: "v1", label: "baseline", enabled: true },
        { variantId: "v2", label: "candidate", enabled: true }
      ],
      createdAt: now,
      createdBy: "tester",
      updatedAt: now,
      updatedBy: "tester"
    });

    const service = new DefaultAutoResearchService({ store, metrics, runners });

    await service.runVariant({
      experimentId: "exp_001",
      projectId: "proj_001",
      targetType: "planner_prompt",
      variantId: "v1"
    });

    await service.runVariant({
      experimentId: "exp_001",
      projectId: "proj_001",
      targetType: "planner_prompt",
      variantId: "v2"
    });

    const evaluation = await service.evaluateExperiment("exp_001");
    expect(evaluation.winnerVariantId).toBe("v2");

    const summary = await service.summarizeExperiment("exp_001");
    expect(summary?.totalRuns).toBe(2);
    expect(summary?.winnerVariantId).toBe("v2");
  });
});
