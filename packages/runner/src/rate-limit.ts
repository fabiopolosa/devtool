import type { ProviderName } from "@cp/domain";

export interface ProviderRateLimits {
  rpm?: number;
  tpm?: number;
}

export interface ProviderRateLimitResolver {
  resolveLimits(tenantId: string, provider: ProviderName): Promise<ProviderRateLimits>;
}

export interface ProviderRateLimitEnforceInput {
  tenantId: string;
  provider: ProviderName;
  estimatedTokens: number;
  nowMs?: number;
}

export interface ProviderRateLimiter {
  enforce(input: ProviderRateLimitEnforceInput): Promise<void>;
}

type UsageWindow = {
  windowStartMs: number;
  requests: number;
  tokens: number;
};

const keyFor = (tenantId: string, provider: ProviderName): string => `${tenantId}:${provider}`;

export class InMemoryProviderRateLimiter implements ProviderRateLimiter {
  private readonly usageByProvider = new Map<string, UsageWindow>();

  constructor(
    private readonly resolver: ProviderRateLimitResolver,
    private readonly windowMs: number = 60_000
  ) {}

  clearTenant(tenantId: string): void {
    for (const key of this.usageByProvider.keys()) {
      if (key.startsWith(`${tenantId}:`)) {
        this.usageByProvider.delete(key);
      }
    }
  }

  async enforce(input: ProviderRateLimitEnforceInput): Promise<void> {
    const limits = await this.resolver.resolveLimits(input.tenantId, input.provider);
    const rpm = limits.rpm;
    const tpm = limits.tpm;
    if (!rpm && !tpm) return;

    const nowMs = input.nowMs ?? Date.now();
    const key = keyFor(input.tenantId, input.provider);
    const existing = this.usageByProvider.get(key);
    const inWindow = existing && nowMs - existing.windowStartMs < this.windowMs;
    const usage: UsageWindow = inWindow
      ? existing
      : {
          windowStartMs: nowMs,
          requests: 0,
          tokens: 0
        };

    const nextRequests = usage.requests + 1;
    const nextTokens = usage.tokens + Math.max(1, input.estimatedTokens);

    if (rpm && nextRequests > rpm) {
      throw new Error(
        `provider_rate_limit_exceeded:rpm provider=${input.provider} tenant=${input.tenantId} limit=${rpm}`
      );
    }

    if (tpm && nextTokens > tpm) {
      throw new Error(
        `provider_rate_limit_exceeded:tpm provider=${input.provider} tenant=${input.tenantId} limit=${tpm}`
      );
    }

    usage.requests = nextRequests;
    usage.tokens = nextTokens;
    this.usageByProvider.set(key, usage);
  }
}

