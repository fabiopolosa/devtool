import { useCallback, useEffect, useMemo, useState } from 'react';
import type {
  CapabilityClass,
  ProjectProviderBinding,
  ProviderCapability,
  ProviderConfig,
  ProviderDiscoveryLog,
  ProviderHealthcheck,
  ProviderModel
} from '@cp/domain';
import { Button, Panel, Pill, SectionHeading } from '@/components/common';
import { ProviderBindingTable, ProviderStatusPanel } from '@/components/panels';
import { useAppStore } from '@/store/app-store';

type NormalizedProviderModel = {
  id: string;
  provider: string;
  modelId: string;
  displayName: string;
  contextWindow?: number;
  maxOutputTokens?: number;
  pricing: { input?: number; output?: number };
  capabilities: CapabilityClass[];
  enabled: boolean;
  source: 'live' | 'persisted' | 'fallback';
};

const formatPricing = (model: NormalizedProviderModel): string => {
  const input = model.pricing.input;
  const output = model.pricing.output;
  if (input === undefined && output === undefined) return 'n/a';
  const inputText = input !== undefined ? `$${input}` : 'n/a';
  const outputText = output !== undefined ? `$${output}` : 'n/a';
  return `${inputText} / ${outputText}`;
};

const formatContext = (contextWindow?: number): string => {
  if (!contextWindow) return 'n/a';
  return `${contextWindow.toLocaleString()} tokens`;
};

const buildFallbackNormalizedModels = (providers: ProviderConfig[], models: ProviderModel[]): NormalizedProviderModel[] => {
  const providerByConfigId = new Map(providers.map((provider) => [provider.id, provider.provider]));

  return models.flatMap((model) => {
    const provider = providerByConfigId.get(model.providerConfigId);
    if (!provider) return [];

    return [
      {
        id: `${provider}:${model.modelId}`,
        provider,
        modelId: model.modelId,
        displayName: model.modelId,
        ...(model.contextWindow !== undefined ? { contextWindow: model.contextWindow } : {}),
        ...(model.maxOutputTokens !== undefined ? { maxOutputTokens: model.maxOutputTokens } : {}),
        pricing: {
          ...(typeof model.pricingMeta?.input === 'number' ? { input: model.pricingMeta.input } : {}),
          ...(typeof model.pricingMeta?.output === 'number' ? { output: model.pricingMeta.output } : {})
        },
        capabilities: [model.capabilityClass],
        enabled: model.enabled,
        source: 'persisted' as const
      }
    ];
  });
};

export function ProvidersPage() {
  const { state, authActions } = useAppStore();
  const [providers, setProviders] = useState<ProviderConfig[]>(state.providers);
  const [capabilities, setCapabilities] = useState<ProviderCapability[]>(state.providerCapabilities);
  const [legacyModels, setLegacyModels] = useState<ProviderModel[]>(state.providerModels);
  const [normalizedModels, setNormalizedModels] = useState<NormalizedProviderModel[]>(
    buildFallbackNormalizedModels(state.providers, state.providerModels)
  );
  const [bindings, setBindings] = useState<ProjectProviderBinding[]>(state.projectBindings);
  const [healthchecks, setHealthchecks] = useState<ProviderHealthcheck[]>(state.providerHealthchecks);
  const [discoveryLogs, setDiscoveryLogs] = useState<ProviderDiscoveryLog[]>([]);
  const [modelSource, setModelSource] = useState<'live' | 'mock' | 'unknown'>('unknown');
  const [modelsStrictMode, setModelsStrictMode] = useState(false);
  const [runningDiscovery, setRunningDiscovery] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const loadProviderData = useCallback(async () => {
    setError(undefined);

    try {
      const [
        providersResponse,
        capabilitiesResponse,
        legacyModelsResponse,
        bindingsResponse,
        healthResponse,
        logsResponse
      ] = await Promise.all([
        authActions.apiFetchJson<{ items?: ProviderConfig[]; message?: string }>('/providers'),
        authActions.apiFetchJson<{ items?: ProviderCapability[]; message?: string }>('/providers/capabilities'),
        authActions.apiFetchJson<{ items?: ProviderModel[]; message?: string }>('/providers/models'),
        authActions.apiFetchJson<{ items?: ProjectProviderBinding[]; message?: string }>('/providers/bindings'),
        authActions.apiFetchJson<{ items?: ProviderHealthcheck[]; message?: string }>('/providers/health'),
        authActions.apiFetchJson<{ items?: ProviderDiscoveryLog[]; message?: string }>('/providers/discovery/logs')
      ]);

      if (!providersResponse.response.ok) {
        throw new Error(providersResponse.body.message ?? `Unable to load providers (HTTP ${providersResponse.response.status})`);
      }
      if (!capabilitiesResponse.response.ok) {
        throw new Error(
          capabilitiesResponse.body.message ?? `Unable to load capabilities (HTTP ${capabilitiesResponse.response.status})`
        );
      }
      if (!legacyModelsResponse.response.ok) {
        throw new Error(legacyModelsResponse.body.message ?? `Unable to load model registry (HTTP ${legacyModelsResponse.response.status})`);
      }
      if (!bindingsResponse.response.ok) {
        throw new Error(bindingsResponse.body.message ?? `Unable to load provider bindings (HTTP ${bindingsResponse.response.status})`);
      }
      if (!healthResponse.response.ok) {
        throw new Error(healthResponse.body.message ?? `Unable to load provider healthchecks (HTTP ${healthResponse.response.status})`);
      }
      if (!logsResponse.response.ok) {
        throw new Error(logsResponse.body.message ?? `Unable to load provider discovery logs (HTTP ${logsResponse.response.status})`);
      }

      const providerItems = providersResponse.body.items ?? [];
      const legacyModelItems = legacyModelsResponse.body.items ?? [];

      setProviders(providerItems);
      setCapabilities(capabilitiesResponse.body.items ?? []);
      setLegacyModels(legacyModelItems);
      setBindings(bindingsResponse.body.items ?? []);
      setHealthchecks(healthResponse.body.items ?? []);
      setDiscoveryLogs(logsResponse.body.items ?? []);

      try {
        const liveModelsResponse = await authActions.apiFetchJson<{
          source?: 'live' | 'mock';
          models?: NormalizedProviderModel[];
          items?: NormalizedProviderModel[];
          meta?: { strictMode?: boolean };
          message?: string;
        }>(
          '/models?refresh=1'
        );
        const discoveredModels = Array.isArray(liveModelsResponse.body.models)
          ? liveModelsResponse.body.models
          : Array.isArray(liveModelsResponse.body.items)
            ? liveModelsResponse.body.items
            : [];
        if (liveModelsResponse.response.ok && discoveredModels.length > 0) {
          setNormalizedModels(discoveredModels);
          setModelSource(liveModelsResponse.body.source ?? 'live');
          setModelsStrictMode(Boolean(liveModelsResponse.body.meta?.strictMode));
        } else {
          setNormalizedModels(buildFallbackNormalizedModels(providerItems, legacyModelItems));
          setModelSource('mock');
          setModelsStrictMode(Boolean(liveModelsResponse.body.meta?.strictMode));
        }
      } catch {
        setNormalizedModels(buildFallbackNormalizedModels(providerItems, legacyModelItems));
        setModelSource('mock');
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load provider panel');
    }
  }, [authActions]);

  useEffect(() => {
    void loadProviderData();
  }, [loadProviderData]);

  const runDiscovery = async (): Promise<void> => {
    setRunningDiscovery(true);
    setError(undefined);
    try {
      const response = await authActions.apiFetch('/providers/discovery/update', {
        method: 'POST',
        body: JSON.stringify({})
      });
      const body = (await response.json()) as { message?: string };
      if (!response.ok) {
        throw new Error(body.message ?? `Auto-discovery failed (HTTP ${response.status})`);
      }
      await loadProviderData();
    } catch (discoveryError) {
      setError(discoveryError instanceof Error ? discoveryError.message : 'Provider auto-discovery failed');
    } finally {
      setRunningDiscovery(false);
    }
  };

  const sortedLogs = useMemo(
    () => [...discoveryLogs].sort((left, right) => right.searchFinishedAt.localeCompare(left.searchFinishedAt)),
    [discoveryLogs]
  );

  return (
    <div className="space-y-5">
      <Panel>
        <SectionHeading
          title="Provider Discovery"
          subtitle="Auto-discovery and registry refresh"
          action={
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => void loadProviderData()}>
                Refresh
              </Button>
              <Button variant="primary" onClick={() => void runDiscovery()}>
                {runningDiscovery ? 'Aggiornamento...' : 'Aggiorna provider'}
              </Button>
            </div>
          }
        />
        <p className="text-sm text-[color:var(--muted)]">
          Search queries and discovery logs are persisted. If web discovery fails, default providers remain available.
        </p>
        {error ? <p className="mt-2 text-sm text-rose-300">{error}</p> : null}
      </Panel>

      <ProviderStatusPanel configs={providers} health={healthchecks} />

      <Panel>
        <SectionHeading title="Capability list" subtitle="Provider capabilities" />
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {capabilities.map((capability) => (
            <div
              key={capability.id}
              className="border border-[color:var(--line)] bg-black/20 p-3 text-sm text-[color:var(--text)]"
            >
              <div className="font-medium">{capability.capabilityClass}</div>
              <div className="mt-1 text-[color:var(--muted)]">Provider config {capability.providerConfigId}</div>
              <div className="mt-2 text-xs text-[color:var(--muted)]">
                {capability.supported ? 'enabled' : 'disabled'} {capability.notes ? `· ${capability.notes}` : ''}
              </div>
            </div>
          ))}
        </div>
      </Panel>

      <Panel>
        <SectionHeading title="Model discovery" subtitle="Normalized live inventory" />
        {modelSource === 'mock' ? (
          <div className="mb-3 border border-amber-400/40 bg-amber-500/10 p-3 text-xs text-amber-100">
            Provider model discovery is running in <strong>mock/fallback</strong> mode.
            {modelsStrictMode ? ' MODELS_STRICT is enabled: configure valid provider credentials to restore live source.' : ''}
          </div>
        ) : null}
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="text-[color:var(--muted)]">
              <tr>
                <th className="py-2 pr-3">Provider</th>
                <th className="py-2 pr-3">Model</th>
                <th className="py-2 pr-3">Capabilities</th>
                <th className="py-2 pr-3">Context</th>
                <th className="py-2 pr-3">Pricing</th>
                <th className="py-2 pr-3">Source</th>
              </tr>
            </thead>
            <tbody>
              {normalizedModels.map((model) => (
                <tr key={model.id} className="border-t border-[color:var(--line)] text-[color:var(--text)]">
                  <td className="py-2 pr-3">
                    <Pill tone="accent">{model.provider}</Pill>
                  </td>
                  <td className="py-2 pr-3">
                    <div className="font-medium">{model.displayName}</div>
                    <div className="text-xs text-[color:var(--muted)]">{model.modelId}</div>
                  </td>
                  <td className="py-2 pr-3">
                    <div className="flex flex-wrap gap-1">
                      {model.capabilities.map((capability: string) => (
                        <Pill key={`${model.id}-${capability}`}>{capability}</Pill>
                      ))}
                    </div>
                  </td>
                  <td className="py-2 pr-3">{formatContext(model.contextWindow)}</td>
                  <td className="py-2 pr-3">{formatPricing(model)}</td>
                  <td className="py-2 pr-3 text-xs text-[color:var(--muted)]">{model.source}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {normalizedModels.length === 0 ? (
          <div className="mt-3 text-sm text-[color:var(--muted)]">No normalized models available.</div>
        ) : null}
      </Panel>

      <ProviderBindingTable bindings={bindings} models={legacyModels} />

      <Panel>
        <SectionHeading title="Fallback chain" subtitle="Project policy" />
        <div className="space-y-2 text-sm text-[color:var(--text)]">
          {bindings.map((binding) => (
            <div key={binding.id} className="border border-[color:var(--line)] bg-black/20 p-3">
              <div className="font-medium">{binding.capabilityClass}</div>
              <div className="mt-1">Primary model ID: {binding.primaryModelId}</div>
              <div className="mt-1 text-[color:var(--muted)]">
                Fallback: {binding.fallbackModelIds.join(', ') || 'none'}
              </div>
            </div>
          ))}
        </div>
      </Panel>

      <Panel>
        <SectionHeading title="Discovery logs" subtitle={`${sortedLogs.length} runs`} />
        <div className="space-y-2 text-xs text-[color:var(--muted)]">
          {sortedLogs.map((log) => (
            <div key={log.id} className="border border-[color:var(--line)] bg-black/20 p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[color:var(--text)]">
                  {log.source} · {log.status}
                </span>
                <span>{new Date(log.searchFinishedAt).toLocaleString()}</span>
              </div>
              <div className="mt-1">queries: {log.queries.join(' | ')}</div>
              <div className="mt-1">providers: {log.discoveredProviders.join(', ') || 'none'}</div>
              <div className="mt-1">models: {log.discoveredModels.join(', ') || 'none'}</div>
              {log.notes ? <div className="mt-1 text-amber-200">{log.notes}</div> : null}
            </div>
          ))}
          {sortedLogs.length === 0 ? <div>No discovery logs yet.</div> : null}
        </div>
      </Panel>
    </div>
  );
}
