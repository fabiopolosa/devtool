import { EnvSecretResolver } from "./security/secret-resolver.js";
import { createDefaultProviderRegistry } from "./registry/default-provider-registry.js";
import { ModelRegistry } from "./models/model-registry.js";
import { ProjectProviderBindingService } from "./bindings/project-binding.js";
import { RoutingPolicyHelper } from "./routing/routing-policy.js";
import { ProviderAutoDiscoveryService } from "./discovery/provider-auto-discovery.js";

describe("providers unit", () => {
  it("resolves provider keys from env and auth refs", () => {
    const resolver = new EnvSecretResolver();

    process.env.OPENAI_API_KEY = "sk-test-openai";
    process.env.CUSTOM_PROVIDER_KEY = "custom-token";

    expect(resolver.resolveProviderKey("openai")).toBe("sk-test-openai");
    expect(resolver.resolveAuthRef("env://CUSTOM_PROVIDER_KEY")).toBe("custom-token");
    expect(resolver.resolveAuthRef("secret://openai/api-key")).toBe("sk-test-openai");
    expect(resolver.redact("abcdef123456")).toBe("ab***56");
  });

  it("builds default registry with capability providers", () => {
    const registry = createDefaultProviderRegistry();
    const all = registry.list();

    expect(all.length).toBeGreaterThanOrEqual(10);
    expect(registry.get("openai", "chat_reasoning")).toBeDefined();
    expect(registry.get("openai", "embedding")).toBeDefined();
    expect(registry.get("anthropic", "coding")).toBeDefined();
    expect(registry.get("gemini", "vision_analysis")).toBeDefined();
    expect(registry.get("kie_ai", "image_editing")).toBeDefined();
    expect(registry.get("mistral", "chat_reasoning")).toBeDefined();
    expect(registry.get("xai", "coding")).toBeDefined();
  });

  it("auto-discovers providers from web search excerpts with resilient fallback", async () => {
    const service = new ProviderAutoDiscoveryService({
      queries: ["popular llm providers 2026"],
      fetchImpl: (async () =>
        new Response(
          "Top providers include OpenAI, Anthropic, Gemini, Mistral, Cohere, AI21, xAI Grok, and Amazon Bedrock.",
          { status: 200 }
        )) as typeof fetch
    });

    const result = await service.run();
    expect(result.status).toBe("success");
    expect(result.discoveredProviders).toContain("openai");
    expect(result.discoveredProviders).toContain("mistral");
    expect(result.discoveredProviders).toContain("amazon_bedrock");
  });

  it("selects routing with binding + fallback using health", () => {
    const modelRegistry = new ModelRegistry();
    const bindingService = new ProjectProviderBindingService();

    modelRegistry.upsertMany([
      {
        id: "openai-coding",
        provider: "openai",
        modelId: "gpt-coding",
        capabilityClass: "coding",
        enabled: true
      },
      {
        id: "anthropic-coding",
        provider: "anthropic",
        modelId: "claude-coding",
        capabilityClass: "coding",
        enabled: true
      }
    ]);

    bindingService.bind({
      projectId: "proj_001",
      role: "codex_builder",
      capabilityClass: "coding",
      primaryModelId: "openai-coding",
      fallbackModelIds: ["anthropic-coding"]
    });

    const router = new RoutingPolicyHelper(modelRegistry, bindingService);

    const healthByModelId = new Map([
      ["gpt-coding", { status: "down" as const, checkedAt: new Date().toISOString() }],
      ["claude-coding", { status: "healthy" as const, checkedAt: new Date().toISOString() }]
    ]);

    const decision = router.select(
      {
        projectId: "proj_001",
        role: "codex_builder",
        capabilityClass: "coding",
        preferredProviderOrder: ["openai", "anthropic"],
        allowDegraded: false
      },
      healthByModelId
    );

    expect(decision).toBeTruthy();
    expect(decision?.selectedModel.provider).toBe("anthropic");
    expect(decision?.fallbackModels.some((model) => model.provider === "openai")).toBe(true);
  });
});
