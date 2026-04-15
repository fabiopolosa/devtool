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
  error?: string;
}

const isReference = (value: string): boolean =>
  value.startsWith("env://") || value.startsWith("secret://");

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
  const isTestBypass =
    process.env.NODE_ENV === "test" && process.env.PROVIDER_CONFIG_VALIDATE_LIVE !== "1";
  if (isTestBypass) {
    return {
      status: "valid",
      lastValidatedAt: now
    };
  }

  const endpoint = input.endpoint?.trim() || defaultEndpointByProvider[input.provider];
  const timeoutMs = Math.max(3_000, input.timeoutMs ?? 30_000);
  const key = await resolveProviderApiKeyFromAuthRef(input.provider, input.authRef, input.tenantId);

  if (!key) {
    return {
      status: "invalid",
      lastValidatedAt: now,
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
        error: `Validation failed (${response.status})${preview ? `: ${preview}` : ""}`
      };
    }

    return {
      status: "valid",
      lastValidatedAt: now
    };
  } catch (error) {
    return {
      status: "invalid",
      lastValidatedAt: now,
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
