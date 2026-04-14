import { z } from "zod";
import { idSchema, isoDateTimeSchema } from "./common.schema.js";

export const userStatusSchema = z.enum(["active", "disabled"]);
export const rbacRoleNameSchema = z.enum(["admin", "editor", "operator", "viewer"]);

export const roleSchema = z.object({
  id: idSchema,
  name: rbacRoleNameSchema,
  description: z.string().min(1),
  permissions: z.array(z.string().min(1)).min(1),
  isSystem: z.boolean(),
  createdAt: isoDateTimeSchema,
  createdBy: z.string().min(1),
  updatedAt: isoDateTimeSchema,
  updatedBy: z.string().min(1)
});

export const userSchema = z.object({
  id: idSchema,
  email: z.string().email(),
  displayName: z.string().min(1),
  status: userStatusSchema,
  passwordHash: z.string().min(1),
  lastLoginAt: isoDateTimeSchema.optional(),
  createdAt: isoDateTimeSchema,
  createdBy: z.string().min(1),
  updatedAt: isoDateTimeSchema,
  updatedBy: z.string().min(1)
});

export const userRoleSchema = z.object({
  id: idSchema,
  userId: idSchema,
  roleId: idSchema,
  createdAt: isoDateTimeSchema,
  createdBy: z.string().min(1),
  updatedAt: isoDateTimeSchema,
  updatedBy: z.string().min(1)
});

export const sessionSchema = z.object({
  id: idSchema,
  userId: idSchema,
  tokenHash: z.string().min(1),
  expiresAt: isoDateTimeSchema,
  revokedAt: isoDateTimeSchema.optional(),
  refreshTokenHash: z.string().min(1).optional(),
  refreshExpiresAt: isoDateTimeSchema.optional(),
  refreshRevokedAt: isoDateTimeSchema.optional(),
  ipAddress: z.string().min(1).optional(),
  userAgent: z.string().min(1).optional(),
  createdAt: isoDateTimeSchema,
  createdBy: z.string().min(1),
  updatedAt: isoDateTimeSchema,
  updatedBy: z.string().min(1)
});

export const roleAssignmentSchema = z.object({
  userId: idSchema,
  roleIds: z.array(idSchema).min(1)
});

export const projectRoleBindingSchema = z.object({
  id: idSchema,
  userId: idSchema,
  projectId: idSchema,
  roleId: idSchema,
  expiresAt: isoDateTimeSchema.optional(),
  createdAt: isoDateTimeSchema,
  createdBy: z.string().min(1),
  updatedAt: isoDateTimeSchema,
  updatedBy: z.string().min(1)
});

export const repositoryRoleBindingSchema = z.object({
  id: idSchema,
  userId: idSchema,
  repositoryId: idSchema,
  roleId: idSchema,
  expiresAt: isoDateTimeSchema.optional(),
  createdAt: isoDateTimeSchema,
  createdBy: z.string().min(1),
  updatedAt: isoDateTimeSchema,
  updatedBy: z.string().min(1)
});

export const delegatedPermissionSchema = z.object({
  id: idSchema,
  grantedByUserId: idSchema,
  granteeUserId: idSchema,
  permission: z.string().min(1),
  scopeType: z.enum(["global", "project", "repository"]),
  scopeId: idSchema.optional(),
  expiresAt: isoDateTimeSchema,
  revokedAt: isoDateTimeSchema.optional(),
  createdAt: isoDateTimeSchema,
  createdBy: z.string().min(1),
  updatedAt: isoDateTimeSchema,
  updatedBy: z.string().min(1)
});

export const oidcAuthStateSchema = z.object({
  id: idSchema,
  provider: z.literal("oidc"),
  state: z.string().min(1),
  nonce: z.string().min(1),
  codeVerifier: z.string().min(1),
  redirectUri: z.string().min(1),
  expiresAt: isoDateTimeSchema,
  consumedAt: isoDateTimeSchema.optional(),
  ipAddress: z.string().min(1).optional(),
  userAgent: z.string().min(1).optional(),
  createdAt: isoDateTimeSchema,
  createdBy: z.string().min(1),
  updatedAt: isoDateTimeSchema,
  updatedBy: z.string().min(1)
});

export type UserRecord = z.infer<typeof userSchema>;
export type RoleRecord = z.infer<typeof roleSchema>;
export type UserRoleRecord = z.infer<typeof userRoleSchema>;
export type SessionRecord = z.infer<typeof sessionSchema>;
export type ProjectRoleBindingRecord = z.infer<typeof projectRoleBindingSchema>;
export type RepositoryRoleBindingRecord = z.infer<typeof repositoryRoleBindingSchema>;
export type DelegatedPermissionRecord = z.infer<typeof delegatedPermissionSchema>;
export type OidcAuthStateRecord = z.infer<typeof oidcAuthStateSchema>;
