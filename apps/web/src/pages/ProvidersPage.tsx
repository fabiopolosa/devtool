import { Panel, SectionHeading } from '@/components/common';
import { ProviderBindingTable, ProviderStatusPanel } from '@/components/panels';
import { useAppStore } from '@/store/app-store';

export function ProvidersPage() {
  const { state } = useAppStore();

  return (
    <div className="space-y-5">
      <ProviderStatusPanel configs={state.providers} health={state.providerHealthchecks} />

      <Panel>
        <SectionHeading title="Capability list" subtitle="Provider capabilities" />
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {state.providerCapabilities.map((capability) => (
            <div key={capability.id} className="rounded-xl border border-white/10 bg-white/5 p-3 text-sm text-slate-300">
              <div className="font-medium text-white">{capability.capabilityClass}</div>
              <div className="mt-1">Provider config {capability.providerConfigId}</div>
              <div className="mt-2 text-xs text-slate-400">{capability.supported ? 'enabled' : 'disabled'} {capability.notes ? `· ${capability.notes}` : ''}</div>
            </div>
          ))}
        </div>
      </Panel>

      <Panel>
        <SectionHeading title="Model registry" subtitle="Routing inventory" />
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="text-slate-400">
              <tr>
                <th className="py-2 pr-3">Model</th>
                <th className="py-2 pr-3">Capability</th>
                <th className="py-2 pr-3">Provider Config</th>
                <th className="py-2 pr-3">Enabled</th>
              </tr>
            </thead>
            <tbody>
              {state.providerModels.map((model) => (
                <tr key={model.id} className="border-t border-white/10 text-slate-300">
                  <td className="py-2 pr-3 text-white">{model.modelId}</td>
                  <td className="py-2 pr-3">{model.capabilityClass}</td>
                  <td className="py-2 pr-3">{model.providerConfigId}</td>
                  <td className="py-2 pr-3">{model.enabled ? 'yes' : 'no'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <ProviderBindingTable bindings={state.projectBindings} models={state.providerModels} />

      <Panel>
        <SectionHeading title="Fallback chain" subtitle="Project policy" />
        <div className="space-y-2 text-sm text-slate-300">
          {state.projectBindings.map((binding) => (
            <div key={binding.id} className="rounded-xl border border-white/10 bg-white/5 p-3">
              <div className="font-medium text-white">{binding.capabilityClass}</div>
              <div className="mt-1">Primary model ID: {binding.primaryModelId}</div>
              <div className="mt-1 text-slate-400">Fallback: {binding.fallbackModelIds.join(', ') || 'none'}</div>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}
