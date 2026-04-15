import type { FastifyRequest } from "fastify";
import { DEFAULT_TENANT_ID, enterTenantContext } from "@cp/db";
import type { TenantRole } from "@cp/domain";
import { apiStore } from "../services/api-store.js";
import { getPermissions, resolveUserTenantRole } from "./rbac.js";

const tenantHeaderName = "x-tenant-id";

const toTenantHeaderValue = (value: unknown): string | undefined => {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
};

export const resolveTenantHeader = (request: FastifyRequest): string | undefined =>
  toTenantHeaderValue(request.headers[tenantHeaderName]);

const resolveTenantByMembership = async (userId?: string): Promise<string | undefined> => {
  if (!userId) return undefined;
  const bindings = await apiStore.listUserTenants({ userId });
  if (bindings.length === 0) return undefined;
  return bindings[0]?.tenantId;
};

export const resolveRequestTenant = async (request: FastifyRequest): Promise<string> => {
  const fromHeader = resolveTenantHeader(request);
  if (fromHeader) return fromHeader;
  const fromMembership = await resolveTenantByMembership(request.authPrincipal?.userId);
  if (fromMembership) return fromMembership;
  return DEFAULT_TENANT_ID;
};

export const applyRequestTenantContext = async (request: FastifyRequest): Promise<void> => {
  const tenantId = await resolveRequestTenant(request);
  const principal = request.authPrincipal;
  let role: TenantRole;

  if (principal?.authBypass) {
    role = "owner";
  } else if (principal?.userId) {
    const bindings = await apiStore.listUserTenants({ userId: principal.userId, tenantId });
    if (bindings.length === 0) {
      const error = new Error(`User does not belong to tenant ${tenantId}`) as Error & { statusCode?: number };
      error.statusCode = 403;
      throw error;
    }
    role = (await resolveUserTenantRole(principal.userId, tenantId)) as TenantRole;
  } else {
    role = "guest";
  }

  const permissions = getPermissions(role);
  request.tenantId = tenantId;
  request.tenantRole = role;
  request.tenantPermissions = permissions;
  enterTenantContext({ tenantId });
};
