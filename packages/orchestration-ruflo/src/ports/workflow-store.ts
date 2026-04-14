import type { WorkflowDefinition } from "../types/workflow.js";

export interface WorkflowStore {
  list(): Promise<WorkflowDefinition[]>;
  get(id: string): Promise<WorkflowDefinition | null>;
  upsert(definition: WorkflowDefinition): Promise<void>;
}

export class InMemoryWorkflowStore implements WorkflowStore {
  private readonly store = new Map<string, WorkflowDefinition>();

  async list(): Promise<WorkflowDefinition[]> {
    return [...this.store.values()];
  }

  async get(id: string): Promise<WorkflowDefinition | null> {
    return this.store.get(id) ?? null;
  }

  async upsert(definition: WorkflowDefinition): Promise<void> {
    this.store.set(definition.id, definition);
  }
}
