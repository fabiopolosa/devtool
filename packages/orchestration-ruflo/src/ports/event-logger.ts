import type { OrchestrationRunEvent } from "../types/run.js";

export interface RunEventLogger {
  append(event: OrchestrationRunEvent): Promise<void>;
  list(runId: string): Promise<OrchestrationRunEvent[]>;
}

export class InMemoryRunEventLogger implements RunEventLogger {
  private readonly events = new Map<string, OrchestrationRunEvent[]>();

  async append(event: OrchestrationRunEvent): Promise<void> {
    const existing = this.events.get(event.runId) ?? [];
    this.events.set(event.runId, [...existing, event]);
  }

  async list(runId: string): Promise<OrchestrationRunEvent[]> {
    return this.events.get(runId) ?? [];
  }
}
