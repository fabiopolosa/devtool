import { randomUUID } from "node:crypto";
import type { UsageEvent } from "@cp/domain";
import {
  DEFAULT_TENANT_ID,
  getCurrentTenantId,
  runWithTenantContext,
  InMemoryDatabase,
  type RepositoryPort
} from "@cp/db";
import { apiStore } from "./api-store.js";

export interface UsageRecordInput {
  tenantId?: string;
  projectId?: string;
  jobId?: string;
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cost: number;
  metadata?: Record<string, unknown>;
  actor: string;
  occurredAt?: string;
}

export interface UsageQueryFilters {
  tenantId?: string;
  projectId?: string;
  jobId?: string;
  provider?: string;
  model?: string;
}

export interface UsageSummaryRow {
  key: string;
  count: number;
  totalCost: number;
  totalInputTokens: number;
  totalOutputTokens: number;
}

export interface UsageSummary {
  totalCount: number;
  totalCost: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  byProvider: UsageSummaryRow[];
  byModel: UsageSummaryRow[];
}

export class UsageService {
  private readonly repository: RepositoryPort<UsageEvent> | undefined;
  private static fallbackDatabase: InMemoryDatabase | undefined;

  constructor(repository?: RepositoryPort<UsageEvent>) {
    this.repository = repository;
  }

  private resolveRepository(): RepositoryPort<UsageEvent> {
    if (this.repository) {
      return this.repository;
    }

    try {
      return (
        apiStore as unknown as {
          repo<T extends string>(table: T): RepositoryPort<UsageEvent>;
        }
      ).repo("usage_events") as RepositoryPort<UsageEvent>;
    } catch {
      UsageService.fallbackDatabase ??= new InMemoryDatabase();
      return UsageService.fallbackDatabase.repository("usage_events") as RepositoryPort<UsageEvent>;
    }
  }

  async record(input: UsageRecordInput): Promise<UsageEvent> {
    const now = input.occurredAt ?? new Date().toISOString();
    const tenantId = input.tenantId ?? getCurrentTenantId() ?? DEFAULT_TENANT_ID;

    return runWithTenantContext({ tenantId }, async () =>
      this.resolveRepository().create({
        id: randomUUID(),
        tenantId,
        ...(input.projectId ? { projectId: input.projectId } : {}),
        ...(input.jobId ? { jobId: input.jobId } : {}),
        provider: input.provider,
        model: input.model,
        inputTokens: Math.max(0, Math.trunc(input.inputTokens)),
        outputTokens: Math.max(0, Math.trunc(input.outputTokens)),
        cost: Number(input.cost.toFixed(6)),
        metadata: input.metadata ?? {},
        createdAt: now,
        createdBy: input.actor,
        updatedAt: now,
        updatedBy: input.actor
      })
    );
  }

  async list(filters?: UsageQueryFilters): Promise<UsageEvent[]> {
    const tenantId = filters?.tenantId ?? getCurrentTenantId() ?? DEFAULT_TENANT_ID;
    const query: Record<string, string> = { tenantId };
    if (filters?.projectId) query.projectId = filters.projectId;
    if (filters?.jobId) query.jobId = filters.jobId;
    if (filters?.provider) query.provider = filters.provider;
    if (filters?.model) query.model = filters.model;

    return runWithTenantContext({ tenantId }, async () => this.resolveRepository().list(query));
  }

  async summary(filters?: UsageQueryFilters): Promise<UsageSummary> {
    const items = await this.list(filters);
    const byProvider = new Map<string, UsageSummaryRow>();
    const byModel = new Map<string, UsageSummaryRow>();

    let totalCost = 0;
    let totalInputTokens = 0;
    let totalOutputTokens = 0;

    const accumulate = (map: Map<string, UsageSummaryRow>, key: string, item: UsageEvent): void => {
      const current = map.get(key) ?? {
        key,
        count: 0,
        totalCost: 0,
        totalInputTokens: 0,
        totalOutputTokens: 0
      };
      current.count += 1;
      current.totalCost += item.cost;
      current.totalInputTokens += item.inputTokens;
      current.totalOutputTokens += item.outputTokens;
      map.set(key, current);
    };

    for (const item of items) {
      totalCost += item.cost;
      totalInputTokens += item.inputTokens;
      totalOutputTokens += item.outputTokens;
      accumulate(byProvider, item.provider, item);
      accumulate(byModel, item.model, item);
    }

    const sortRows = (rows: UsageSummaryRow[]): UsageSummaryRow[] =>
      rows.sort((left, right) => right.totalCost - left.totalCost || left.key.localeCompare(right.key));

    return {
      totalCount: items.length,
      totalCost: Number(totalCost.toFixed(6)),
      totalInputTokens,
      totalOutputTokens,
      byProvider: sortRows([...byProvider.values()]),
      byModel: sortRows([...byModel.values()])
    };
  }
}

export const usageService = new UsageService();
