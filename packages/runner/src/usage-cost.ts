import type { ProviderName } from "@cp/domain";

const providerRatesPerThousandTokens: Partial<Record<ProviderName, { input: number; output: number }>> = {
  openai: { input: 0.005, output: 0.015 },
  anthropic: { input: 0.008, output: 0.024 },
  gemini: { input: 0.002, output: 0.006 },
  openrouter: { input: 0.006, output: 0.018 },
  kie_ai: { input: 0.004, output: 0.012 },
  mistral: { input: 0.004, output: 0.012 },
  cohere: { input: 0.004, output: 0.012 },
  ai21: { input: 0.005, output: 0.015 },
  zhipu: { input: 0.003, output: 0.009 },
  meta_llama: { input: 0.002, output: 0.006 },
  databricks_dbrx: { input: 0.004, output: 0.012 },
  xai: { input: 0.005, output: 0.015 },
  amazon_bedrock: { input: 0.005, output: 0.015 },
  aleph_alpha: { input: 0.006, output: 0.018 }
};

const fallbackRate = { input: 0.005, output: 0.015 };

export const estimateUsageCost = (
  provider: ProviderName | string,
  inputTokens: number,
  outputTokens: number
): number => {
  const rate = providerRatesPerThousandTokens[provider as ProviderName] ?? fallbackRate;
  const total =
    (Math.max(0, inputTokens) / 1000) * rate.input + (Math.max(0, outputTokens) / 1000) * rate.output;
  return Number(total.toFixed(6));
};
