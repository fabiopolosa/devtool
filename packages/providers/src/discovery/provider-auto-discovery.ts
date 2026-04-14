import type { ProviderName } from "@cp/domain";

export interface ProviderAutoDiscoveryResult {
  startedAt: string;
  finishedAt: string;
  status: "success" | "fallback" | "failed";
  queries: string[];
  discoveredProviders: ProviderName[];
  discoveredModels: string[];
  rawResults: Array<{ query: string; source: string; excerpt: string }>;
  notes?: string;
}

export interface ProviderAutoDiscoveryOptions {
  queries?: string[];
  searchEndpoint?: string;
  fetchImpl?: typeof fetch;
}

export const defaultProviderDiscoveryQueries: string[] = [
  "2026 most popular AI providers large language models widely used providers",
  "best enterprise LLM providers 2026",
  "top AI model providers 2026 chat coding embeddings"
];

const defaultProviders: ProviderName[] = ["openai", "anthropic", "gemini", "openrouter", "kie_ai"];

const providerPatterns: Array<{ provider: ProviderName; patterns: RegExp[]; models: string[] }> = [
  { provider: "openai", patterns: [/\bopenai\b/gi, /\bgpt[-\s]?4\b/gi], models: ["gpt-4.1", "gpt-4o", "o4-mini"] },
  {
    provider: "anthropic",
    patterns: [/\banthropic\b/gi, /\bclaude\b/gi],
    models: ["claude-3.7-sonnet", "claude-opus-4"]
  },
  {
    provider: "gemini",
    patterns: [/\bgemini\b/gi, /\bgoogle\s+deepmind\b/gi],
    models: ["gemini-2.0-flash", "gemini-2.5-pro"]
  },
  {
    provider: "openrouter",
    patterns: [/\bopenrouter\b/gi],
    models: ["openrouter/auto", "openrouter/quasar-alpha"]
  },
  {
    provider: "kie_ai",
    patterns: [/\bkie\.?ai\b/gi],
    models: ["kie-vl-1", "kie-image-1"]
  },
  {
    provider: "mistral",
    patterns: [/\bmistral\b/gi, /\bcodestral\b/gi],
    models: ["mistral-large-latest", "codestral-latest"]
  },
  {
    provider: "cohere",
    patterns: [/\bcohere\b/gi],
    models: ["command-r-plus", "command-a"]
  },
  {
    provider: "ai21",
    patterns: [/\bai21\b/gi, /\bjamba\b/gi],
    models: ["jamba-1.5-large", "jamba-1.5-mini"]
  },
  {
    provider: "zhipu",
    patterns: [/\bzhipu\b/gi, /\bglm-4\b/gi],
    models: ["glm-4-plus", "glm-4-air"]
  },
  {
    provider: "meta_llama",
    patterns: [/\bmeta\b/gi, /\bllama\b/gi],
    models: ["llama-4-maverick", "llama-4-scout"]
  },
  {
    provider: "databricks_dbrx",
    patterns: [/\bdatabricks\b/gi, /\bdbrx\b/gi],
    models: ["databricks-dbrx-instruct", "databricks-meta-llama-3-70b-instruct"]
  },
  {
    provider: "xai",
    patterns: [/\bx\.?ai\b/gi, /\bgrok\b/gi],
    models: ["grok-3", "grok-3-mini"]
  },
  {
    provider: "amazon_bedrock",
    patterns: [/\bamazon\s+bedrock\b/gi, /\bbedrock\b/gi],
    models: ["amazon.nova-pro-v1:0", "anthropic.claude-3-7-sonnet-20250219-v1:0"]
  },
  {
    provider: "aleph_alpha",
    patterns: [/\baleph\s+alpha\b/gi],
    models: ["luminous-supreme-control", "luminous-extended"]
  }
];

const toExcerpt = (value: string): string =>
  value
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 320);

export class ProviderAutoDiscoveryService {
  private readonly fetchImpl: typeof fetch;
  private readonly queries: string[];
  private readonly searchEndpoint: string | undefined;

  constructor(options: ProviderAutoDiscoveryOptions = {}) {
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.queries = options.queries ?? defaultProviderDiscoveryQueries;
    this.searchEndpoint = options.searchEndpoint ?? process.env.PROVIDER_DISCOVERY_SEARCH_ENDPOINT;
  }

  async run(): Promise<ProviderAutoDiscoveryResult> {
    const startedAt = new Date().toISOString();
    const excerpts: Array<{ query: string; source: string; excerpt: string }> = [];
    const discoveredProviders = new Set<ProviderName>();
    const discoveredModels = new Set<string>();

    let successfulQueries = 0;

    for (const query of this.queries) {
      try {
        const result = await this.search(query);
        successfulQueries += 1;
        excerpts.push({ query, source: result.source, excerpt: toExcerpt(result.body) });

        const body = result.body.toLowerCase();
        for (const candidate of providerPatterns) {
          if (candidate.patterns.some((pattern) => pattern.test(body))) {
            discoveredProviders.add(candidate.provider);
            for (const model of candidate.models) {
              discoveredModels.add(model);
            }
          }
        }
      } catch {
        excerpts.push({
          query,
          source: this.searchEndpoint ?? "duckduckgo",
          excerpt: "search_failed"
        });
      }
    }

    const finishedAt = new Date().toISOString();

    if (successfulQueries === 0) {
      return {
        startedAt,
        finishedAt,
        status: "fallback",
        queries: [...this.queries],
        discoveredProviders: [...defaultProviders],
        discoveredModels: [],
        rawResults: excerpts,
        notes: "Web search unavailable, falling back to built-in providers only."
      };
    }

    for (const provider of defaultProviders) {
      discoveredProviders.add(provider);
    }

    const status: ProviderAutoDiscoveryResult["status"] = discoveredProviders.size > 0 ? "success" : "failed";

    return {
      startedAt,
      finishedAt,
      status,
      queries: [...this.queries],
      discoveredProviders: [...discoveredProviders],
      discoveredModels: [...discoveredModels],
      rawResults: excerpts,
      ...(status === "failed"
        ? { notes: "Search responses were received but no provider patterns were detected." }
        : {})
    };
  }

  private async search(query: string): Promise<{ source: string; body: string }> {
    const encoded = encodeURIComponent(query);

    if (this.searchEndpoint && this.searchEndpoint.trim().length > 0) {
      const endpoint = `${this.searchEndpoint.replace(/\/$/, "")}?q=${encoded}`;
      const response = await this.fetchImpl(endpoint, { method: "GET" });
      if (!response.ok) {
        throw new Error(`Search endpoint failed (${response.status})`);
      }
      return {
        source: this.searchEndpoint,
        body: await response.text()
      };
    }

    // Anonymous text-friendly fetch through jina mirror over DuckDuckGo query page.
    const response = await this.fetchImpl(`https://r.jina.ai/http://duckduckgo.com/?q=${encoded}`, {
      method: "GET"
    });
    if (!response.ok) {
      throw new Error(`DuckDuckGo search failed (${response.status})`);
    }

    return {
      source: "duckduckgo",
      body: await response.text()
    };
  }
}
