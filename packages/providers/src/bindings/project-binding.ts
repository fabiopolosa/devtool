import type { CapabilityClass, ID, ProviderName } from "@cp/domain";
import type { AgentRoleName } from "@cp/domain";
import type { RegisteredModel } from "../models/model-registry.js";

export interface ProjectProviderBindingInput {
  projectId: ID;
  role?: AgentRoleName;
  capabilityClass: CapabilityClass;
  primaryModelId: string;
  fallbackModelIds: string[];
}

export interface EffectiveProviderBinding {
  projectId: ID;
  role?: AgentRoleName;
  capabilityClass: CapabilityClass;
  provider: ProviderName;
  primaryModel: RegisteredModel;
  fallbackModels: RegisteredModel[];
}

export class ProjectProviderBindingService {
  private readonly bindings = new Map<string, ProjectProviderBindingInput>();

  bind(input: ProjectProviderBindingInput): void {
    this.bindings.set(this.key(input.projectId, input.role, input.capabilityClass), input);
  }

  get(projectId: ID, role: AgentRoleName | undefined, capabilityClass: CapabilityClass): ProjectProviderBindingInput | undefined {
    return this.bindings.get(this.key(projectId, role, capabilityClass));
  }

  list(projectId: ID): ProjectProviderBindingInput[] {
    return [...this.bindings.values()].filter(binding => binding.projectId === projectId);
  }

  private key(projectId: ID, role: AgentRoleName | undefined, capabilityClass: CapabilityClass): string {
    return `${projectId}:${role ?? "*"}:${capabilityClass}`;
  }
}
