import type { MetricDefinition, SelectionOutcome, VariantRunResult } from "./types.js";

const EPSILON = 1e-9;

export interface SelectionInput {
  metricSet: MetricDefinition[];
  variants: VariantRunResult[];
  regressionThresholds?: Record<string, number>;
}

export const scoreVariant = (metricSet: MetricDefinition[], metrics: Record<string, number>): number => {
  if (metricSet.length === 0) return 0;

  return metricSet.reduce((score, metricDef) => {
    const value = metrics[metricDef.name];
    if (typeof value !== "number" || Number.isNaN(value)) {
      return score - metricDef.weight;
    }

    const normalized = metricDef.direction === "higher_better" ? value : 1 / Math.max(value, EPSILON);
    return score + normalized * metricDef.weight;
  }, 0);
};

export const selectWinner = (input: SelectionInput): SelectionOutcome => {
  const ranked = input.variants
    .filter((variant) => variant.status !== "failed")
    .map((variant) => ({
      variantId: variant.variantId,
      metrics: variant.metrics,
      score: scoreVariant(input.metricSet, variant.metrics)
    }))
    .sort((a, b) => b.score - a.score);

  const winner = ranked[0] ?? null;
  const regressionSignals = buildRegressionSignals(input.metricSet, input.variants, input.regressionThresholds ?? {});
  const rollbackSuggested = regressionSignals.length > 0 || !winner;

  return {
    winnerVariantId: winner?.variantId ?? null,
    winnerScore: winner?.score ?? null,
    orderedVariants: ranked,
    regressionSignals,
    rollbackSuggested,
    ...(rollbackSuggested
      ? { rollbackReason: regressionSignals[0] ?? "No viable winner produced by experiment run set" }
      : {})
  };
};

export const suggestRollback = (outcome: SelectionOutcome, fallbackVariantId?: string): { shouldRollback: boolean; reason?: string; fallbackVariantId?: string } => {
  if (!outcome.rollbackSuggested) {
    return { shouldRollback: false };
  }

  const resolvedFallback = fallbackVariantId ?? outcome.orderedVariants[0]?.variantId;
  return {
    shouldRollback: true,
    ...(outcome.rollbackReason ? { reason: outcome.rollbackReason } : {}),
    ...(resolvedFallback ? { fallbackVariantId: resolvedFallback } : {})
  };
};

const buildRegressionSignals = (
  metricSet: MetricDefinition[],
  variants: VariantRunResult[],
  thresholds: Record<string, number>
): string[] => {
  const signals: string[] = [];
  for (const metric of metricSet) {
    const threshold = thresholds[metric.name];
    if (typeof threshold !== "number") continue;

    const metricValues = variants
      .map((variant) => variant.metrics[metric.name])
      .filter((value): value is number => typeof value === "number" && !Number.isNaN(value));

    if (metricValues.length === 0) continue;

    const baseline = metricValues[0];
    const latest = metricValues[metricValues.length - 1];
    if (baseline === undefined || latest === undefined) continue;
    const degraded = metric.direction === "higher_better" ? latest < baseline - threshold : latest > baseline + threshold;

    if (degraded) {
      signals.push(`Metric ${metric.name} regressed beyond threshold ${threshold}`);
    }
  }
  return signals;
};
