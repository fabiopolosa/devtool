import type { ProviderName } from "@cp/domain";

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

export interface SecretResolver {
  resolveProviderKey(provider: ProviderName): string | undefined;
  resolveAuthRef(authRef: string, provider?: ProviderName): string | undefined;
  redact(value: string | undefined): string;
}

export class EnvSecretResolver implements SecretResolver {
  resolveProviderKey(provider: ProviderName): string | undefined {
    const envKey = providerEnvKeyMap[provider];
    return process.env[envKey];
  }

  resolveAuthRef(authRef: string, provider?: ProviderName): string | undefined {
    if (!authRef) {
      return provider ? this.resolveProviderKey(provider) : undefined;
    }

    if (authRef.startsWith("env://")) {
      const envKey = authRef.replace("env://", "");
      return process.env[envKey];
    }

    if (authRef.startsWith("secret://")) {
      const [, secretPath = ""] = authRef.split("secret://");
      const segments = secretPath.split("/").filter(Boolean);
      if (segments.length >= 2 && segments[1] === "api-key") {
        const providerName = segments[0] as ProviderName;
        return this.resolveProviderKey(providerName);
      }
    }

    return provider ? this.resolveProviderKey(provider) : undefined;
  }

  redact(value: string | undefined): string {
    if (!value) return "<empty>";
    if (value.length <= 6) return "***";
    return `${value.slice(0, 2)}***${value.slice(-2)}`;
  }
}

export const defaultSecretResolver = new EnvSecretResolver();
