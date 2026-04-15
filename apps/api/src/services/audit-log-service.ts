import { randomUUID } from "node:crypto";
import type { AuditEvent } from "@cp/domain";
import {
  DEFAULT_TENANT_ID,
  getCurrentTenantId,
  runWithTenantContext,
  InMemoryDatabase,
  type RepositoryPort
} from "@cp/db";
import { apiStore } from "./api-store.js";

export interface AuditLogFilters {
  tenantId?: string;
  projectId?: string;
  jobId?: string;
  userId?: string;
  action?: string;
  resourceType?: string;
  resourceId?: string;
  status?: AuditEvent["status"];
}

export interface AuditLogSummary {
  total: number;
  success: number;
  failure: number;
  byAction: Array<{
    action: string;
    total: number;
    success: number;
    failure: number;
  }>;
}

export interface AuditLogInput {
  tenantId?: string;
  projectId?: string;
  jobId?: string;
  userId?: string;
  action: string;
  resourceType: string;
  resourceId?: string;
  status: AuditEvent["status"];
  metadata?: Record<string, unknown>;
  actor: string;
  occurredAt?: string;
}

export class AuditLogService {
  private readonly repository: RepositoryPort<AuditEvent> | undefined;
  private static fallbackDatabase: InMemoryDatabase | undefined;

  constructor(repository?: RepositoryPort<AuditEvent>) {
    this.repository = repository;
  }

  private resolveRepository(): RepositoryPort<AuditEvent> {
    if (this.repository) {
      return this.repository;
    }

    try {
      return (
        apiStore as unknown as {
          repo<T extends string>(table: T): RepositoryPort<AuditEvent>;
        }
      ).repo("audit_events") as RepositoryPort<AuditEvent>;
    } catch {
      AuditLogService.fallbackDatabase ??= new InMemoryDatabase();
      return AuditLogService.fallbackDatabase.repository("audit_events") as RepositoryPort<AuditEvent>;
    }
  }

  async record(input: AuditLogInput): Promise<AuditEvent> {
    const now = input.occurredAt ?? new Date().toISOString();
    const tenantId = input.tenantId ?? getCurrentTenantId() ?? DEFAULT_TENANT_ID;

    return runWithTenantContext({ tenantId }, async () =>
      this.resolveRepository().create({
        id: randomUUID(),
        tenantId,
        ...(input.projectId ? { projectId: input.projectId } : {}),
        ...(input.jobId ? { jobId: input.jobId } : {}),
        ...(input.userId ? { userId: input.userId } : {}),
        action: input.action,
        resourceType: input.resourceType,
        ...(input.resourceId ? { resourceId: input.resourceId } : {}),
        status: input.status,
        occurredAt: now,
        metadata: input.metadata ?? {},
        createdAt: now,
        createdBy: input.actor,
        updatedAt: now,
        updatedBy: input.actor
      })
    );
  }

  async list(filters?: AuditLogFilters): Promise<AuditEvent[]> {
    const tenantId = filters?.tenantId ?? getCurrentTenantId() ?? DEFAULT_TENANT_ID;
    const filterRecord: Record<string, string> = {};
    if (filters?.projectId) filterRecord.projectId = filters.projectId;
    if (filters?.jobId) filterRecord.jobId = filters.jobId;
    if (filters?.userId) filterRecord.userId = filters.userId;
    if (filters?.action) filterRecord.action = filters.action;
    if (filters?.resourceType) filterRecord.resourceType = filters.resourceType;
    if (filters?.resourceId) filterRecord.resourceId = filters.resourceId;
    if (filters?.status) filterRecord.status = filters.status;

    return runWithTenantContext({ tenantId }, async () =>
      this.resolveRepository().list({
        tenantId,
        ...filterRecord
      })
    );
  }

  async summary(filters?: AuditLogFilters): Promise<AuditLogSummary> {
    const rows = await this.list(filters);
    const byAction = new Map<string, AuditLogSummary["byAction"][number]>();
    let success = 0;
    let failure = 0;

    for (const row of rows) {
      const current = byAction.get(row.action) ?? {
        action: row.action,
        total: 0,
        success: 0,
        failure: 0
      };
      current.total += 1;
      if (row.status === "success") {
        current.success += 1;
        success += 1;
      } else {
        current.failure += 1;
        failure += 1;
      }
      byAction.set(row.action, current);
    }

    return {
      total: rows.length,
      success,
      failure,
      byAction: [...byAction.values()].sort((left, right) => left.action.localeCompare(right.action))
    };
  }
}

export const auditLogService = new AuditLogService();
