import type { ProviderConfig, ProviderName } from "@cp/domain";
import { secretsService } from "./secrets-service.js";
import { apiStore } from "./api-store.js";

const providerEnvKeyMap: Record<ProviderName, string> = {
  openai: "OPENAI_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
  gemini: "GEMINI_API_KEY",
  openrouter: "OPENROUTER_API_KEY",
  kie_ai: "KIE_AI_API_KEY",
  mistral: "MISTRAL_API_KEY",
  cohere: "COHERE_API_KEY",
  ai21: "AI21_API_KEY",
  zhipu: "ZHIPU_API_KEY",
  meta_llama: "META_LLAMA_API_KEY",
  databricks_dbrx: "DATABRICKS_API_KEY",
  xai: "XAI_API_KEY",
  amazon_bedrock: "AWS_BEDROCK_API_KEY",
  aleph_alpha: "ALEPH_ALPHA_API_KEY"
};

const defaultEndpointByProvider: Record<ProviderName, string> = {
  openai: "https://api.openai.com/v1",
  anthropic: "https://api.anthropic.com/v1",
  gemini: "https://generativelanguage.googleapis.com/v1beta",
  openrouter: "https://openrouter.ai/api/v1",
  kie_ai: "https://api.kie.ai/v1",
  mistral: "https://api.mistral.ai/v1",
  cohere: "https://api.cohere.com/v1",
  ai21: "https://api.ai21.com/studio/v1",
  zhipu: "https://open.bigmodel.cn/api/paas/v4",
  meta_llama: "https://api.llama.com/v1",
  databricks_dbrx: "https://api.databricks.com/api/2.0/serving-endpoints",
  xai: "https://api.x.ai/v1",
  amazon_bedrock: "https://bedrock-runtime.us-east-1.amazonaws.com",
  aleph_alpha: "https://api.aleph-alpha.com"
};

export interface PreparedProviderCredentials {
  authRef: string;
  secretRef?: string;
  resolvedApiKey?: string;
}

export interface ProviderValidationResult {
  status: "valid" | "invalid";
  lastValidatedAt: string;
  latencyMs?: number;
  error?: string;
}

export type ProviderResolutionSource = "request" | "project" | "tenant" | "system";

export interface ResolveProviderSelectionInput {
  tenantId: string;
  projectId?: string;
  requestedProvider?: string;
  requestedModelId?: string;
  requestedProviderOrder?: string[];
  capabilityClass?: "coding" | "chat_reasoning";
}

export interface ResolvedProviderSelection {
  source: ProviderResolutionSource;
  provider: ProviderName;
  providerConfigId: string;
  modelId?: string;
  providerOrder: ProviderName[];
}

const defaultProviderMetadataKey = "isDefaultProvider";
const defaultModelMetadataKey = "defaultModelId";
const preferredSystemProviderOrder: ProviderName[] = ["openai", "anthropic", "gemini", "openrouter"];
const providerNameSet = new Set<ProviderName>(Object.keys(providerEnvKeyMap) as ProviderName[]);

const isReference = (value: string): boolean =>
  value.startsWith("env://") || value.startsWith("secret://");

const normalizeProviderNameInput = (value: string | undefined): ProviderName | undefined => {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) return undefined;
  return providerNameSet.has(normalized as ProviderName) ? (normalized as ProviderName) : undefined;
};

const normalizeProviderOrderInput = (value: string[] | undefined): ProviderName[] =>
  (value ?? [])
    .map((item) => normalizeProviderNameInput(item))
    .filter((item): item is ProviderName => Boolean(item));

const providerFromConfig = (config: Pick<ProviderConfig, "provider" | "providerId">): ProviderName =>
  (config.providerId ?? config.provider) as ProviderName;

const isValidEnabledConfig = (config: ProviderConfig): boolean =>
  config.enabled && (config.validationStatus ?? "unknown") === "valid";

const parseDefaultModelIdFromMetadata = (config: ProviderConfig): string | undefined => {
  const raw = config.metadata?.[defaultModelMetadataKey];
  return typeof raw === "string" && raw.trim().length > 0 ? raw.trim() : undefined;
};

const providerPriority = (provider: ProviderName): number => {
  const index = preferredSystemProviderOrder.indexOf(provider);
  return index >= 0 ? index : preferredSystemProviderOrder.length + 10;
};

const resolveScopedProviderConfigs = async (tenantId: string): Promise<ProviderConfig[]> => {
  const all = await apiStore.listProviderConfigs();
  return all.filter((config) => !config.tenantId || config.tenantId === tenantId);
};

const resolveEnabledModelsByConfig = async (): Promise<Map<string, string[]>> => {
  const allModels = await apiStore.listProviderModels();
  const grouped = new Map<string, string[]>();
  for (const model of allModels) {
    if (!model.enabled) continue;
    const current = grouped.get(model.providerConfigId) ?? [];
    current.push(model.modelId);
    grouped.set(model.providerConfigId, current);
  }
  for (const [providerConfigId, modelIds] of grouped.entries()) {
    grouped.set(providerConfigId, [...new Set(modelIds)].sort((left, right) => left.localeCompare(right)));
  }
  return grouped;
};

const mergeProviderOrder = (input: {
  selectedProvider: ProviderName;
  requestOrder: ProviderName[];
  validProviders: ProviderName[];
}): ProviderName[] => {
  const merged = [
    input.selectedProvider,
    ...input.requestOrder,
    ...input.validProviders.sort((left, right) => providerPriority(left) - providerPriority(right)),
    ...preferredSystemProviderOrder
  ];
  return [...new Set(merged)].filter((item) => providerNameSet.has(item));
};

const resolveDefaultModelForConfig = (
  config: ProviderConfig,
  enabledModelsByConfig: Map<string, string[]>,
  requestedModelId?: string
): string | undefined => {
  const modelIds = enabledModelsByConfig.get(config.id) ?? [];
  if (requestedModelId) {
    if (modelIds.length > 0 && !modelIds.includes(requestedModelId)) {
      throw new Error(
        `Requested model "${requestedModelId}" is not enabled for provider ${(config.providerId ?? config.provider)}`
      );
    }
    return requestedModelId;
  }

  const defaultFromMetadata = parseDefaultModelIdFromMetadata(config);
  if (defaultFromMetadata && (modelIds.length === 0 || modelIds.includes(defaultFromMetadata))) {
    return defaultFromMetadata;
  }

  return modelIds[0];
};

const resolveProjectDefaultSelection = async (input: {
  projectId: string;
  validConfigsById: Map<string, ProviderConfig>;
  enabledModelsByConfig: Map<string, string[]>;
  capabilityClass: "coding" | "chat_reasoning";
}): Promise<{ provider: ProviderName; providerConfigId: string; modelId?: string } | null> => {
  const bindings = (await apiStore.listProviderBindings(input.projectId)).filter(
    (binding) => binding.projectId === input.projectId && binding.enabled
  );
  if (bindings.length === 0) return null;

  const selectedBinding = [...bindings].sort((left, right) => {
    const capabilityRank = (value: string): number => {
      if (value === input.capabilityClass) return 0;
      if (value === "coding") return 1;
      if (value === "chat_reasoning") return 2;
      return 10;
    };
    const roleRank = (value: string | undefined): number => {
      if (value === "codex_builder") return 0;
      if (!value) return 1;
      return 2;
    };
    return capabilityRank(left.capabilityClass) - capabilityRank(right.capabilityClass)
      || roleRank(left.role)
      - roleRank(right.role)
      || left.createdAt.localeCompare(right.createdAt);
  })[0];
  if (!selectedBinding) return null;

  const allModels = await apiStore.listProviderModels();
  const selectedModel = allModels.find((model) => model.id === selectedBinding.primaryModelId && model.enabled);
  if (!selectedModel) return null;
  const config = input.validConfigsById.get(selectedModel.providerConfigId);
  if (!config) return null;

  const modelIds = input.enabledModelsByConfig.get(config.id) ?? [];
  const resolvedModelId = modelIds.includes(selectedModel.modelId) ? selectedModel.modelId : modelIds[0];
  return {
    provider: providerFromConfig(config),
    providerConfigId: config.id,
    ...(resolvedModelId ? { modelId: resolvedModelId } : {})
  };
};

export const resolveProviderModelSelection = async (
  input: ResolveProviderSelectionInput
): Promise<ResolvedProviderSelection> => {
  const configs = await resolveScopedProviderConfigs(input.tenantId);
  const validConfigs = configs
    .filter((config) => isValidEnabledConfig(config))
    .sort((left, right) => left.id.localeCompare(right.id));
  if (validConfigs.length === 0) {
    throw new Error(`No enabled valid provider configs available for tenant "${input.tenantId}"`);
  }

  const validConfigsById = new Map(validConfigs.map((config) => [config.id, config]));
  const validConfigsByProvider = new Map<ProviderName, ProviderConfig[]>();
  for (const config of validConfigs) {
    const provider = providerFromConfig(config);
    const current = validConfigsByProvider.get(provider) ?? [];
    current.push(config);
    validConfigsByProvider.set(provider, current);
  }
  const enabledModelsByConfig = await resolveEnabledModelsByConfig();
  const requestedProvider = normalizeProviderNameInput(input.requestedProvider);
  const requestedModelId = input.requestedModelId?.trim();
  const requestOrder = normalizeProviderOrderInput(input.requestedProviderOrder);

  if (requestedProvider) {
    const providerConfigs = validConfigsByProvider.get(requestedProvider) ?? [];
    const selectedConfig = providerConfigs
      .slice()
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt) || left.id.localeCompare(right.id))[0];
    if (!selectedConfig) {
      throw new Error(`Requested provider "${requestedProvider}" is not enabled/valid for tenant "${input.tenantId}"`);
    }
    const modelId = resolveDefaultModelForConfig(selectedConfig, enabledModelsByConfig, requestedModelId);
    return {
      source: "request",
      provider: requestedProvider,
      providerConfigId: selectedConfig.id,
      ...(modelId ? { modelId } : {}),
      providerOrder: mergeProviderOrder({
        selectedProvider: requestedProvider,
        requestOrder,
        validProviders: [...validConfigsByProvider.keys()]
      })
    };
  }

  if (requestedModelId) {
    const candidateConfigs = validConfigs.filter((config) => {
      const modelIds = enabledModelsByConfig.get(config.id) ?? [];
      return modelIds.includes(requestedModelId);
    });

    if (candidateConfigs.length === 0) {
      throw new Error(`Requested model "${requestedModelId}" is not enabled for any valid provider`);
    }
    if (candidateConfigs.length > 1) {
      throw new Error(
        `Requested model "${requestedModelId}" is ambiguous across providers; provide an explicit provider`
      );
    }
    const selectedConfig = candidateConfigs[0]!;
    const selectedProvider = providerFromConfig(selectedConfig);
    return {
      source: "request",
      provider: selectedProvider,
      providerConfigId: selectedConfig.id,
      modelId: requestedModelId,
      providerOrder: mergeProviderOrder({
        selectedProvider,
        requestOrder,
        validProviders: [...validConfigsByProvider.keys()]
      })
    };
  }

  if (input.projectId) {
    const projectSelection = await resolveProjectDefaultSelection({
      projectId: input.projectId,
      validConfigsById,
      enabledModelsByConfig,
      capabilityClass: input.capabilityClass ?? "coding"
    });
    if (projectSelection) {
      return {
        source: "project",
        provider: projectSelection.provider,
        providerConfigId: projectSelection.providerConfigId,
        ...(projectSelection.modelId ? { modelId: projectSelection.modelId } : {}),
        providerOrder: mergeProviderOrder({
          selectedProvider: projectSelection.provider,
          requestOrder,
          validProviders: [...validConfigsByProvider.keys()]
        })
      };
    }
  }

  const tenantDefaultConfig = validConfigs
    .filter((config) => config.metadata?.[defaultProviderMetadataKey] === true)
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt) || left.id.localeCompare(right.id))[0];
  if (tenantDefaultConfig) {
    const selectedProvider = providerFromConfig(tenantDefaultConfig);
    const modelId = resolveDefaultModelForConfig(tenantDefaultConfig, enabledModelsByConfig);
    return {
      source: "tenant",
      provider: selectedProvider,
      providerConfigId: tenantDefaultConfig.id,
      ...(modelId ? { modelId } : {}),
      providerOrder: mergeProviderOrder({
        selectedProvider,
        requestOrder,
        validProviders: [...validConfigsByProvider.keys()]
      })
    };
  }

  const systemConfig = validConfigs
    .slice()
    .sort((left, right) => {
      const byProvider = providerPriority(providerFromConfig(left)) - providerPriority(providerFromConfig(right));
      if (byProvider !== 0) return byProvider;
      const byUpdated = right.updatedAt.localeCompare(left.updatedAt);
      if (byUpdated !== 0) return byUpdated;
      return left.id.localeCompare(right.id);
    })[0];
  if (!systemConfig) {
    throw new Error("Unable to resolve system default provider");
  }
  const selectedProvider = providerFromConfig(systemConfig);
  const modelId = resolveDefaultModelForConfig(systemConfig, enabledModelsByConfig);

  return {
    source: "system",
    provider: selectedProvider,
    providerConfigId: systemConfig.id,
    ...(modelId ? { modelId } : {}),
    providerOrder: mergeProviderOrder({
      selectedProvider,
      requestOrder,
      validProviders: [...validConfigsByProvider.keys()]
    })
  };
};

const providerConfigSecretName = (
  tenantId: string,
  provider: ProviderName,
  providerConfigId: string
): string => `provider.${tenantId}.${provider}.${providerConfigId}.api_key`;

const redactSecret = (value?: string): string | undefined => {
  if (!value) return undefined;
  if (value.startsWith("sk-")) return "sk-****";
  if (value.length <= 6) return "***";
  return `${value.slice(0, 2)}***${value.slice(-2)}`;
};

const resolveProviderEnvRef = (provider: ProviderName): string => `env://${providerEnvKeyMap[provider]}`;

const authRefToEnvValue = (authRef: string): string | undefined => {
  if (!authRef.startsWith("env://")) return undefined;
  const key = authRef.slice("env://".length).trim();
  return key ? process.env[key] : undefined;
};

const authRefToSecretPath = (authRef: string): string | undefined =>
  authRef.startsWith("secret://") ? authRef.slice("secret://".length) : undefined;

const parseProviderScopedSecretRef = (authRef: string): { provider: ProviderName; providerConfigId: string } | null => {
  const path = authRefToSecretPath(authRef);
  if (!path) return null;
  const [scope, provider, providerConfigId, keyName] = path.split("/").filter(Boolean);
  if (scope !== "provider" || keyName !== "api-key" || !provider || !providerConfigId) return null;
  return { provider: provider as ProviderName, providerConfigId };
};

export const resolveProviderApiKeyFromAuthRef = async (
  provider: ProviderName,
  authRef: string,
  tenantId: string
): Promise<string | undefined> => {
  const envValue = authRefToEnvValue(authRef);
  if (envValue) return envValue;

  const scopedSecret = parseProviderScopedSecretRef(authRef);
  if (scopedSecret) {
    const secretName = providerConfigSecretName(tenantId, scopedSecret.provider, scopedSecret.providerConfigId);
    try {
      return await secretsService.resolveSecretValueByName(secretName, "provider");
    } catch {
      // Fall through to generic secret resolution.
    }
  }

  const secretPath = authRefToSecretPath(authRef);
  if (secretPath) {
    if (secretPath === `${provider}/api-key` || secretPath === `provider/${provider}/api-key`) {
      const envKey = providerEnvKeyMap[provider];
      return process.env[envKey];
    }

    try {
      return await secretsService.resolveSecretValueByName(secretPath.replaceAll("/", "."), "provider");
    } catch {
      // Ignore and continue to provider default env.
    }
  }

  return process.env[providerEnvKeyMap[provider]];
};

export const prepareProviderCredentials = async (input: {
  tenantId: string;
  provider: ProviderName;
  providerConfigId: string;
  actor: string;
  apiKeyInput?: string;
  authRefInput?: string;
  existingConfig?: ProviderConfig;
}): Promise<PreparedProviderCredentials> => {
  const { tenantId, provider, providerConfigId, actor, existingConfig } = input;
  const apiKeyInput = input.apiKeyInput?.trim();
  const authRefInput = input.authRefInput?.trim();

  let authRef =
    authRefInput ??
    existingConfig?.authRef ??
    resolveProviderEnvRef(provider);
  let secretRef = existingConfig?.secretRef;
  let resolvedApiKey = await resolveProviderApiKeyFromAuthRef(provider, authRef, tenantId);

  if (apiKeyInput) {
    if (isReference(apiKeyInput)) {
      authRef = apiKeyInput;
      resolvedApiKey = await resolveProviderApiKeyFromAuthRef(provider, authRef, tenantId);
      if (authRef.startsWith("secret://provider/")) {
        secretRef = authRef;
      } else if (authRef.startsWith("secret://")) {
        secretRef = authRef;
      }
    } else {
      const secretName = providerConfigSecretName(tenantId, provider, providerConfigId);
      const existingSecret = await apiStore.findSecretByName(secretName, "provider");
      if (existingSecret) {
        await secretsService.updateSecret(existingSecret.id, { value: apiKeyInput }, actor);
      } else {
        await secretsService.createSecret(
          {
            name: secretName,
            description: `Provider API key for ${provider} (${providerConfigId})`,
            value: apiKeyInput,
            scope: "provider"
          },
          actor
        );
      }
      authRef = `secret://provider/${provider}/${providerConfigId}/api-key`;
      secretRef = authRef;
      resolvedApiKey = apiKeyInput;
    }
  }

  return {
    authRef,
    ...(secretRef ? { secretRef } : {}),
    ...(resolvedApiKey ? { resolvedApiKey } : {})
  };
};

const safeResponseText = async (response: Response): Promise<string> => {
  try {
    const text = await response.text();
    return text.slice(0, 300);
  } catch {
    return "";
  }
};

const buildValidationRequest = (
  provider: ProviderName,
  endpoint: string,
  apiKey: string
): { url: string; headers: Record<string, string> } => {
  switch (provider) {
    case "openai":
      return {
        url: `${endpoint.replace(/\/$/, "")}/models`,
        headers: { Authorization: `Bearer ${apiKey}` }
      };
    case "anthropic":
      return {
        url: `${endpoint.replace(/\/$/, "")}/models`,
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01"
        }
      };
    case "gemini":
      return {
        url: `${endpoint.replace(/\/$/, "")}/models?key=${encodeURIComponent(apiKey)}`,
        headers: {}
      };
    case "openrouter":
      return {
        url: `${endpoint.replace(/\/$/, "")}/models`,
        headers: { Authorization: `Bearer ${apiKey}` }
      };
    case "kie_ai":
      return {
        url: `${endpoint.replace(/\/$/, "")}/models`,
        headers: { Authorization: `Bearer ${apiKey}` }
      };
    default:
      return {
        url: `${endpoint.replace(/\/$/, "")}/models`,
        headers: { Authorization: `Bearer ${apiKey}` }
      };
  }
};

export const validateProviderConfig = async (input: {
  provider: ProviderName;
  tenantId: string;
  authRef: string;
  endpoint?: string;
  timeoutMs?: number;
}): Promise<ProviderValidationResult> => {
  const now = new Date().toISOString();
  const startedAt = Date.now();
  const isTestBypass =
    process.env.NODE_ENV === "test" && process.env.PROVIDER_CONFIG_VALIDATE_LIVE !== "1";
  if (isTestBypass) {
    return {
      status: "valid",
      lastValidatedAt: now,
      latencyMs: 0
    };
  }

  const endpoint = input.endpoint?.trim() || defaultEndpointByProvider[input.provider];
  const timeoutMs = Math.max(3_000, input.timeoutMs ?? 30_000);
  const key = await resolveProviderApiKeyFromAuthRef(input.provider, input.authRef, input.tenantId);

  if (!key) {
    return {
      status: "invalid",
      lastValidatedAt: now,
      latencyMs: Date.now() - startedAt,
      error: `Missing credentials for ${input.provider}. Configure authRef/env before enabling live calls.`
    };
  }

  const { url, headers } = buildValidationRequest(input.provider, endpoint, key);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method: "GET",
      headers,
      signal: controller.signal
    });

    if (!response.ok) {
      const preview = await safeResponseText(response);
      return {
        status: "invalid",
        lastValidatedAt: now,
        latencyMs: Date.now() - startedAt,
        error: `Validation failed (${response.status})${preview ? `: ${preview}` : ""}`
      };
    }

    return {
      status: "valid",
      lastValidatedAt: now,
      latencyMs: Date.now() - startedAt
    };
  } catch (error) {
    return {
      status: "invalid",
      lastValidatedAt: now,
      latencyMs: Date.now() - startedAt,
      error: error instanceof Error ? error.message : "Provider validation failed"
    };
  } finally {
    clearTimeout(timer);
  }
};

export const toProviderConfigResponse = async (item: ProviderConfig): Promise<ProviderConfig> => {
  const resolved = await resolveProviderApiKeyFromAuthRef(
    item.providerId ?? item.provider,
    item.authRef,
    item.tenantId ?? "tenant_default"
  );
  const response: ProviderConfig = {
    ...item,
    ...(item.authRef || item.secretRef || item.apiKey || resolved
      ? { apiKeyMasked: redactSecret(resolved) ?? "sk-****" }
      : {})
  };
  delete (response as { apiKey?: string }).apiKey;
  return response;
};

export const redactedProviderConfigForAudit = (item: ProviderConfig | undefined): Record<string, unknown> | undefined => {
  if (!item) return undefined;
  return {
    ...item,
    ...(item.apiKey ? { apiKey: "sk-****" } : {}),
    ...(item.apiKeyMasked ? { apiKeyMasked: "sk-****" } : {})
  };
};
