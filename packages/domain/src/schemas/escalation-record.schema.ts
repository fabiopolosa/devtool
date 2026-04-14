import { z } from "zod";
import { idSchema } from "./common.schema.js";

export const escalationRecordSchema = z.object({
  id: idSchema,
  runId: idSchema,
  taskId: idSchema,
  reasonCode: z.enum([
    "verification_failure_repeat",
    "provider_health_down",
    "budget_limit_breach",
    "contract_violation",
    "dependency_missing",
    "unknown"
  ]),
  severity: z.enum(["low", "medium", "high", "critical"]),
  details: z.string().min(1),
  nextAction: z.enum(["retry", "reroute", "await_approval", "cancel", "manual_intervention"]),
  createdAt: z.string().datetime({ offset: true })
});

export type EscalationRecord = z.infer<typeof escalationRecordSchema>;
