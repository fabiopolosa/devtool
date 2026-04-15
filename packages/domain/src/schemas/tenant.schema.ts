import { z } from "zod";
import { idSchema, isoDateTimeSchema } from "./common.schema.js";

export const tenantRoleSchema = z.enum(["owner", "admin", "manager", "user", "guest"]);

export const tenantPermissionsSchema = z.object({
  canView: z.boolean(),
  canEdit: z.boolean(),
  canRunAgent: z.boolean(),
  canManageUsers: z.boolean(),
  canApprove: z.boolean()
});

export const tenantSchema = z.object({
  id: idSchema,
  name: z.string().min(1),
  createdAt: isoDateTimeSchema
});

export const userTenantSchema = z.object({
  id: idSchema,
  userId: idSchema,
  tenantId: idSchema,
  role: tenantRoleSchema,
  createdAt: isoDateTimeSchema
});

export type TenantSchema = z.infer<typeof tenantSchema>;
export type UserTenantSchema = z.infer<typeof userTenantSchema>;
export type TenantRoleSchema = z.infer<typeof tenantRoleSchema>;
export type TenantPermissionsSchema = z.infer<typeof tenantPermissionsSchema>;
