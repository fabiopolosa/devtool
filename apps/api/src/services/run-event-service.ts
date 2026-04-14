import type { RunEvent } from "../types/api.js";
import { apiStore } from "./api-store.js";

export class RunEventService {
  async list(runId: string): Promise<RunEvent[]> {
    return apiStore.getRunEvents(runId);
  }
}

export const runEventService = new RunEventService();
