import type { CapabilityClass, ProviderName } from "@cp/domain";
import type { AgentRoleName, ID } from "@cp/domain";
import type { ProviderHealthStatus } from "@cp/domain";
import type { RegisteredModel, ModelRegistry } from "../models/model-registry.js";
import type { ProjectProviderBindingService } from "../bindings/project-binding.js";

export interface RoutingPreference {
  projectId: ID;
  role?: AgentRoleName;
  capabilityClass: CapabilityClass;
  preferredProviderOrder: ProviderName[];
  allowDegraded: boolean;
}

export interface RoutingDecision {
  projectId: ID;
  role?: AgentRoleName;
  capabilityClass: CapabilityClass;
  selectedModel: RegisteredModel;
  fallbackModels: RegisteredModel[];
  reasonCodes: string[];
}

export class RoutingPolicyHelper {
  constructor(
    private readonly modelRegistry: ModelRegistry,
    private readonly bindingService: ProjectProviderBindingService
  ) {}

  select(preference: RoutingPreference, healthByModelId: Map<string, ProviderHealthStatus>): RoutingDecision | null {
    const binding = this.bindingService.get(preference.projectId, preference.role, preference.capabilityClass)
      ?? this.bindingService.get(preference.projectId, undefined, preference.capabilityClass);

    const candidates = this.modelRegistry
      .listByCapability(preference.capabilityClass)
      .slice()
      .sort((a, b) => this.scoreModel(preference, a, healthByModelId) - this.scoreModel(preference, b, healthByModelId));

    if (candidates.length === 0) return null;

    const selected = this.pickPrimary(candidates, binding, healthByModelId, preference.allowDegraded);
    if (!selected) return null;

    const fallbackModels = candidates.filter(model => model.modelId !== selected.modelId);
    const decision: RoutingDecision = {
      projectId: preference.projectId,
      capabilityClass: preference.capabilityClass,
      selectedModel: selected,
      fallbackModels,
      reasonCodes: [
        binding ? "project_binding" : "default_capability_fallback",
        healthByModelId.get(selected.modelId)?.status === "healthy" ? "healthy_model" : "non_healthy_selected"
      ]
    };

    if (preference.role) {
      decision.role = preference.role;
    }

    return decision;
  }

  private pickPrimary(
    candidates: RegisteredModel[],
    binding: ReturnType<ProjectProviderBindingService["get"]>,
    healthByModelId: Map<string, ProviderHealthStatus>,
    allowDegraded: boolean
  ): RegisteredModel | null {
    if (binding) {
      const primary = candidates.find(
        (model) => model.id === binding.primaryModelId || model.modelId === binding.primaryModelId
      );
      if (primary && this.isSelectable(primary, healthByModelId, allowDegraded)) return primary;

      for (const fallbackId of binding.fallbackModelIds) {
        const fallback = candidates.find((model) => model.id === fallbackId || model.modelId === fallbackId);
        if (fallback && this.isSelectable(fallback, healthByModelId, allowDegraded)) return fallback;
      }
    }

    return candidates.find(model => this.isSelectable(model, healthByModelId, allowDegraded)) ?? null;
  }

  private scoreModel(
    preference: RoutingPreference,
    model: RegisteredModel,
    healthByModelId: Map<string, ProviderHealthStatus>
  ): number {
    const health = healthByModelId.get(model.modelId)?.status ?? "unknown";
    const healthPenalty = health === "healthy" ? 0 : health === "degraded" ? 10 : health === "down" ? 1_000 : 50;
    const providerPreference = preference.preferredProviderOrder.indexOf(model.provider);
    const providerPenalty = providerPreference === -1 ? 25 : providerPreference;
    return healthPenalty + providerPenalty;
  }

  private isSelectable(
    model: RegisteredModel,
    healthByModelId: Map<string, ProviderHealthStatus>,
    allowDegraded: boolean
  ): boolean {
    const status = healthByModelId.get(model.modelId)?.status ?? model.healthStatus ?? "unknown";
    if (status === "down") return false;
    if (!allowDegraded && status === "degraded") return false;
    return true;
  }
}
