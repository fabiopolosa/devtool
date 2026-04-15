export type TenantRole = "owner" | "admin" | "manager" | "user" | "guest";

export interface Tenant {
  id: string;
  name: string;
  createdAt: string;
}

export interface UserTenant {
  id: string;
  userId: string;
  tenantId: string;
  role: TenantRole;
  createdAt: string;
}

export interface TenantPermissions {
  canView: boolean;
  canEdit: boolean;
  canRunAgent: boolean;
  canManageUsers: boolean;
  canApprove: boolean;
}
