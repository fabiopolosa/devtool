import { z } from "zod";
import { idSchema, isoDateTimeSchema } from "./common.schema.js";

export const providerDiscoveryLogSchema = z.object({
  id: idSchema,
  source: z.enum(["startup", "manual"]),
  queries: z.array(z.string().min(1)).min(1),
  discoveredProviders: z.array(z.string().min(1)).default([]),
  discoveredModels: z.array(z.string().min(1)).default([]),
  status: z.enum(["success", "fallback", "failed"]),
  searchStartedAt: isoDateTimeSchema,
  searchFinishedAt: isoDateTimeSchema,
  notes: z.string().min(1).optional(),
  rawResults: z.record(z.unknown()).optional(),
  createdAt: isoDateTimeSchema,
  createdBy: z.string().min(1),
  updatedAt: isoDateTimeSchema,
  updatedBy: z.string().min(1)
});

export type ProviderDiscoveryLogSchema = z.infer<typeof providerDiscoveryLogSchema>;
