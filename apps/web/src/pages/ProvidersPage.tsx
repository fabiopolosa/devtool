import { useCallback, useEffect, useMemo, useState } from 'react';
import type {
  ProjectProviderBinding,
  ProviderCapability,
  ProviderConfig,
  ProviderDiscoveryLog,
  ProviderHealthcheck,
  ProviderModel
} from '@cp/domain';
import { Button, Panel, SectionHeading } from '@/components/common';
import { ProviderBindingTable, ProviderStatusPanel } from '@/components/panels';
import { useAppStore } from '@/store/app-store';

export function ProvidersPage() {
  const { state, authActions } = useAppStore();
  const [providers, setProviders] = useState<ProviderConfig[]>(state.providers);
  const [capabilities, setCapabilities] = useState<ProviderCapability[]>(state.providerCapabilities);
  const [models, setModels] = useState<ProviderModel[]>(state.providerModels);
  const [bindings, setBindings] = useState<ProjectProviderBinding[]>(state.projectBindings);
  const [healthchecks, setHealthchecks] = useState<ProviderHealthcheck[]>(state.providerHealthchecks);
  const [discoveryLogs, setDiscoveryLogs] = useState<ProviderDiscoveryLog[]>([]);
  const [runningDiscovery, setRunningDiscovery] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const loadProviderData = useCallback(async () => {
    setError(undefined);
    try {
      const [
        providersResponse,
        capabilitiesResponse,
        modelsResponse,
        bindingsResponse,
        healthResponse,
        logsResponse
      ] = await Promise.all([
        authActions.apiFetch('/providers'),
        authActions.apiFetch('/providers/capabilities'),
        authActions.apiFetch('/providers/models'),
        authActions.apiFetch('/providers/bindings'),
        authActions.apiFetch('/providers/health'),
        authActions.apiFetch('/providers/discovery/logs')
      ]);

      const providersBody = (await providersResponse.json()) as { items?: ProviderConfig[]; message?: string };
      const capabilitiesBody = (await capabilitiesResponse.json()) as {
        items?: ProviderCapability[];
        message?: string;
      };
      const modelsBody = (await modelsResponse.json()) as { items?: ProviderModel[]; message?: string };
      const bindingsBody = (await bindingsResponse.json()) as {
        items?: ProjectProviderBinding[];
        message?: string;
      };
      const healthBody = (await healthResponse.json()) as { items?: ProviderHealthcheck[]; message?: string };
      const logsBody = (await logsResponse.json()) as { items?: ProviderDiscoveryLog[]; message?: string };

      if (!providersResponse.ok) {
        throw new Error(providersBody.message ?? `Unable to load providers (HTTP ${providersResponse.status})`);
      }
      if (!capabilitiesResponse.ok) {
        throw new Error(capabilitiesBody.message ?? `Unable to load capabilities (HTTP ${capabilitiesResponse.status})`);
      }
      if (!modelsResponse.ok) {
        throw new Error(modelsBody.message ?? `Unable to load model registry (HTTP ${modelsResponse.status})`);
      }
      if (!bindingsResponse.ok) {
        throw new Error(bindingsBody.message ?? `Unable to load provider bindings (HTTP ${bindingsResponse.status})`);
      }
      if (!healthResponse.ok) {
        throw new Error(healthBody.message ?? `Unable to load provider healthchecks (HTTP ${healthResponse.status})`);
      }
      if (!logsResponse.ok) {
        throw new Error(logsBody.message ?? `Unable to load provider discovery logs (HTTP ${logsResponse.status})`);
      }

      setProviders(providersBody.items ?? []);
      setCapabilities(capabilitiesBody.items ?? []);
      setModels(modelsBody.items ?? []);
      setBindings(bindingsBody.items ?? []);
      setHealthchecks(healthBody.items ?? []);
      setDiscoveryLogs(logsBody.items ?? []);
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
            <div key={capability.id} className="border border-[color:var(--line)] bg-black/20 p-3 text-sm text-[color:var(--text)]">
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
        <SectionHeading title="Model registry" subtitle="Routing inventory" />
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="text-[color:var(--muted)]">
              <tr>
                <th className="py-2 pr-3">Model</th>
                <th className="py-2 pr-3">Capability</th>
                <th className="py-2 pr-3">Provider Config</th>
                <th className="py-2 pr-3">Enabled</th>
              </tr>
            </thead>
            <tbody>
              {models.map((model) => (
                <tr key={model.id} className="border-t border-[color:var(--line)] text-[color:var(--text)]">
                  <td className="py-2 pr-3">{model.modelId}</td>
                  <td className="py-2 pr-3">{model.capabilityClass}</td>
                  <td className="py-2 pr-3">{model.providerConfigId}</td>
                  <td className="py-2 pr-3">{model.enabled ? 'yes' : 'no'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <ProviderBindingTable bindings={bindings} models={models} />

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
