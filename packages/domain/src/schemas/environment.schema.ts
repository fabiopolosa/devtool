import { z } from "zod";
import { idSchema } from "./common.schema.js";

export const environmentStatusSchema = z.enum(["active", "degraded", "down", "maintenance"]);
export const machineStatusSchema = z.enum(["online", "degraded", "offline", "maintenance"]);

export const environmentSchema = z.object({
  id: idSchema,
  name: z.string().min(1),
  description: z.string().min(1),
  type: z.enum(["local", "development", "staging", "production"]),
  region: z.string().min(1).optional(),
  baseUrl: z.string().url().optional(),
  status: environmentStatusSchema,
  notes: z.array(z.string().min(1)).default([]),
  createdAt: z.string().datetime({ offset: true }),
  createdBy: z.string().min(1),
  updatedAt: z.string().datetime({ offset: true }),
  updatedBy: z.string().min(1)
});

export const machineSchema = z.object({
  id: idSchema,
  environmentId: idSchema,
  name: z.string().min(1),
  host: z.string().min(1),
  status: machineStatusSchema,
  cpuCores: z.number().int().nonnegative(),
  gpuCount: z.number().int().nonnegative(),
  ramGb: z.number().int().nonnegative(),
  services: z.array(z.string().min(1)).default([]),
  agents: z.array(z.string().min(1)).default([]),
  lastHeartbeatAt: z.string().datetime({ offset: true }).optional(),
  metadata: z.record(z.unknown()).default({}),
  createdAt: z.string().datetime({ offset: true }),
  createdBy: z.string().min(1),
  updatedAt: z.string().datetime({ offset: true }),
  updatedBy: z.string().min(1)
});

export type EnvironmentSchema = z.infer<typeof environmentSchema>;
export type MachineSchema = z.infer<typeof machineSchema>;
