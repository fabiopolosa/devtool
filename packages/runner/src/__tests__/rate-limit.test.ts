import { describe, expect, it } from "vitest";
import { InMemoryProviderRateLimiter } from "../rate-limit.js";

describe("InMemoryProviderRateLimiter", () => {
  it("enforces requests-per-minute limits", async () => {
    const limiter = new InMemoryProviderRateLimiter({
      resolveLimits: async () => ({ rpm: 1 })
    });

    await limiter.enforce({
      tenantId: "tenant_default",
      provider: "openai",
      estimatedTokens: 100,
      nowMs: 1_000
    });

    await expect(
      limiter.enforce({
        tenantId: "tenant_default",
        provider: "openai",
        estimatedTokens: 80,
        nowMs: 1_100
      })
    ).rejects.toThrow(/provider_rate_limit_exceeded:rpm/);
  });

  it("enforces tokens-per-minute limits", async () => {
    const limiter = new InMemoryProviderRateLimiter({
      resolveLimits: async () => ({ tpm: 120 })
    });

    await limiter.enforce({
      tenantId: "tenant_default",
      provider: "openai",
      estimatedTokens: 80,
      nowMs: 1_000
    });

    await expect(
      limiter.enforce({
        tenantId: "tenant_default",
        provider: "openai",
        estimatedTokens: 60,
        nowMs: 1_200
      })
    ).rejects.toThrow(/provider_rate_limit_exceeded:tpm/);
  });

  it("isolates counters by tenant and provider", async () => {
    const limiter = new InMemoryProviderRateLimiter({
      resolveLimits: async () => ({ rpm: 1 })
    });

    await limiter.enforce({
      tenantId: "tenant_a",
      provider: "openai",
      estimatedTokens: 10,
      nowMs: 1_000
    });

    await expect(
      limiter.enforce({
        tenantId: "tenant_a",
        provider: "openai",
        estimatedTokens: 10,
        nowMs: 1_100
      })
    ).rejects.toThrow(/provider_rate_limit_exceeded:rpm/);

    // Different tenant should still be allowed.
    await expect(
      limiter.enforce({
        tenantId: "tenant_b",
        provider: "openai",
        estimatedTokens: 10,
        nowMs: 1_100
      })
    ).resolves.toBeUndefined();

    // Different provider should still be allowed.
    await expect(
      limiter.enforce({
        tenantId: "tenant_a",
        provider: "anthropic",
        estimatedTokens: 10,
        nowMs: 1_100
      })
    ).resolves.toBeUndefined();
  });
});

