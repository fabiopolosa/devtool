import { z } from "zod";
import { capabilityClasses } from "../capabilities.js";
import { idSchema } from "./common.schema.js";
import { agentRuntimeAdapterTypeToRuntimeKindMap } from "../entities/runtime-profile.js";
import { agentRuntimeProfileSchema } from "./runtime-profile.schema.js";
import { heartbeatPolicySchema } from "./heartbeat-policy.schema.js";

export const agentConfigStatusSchema = z.enum(["active", "paused", "degraded", "error"]);
export const agentRuntimeAdapterTypeSchema = z.enum(["legacy_cli", "custom_cli", "mcp_runtime"]);

export const agentRuntimeAdapterTypeToRuntimeKindSchema = z.object({
  legacy_cli: z.literal(agentRuntimeAdapterTypeToRuntimeKindMap.legacy_cli),
  custom_cli: z.literal(agentRuntimeAdapterTypeToRuntimeKindMap.custom_cli),
  mcp_runtime: z.literal(agentRuntimeAdapterTypeToRuntimeKindMap.mcp_runtime)
});

export const agentConfigSchema = z.object({
  id: idSchema,
  name: z.string().min(1),
  role: z.string().min(1),
  icon: z.string().min(1),
  description: z.string().min(1),
  adapterType: agentRuntimeAdapterTypeSchema,
  desiredSkills: z.array(z.string().min(1)).default([]),
  reportTo: z.string().min(1).optional(),
  runtimeConfig: z.record(z.unknown()).default({}),
  runtimeProfile: agentRuntimeProfileSchema.optional(),
  heartbeatPolicy: heartbeatPolicySchema.optional(),
  capabilities: z.array(z.enum(capabilityClasses)).default([]),
  createdAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true }),
  status: agentConfigStatusSchema
});

export type AgentConfigSchema = z.infer<typeof agentConfigSchema>;
export type AgentRuntimeAdapterTypeSchema = z.infer<typeof agentRuntimeAdapterTypeSchema>;
