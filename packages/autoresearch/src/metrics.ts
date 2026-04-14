import type { ID } from "@cp/domain";

export interface MetricSample {
  metricName: string;
  value: number;
  recordedAt: string;
  source: "task_run" | "retrieval_log" | "experiment_run" | "manual";
  tags?: Record<string, string>;
}

export interface MetricsCollector {
  record(experimentId: ID, variantId: string, sample: MetricSample): Promise<void>;
  recordBatch(experimentId: ID, variantId: string, samples: MetricSample[]): Promise<void>;
  list(experimentId: ID, variantId?: string): Promise<MetricSample[]>;
  snapshot(experimentId: ID): Promise<Record<string, Record<string, number>>>;
}

export class InMemoryMetricsCollector implements MetricsCollector {
  private readonly samples = new Map<string, MetricSample[]>();

  private key(experimentId: ID, variantId?: string): string {
    return variantId ? `${experimentId}:${variantId}` : `${experimentId}`;
  }

  async record(experimentId: ID, variantId: string, sample: MetricSample): Promise<void> {
    const key = this.key(experimentId, variantId);
    const next = this.samples.get(key) ?? [];
    next.push(sample);
    this.samples.set(key, next);
  }

  async recordBatch(experimentId: ID, variantId: string, samples: MetricSample[]): Promise<void> {
    for (const sample of samples) {
      await this.record(experimentId, variantId, sample);
    }
  }

  async list(experimentId: ID, variantId?: string): Promise<MetricSample[]> {
    return [...(this.samples.get(this.key(experimentId, variantId)) ?? [])];
  }

  async snapshot(experimentId: ID): Promise<Record<string, Record<string, number>>> {
    const snapshot: Record<string, Record<string, number>> = {};
    for (const [key, samples] of this.samples.entries()) {
      if (!key.startsWith(`${experimentId}:`)) continue;
      const variantId = key.slice(experimentId.length + 1);
      snapshot[variantId] = aggregateSamples(samples);
    }
    return snapshot;
  }
}

export const aggregateSamples = (samples: MetricSample[]): Record<string, number> => {
  const grouped: Record<string, { total: number; count: number }> = {};
  for (const sample of samples) {
    const current = grouped[sample.metricName] ?? { total: 0, count: 0 };
    current.total += sample.value;
    current.count += 1;
    grouped[sample.metricName] = current;
  }

  return Object.fromEntries(
    Object.entries(grouped).map(([name, stats]) => [name, stats.count === 0 ? 0 : stats.total / stats.count])
  );
};
