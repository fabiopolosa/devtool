import type { FastifyReply, FastifyRequest } from "fastify";
import type { TenantPermissions, TenantRole } from "@cp/domain";
import { apiStore } from "../services/api-store.js";

export const tenantRolePermissions: Record<TenantRole, TenantPermissions> = {
  owner: {
    canView: true,
    canEdit: true,
    canRunAgent: true,
    canManageUsers: true,
    canApprove: true
  },
  admin: {
    canView: true,
    canEdit: true,
    canRunAgent: true,
    canManageUsers: true,
    canApprove: true
  },
  manager: {
    canView: true,
    canEdit: true,
    canRunAgent: true,
    canManageUsers: false,
    canApprove: true
  },
  user: {
    canView: true,
    canEdit: false,
    canRunAgent: false,
    canManageUsers: false,
    canApprove: false
  },
  guest: {
    canView: false,
    canEdit: false,
    canRunAgent: false,
    canManageUsers: false,
    canApprove: false
  }
};

export const getPermissions = (role: TenantRole): TenantPermissions =>
  tenantRolePermissions[role] ?? tenantRolePermissions.guest;

export const resolveUserTenantRole = async (
  userId: string | undefined,
  tenantId: string
): Promise<TenantRole> => {
  if (!userId) return "guest";
  const bindings = await apiStore.listUserTenants({ userId, tenantId });
  return (bindings[0]?.role ?? "guest") as TenantRole;
};

export const requireTenantPermission = (
  request: FastifyRequest,
  reply: FastifyReply,
  permission: keyof TenantPermissions
): boolean => {
  const permissions = request.tenantPermissions;
  if (permissions?.[permission]) {
    return true;
  }
  reply.code(403).send({
    error: "forbidden",
    message: `Missing required tenant permission: ${permission}`
  });
  return false;
};
