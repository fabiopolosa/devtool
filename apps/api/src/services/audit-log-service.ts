import { randomUUID } from "node:crypto";
import type { AuditEvent } from "@cp/domain";
import { apiStore } from "./api-store.js";

export interface AuditLogInput {
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
  async record(input: AuditLogInput): Promise<AuditEvent> {
    const now = input.occurredAt ?? new Date().toISOString();
    return apiStore.createAuditEvent({
      id: randomUUID(),
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
    });
  }
}

export const auditLogService = new AuditLogService();
