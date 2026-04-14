import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Environment, Machine } from '@cp/domain';
import { Button, Input, Panel, Pill, ProgressBar, SectionHeading } from '@/components/common';
import { useAppStore } from '@/store/app-store';

type MachineHealthcheckResult = {
  machine: Machine;
  status: Machine['status'];
  latencyMs: number;
  details: string;
};

export function StackPage() {
  const { auth, authActions } = useAppStore();
  const [environments, setEnvironments] = useState<Environment[]>([]);
  const [machines, setMachines] = useState<Machine[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [healthchecks, setHealthchecks] = useState<Record<string, MachineHealthcheckResult>>({});

  const [envFormName, setEnvFormName] = useState('');
  const [envFormDescription, setEnvFormDescription] = useState('');
  const [envFormType, setEnvFormType] = useState<Environment['type']>('development');

  const [machineEnvId, setMachineEnvId] = useState('');
  const [machineName, setMachineName] = useState('');
  const [machineHost, setMachineHost] = useState('http://localhost:3000');
  const [machineCpu, setMachineCpu] = useState('8');
  const [machineGpu, setMachineGpu] = useState('1');
  const [machineRam, setMachineRam] = useState('32');

  const isAdmin = auth.enabled && Boolean(auth.principal?.roles.includes('admin'));

  const loadStack = useCallback(async () => {
    setLoading(true);
    setError(undefined);
    try {
      const [environmentResponse, machineResponse] = await Promise.all([
        authActions.apiFetch('/environments'),
        authActions.apiFetch('/machines')
      ]);
      const environmentsBody = (await environmentResponse.json()) as { items?: Environment[]; message?: string };
      const machinesBody = (await machineResponse.json()) as { items?: Machine[]; message?: string };

      if (!environmentResponse.ok) {
        throw new Error(environmentsBody.message ?? `Unable to load environments (HTTP ${environmentResponse.status})`);
      }
      if (!machineResponse.ok) {
        throw new Error(machinesBody.message ?? `Unable to load machines (HTTP ${machineResponse.status})`);
      }

      const nextEnvironments = environmentsBody.items ?? [];
      const nextMachines = machinesBody.items ?? [];
      setEnvironments(nextEnvironments);
      setMachines(nextMachines);
      if (!machineEnvId && nextEnvironments.length > 0) {
        setMachineEnvId(nextEnvironments[0]!.id);
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load stack/machines data');
    } finally {
      setLoading(false);
    }
  }, [authActions, machineEnvId]);

  useEffect(() => {
    if (!auth.enabled || !isAdmin) return;
    void loadStack();
  }, [auth.enabled, isAdmin, loadStack]);

  const machinesByEnvironment = useMemo(() => {
    const map = new Map<string, Machine[]>();
    for (const environment of environments) {
      map.set(environment.id, []);
    }
    for (const machine of machines) {
      const entries = map.get(machine.environmentId) ?? [];
      entries.push(machine);
      map.set(machine.environmentId, entries);
    }
    return map;
  }, [environments, machines]);

  const createEnvironment = async (): Promise<void> => {
    if (!envFormName.trim() || !envFormDescription.trim()) {
      setError('Environment name and description are required.');
      return;
    }
    setError(undefined);
    try {
      const response = await authActions.apiFetch('/environments', {
        method: 'POST',
        body: JSON.stringify({
          name: envFormName,
          description: envFormDescription,
          type: envFormType
        })
      });
      const body = (await response.json()) as { message?: string };
      if (!response.ok) {
        throw new Error(body.message ?? `Unable to create environment (HTTP ${response.status})`);
      }
      setEnvFormName('');
      setEnvFormDescription('');
      await loadStack();
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : 'Unable to create environment');
    }
  };

  const createMachine = async (): Promise<void> => {
    if (!machineEnvId || !machineName.trim() || !machineHost.trim()) {
      setError('Machine environment, name and host are required.');
      return;
    }

    setError(undefined);
    try {
      const response = await authActions.apiFetch('/machines', {
        method: 'POST',
        body: JSON.stringify({
          environmentId: machineEnvId,
          name: machineName,
          host: machineHost,
          cpuCores: Number(machineCpu),
          gpuCount: Number(machineGpu),
          ramGb: Number(machineRam),
          services: ['api', 'worker'],
          agents: ['planner', 'builder']
        })
      });
      const body = (await response.json()) as { message?: string };
      if (!response.ok) {
        throw new Error(body.message ?? `Unable to create machine (HTTP ${response.status})`);
      }
      setMachineName('');
      setMachineHost('http://localhost:3000');
      await loadStack();
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : 'Unable to create machine');
    }
  };

  const runHealthcheck = async (machineId: string): Promise<void> => {
    setError(undefined);
    try {
      const response = await authActions.apiFetch(`/machines/${machineId}/healthcheck`, {
        method: 'POST'
      });
      const body = (await response.json()) as { item?: MachineHealthcheckResult; message?: string };
      if (!response.ok || !body.item) {
        throw new Error(body.message ?? `Unable to run healthcheck (HTTP ${response.status})`);
      }
      setHealthchecks((current) => ({ ...current, [machineId]: body.item! }));
      await loadStack();
    } catch (healthcheckError) {
      setError(healthcheckError instanceof Error ? healthcheckError.message : 'Unable to run healthcheck');
    }
  };

  if (!auth.enabled || !isAdmin) {
    return (
      <Panel>
        <SectionHeading title="Stack & Machines" subtitle="Privileged" />
        <p className="text-sm text-slate-300">
          Stack and machines controls are available only for authenticated admins.
        </p>
      </Panel>
    );
  }

  return (
    <div className="space-y-5">
      <Panel>
        <SectionHeading
          title="Stack & Machines"
          subtitle="AI system architect view"
          action={
            <Button variant="secondary" onClick={() => void loadStack()}>
              {loading ? 'Refreshing...' : 'Refresh'}
            </Button>
          }
        />
        <p className="text-sm text-slate-300">
          Visual map of environments/machines, capacity (CPU/GPU/RAM) and hosted agent/runtime services.
        </p>
        {error ? <p className="mt-3 text-sm text-rose-300">{error}</p> : null}
      </Panel>

      <div className="grid gap-4 xl:grid-cols-2">
        <Panel>
          <SectionHeading title="New Environment" subtitle="Operations boundary" />
          <div className="space-y-2">
            <Input value={envFormName} onChange={setEnvFormName} placeholder="Environment name" />
            <Input value={envFormDescription} onChange={setEnvFormDescription} placeholder="Description" />
            <select
              value={envFormType}
              onChange={(event) => setEnvFormType(event.target.value as Environment['type'])}
              className="w-full rounded-xl border border-white/10 bg-slate-950/40 px-3 py-2 text-sm text-white outline-none focus:border-cyan-400/40"
            >
              <option value="local">local</option>
              <option value="development">development</option>
              <option value="staging">staging</option>
              <option value="production">production</option>
            </select>
            <div className="flex justify-end">
              <Button variant="primary" onClick={() => void createEnvironment()}>Create environment</Button>
            </div>
          </div>
        </Panel>

        <Panel>
          <SectionHeading title="New Machine" subtitle="Compute node" />
          <div className="space-y-2">
            <select
              value={machineEnvId}
              onChange={(event) => setMachineEnvId(event.target.value)}
              className="w-full rounded-xl border border-white/10 bg-slate-950/40 px-3 py-2 text-sm text-white outline-none focus:border-cyan-400/40"
            >
              <option value="">Select environment</option>
              {environments.map((environment) => (
                <option key={environment.id} value={environment.id}>{environment.name}</option>
              ))}
            </select>
            <Input value={machineName} onChange={setMachineName} placeholder="Machine name" />
            <Input value={machineHost} onChange={setMachineHost} placeholder="Host (e.g. http://node-a.local)" />
            <div className="grid gap-2 sm:grid-cols-3">
              <Input value={machineCpu} onChange={setMachineCpu} placeholder="CPU cores" />
              <Input value={machineGpu} onChange={setMachineGpu} placeholder="GPU count" />
              <Input value={machineRam} onChange={setMachineRam} placeholder="RAM GB" />
            </div>
            <div className="flex justify-end">
              <Button variant="primary" onClick={() => void createMachine()}>Create machine</Button>
            </div>
          </div>
        </Panel>
      </div>

      <div className="grid gap-4">
        {environments.map((environment) => {
          const environmentMachines = machinesByEnvironment.get(environment.id) ?? [];
          return (
            <Panel key={environment.id}>
              <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="label">Environment</div>
                  <div className="mt-1 text-lg font-semibold text-white">{environment.name}</div>
                  <div className="text-sm text-slate-400">{environment.description}</div>
                </div>
                <Pill tone={environment.status === 'active' ? 'good' : environment.status === 'degraded' ? 'warn' : 'bad'}>
                  {environment.status}
                </Pill>
              </div>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {environmentMachines.map((machine) => {
                  const health = healthchecks[machine.id];
                  const cpuLoad = Math.min(100, Math.max(8, machine.cpuCores * 7));
                  const gpuLoad = machine.gpuCount > 0 ? Math.min(100, 20 + machine.gpuCount * 18) : 0;
                  const ramLoad = Math.min(100, Math.max(12, machine.ramGb * 2.8));
                  return (
                    <div key={machine.id} className="rounded-xl border border-white/10 bg-white/5 p-3">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <div className="font-medium text-white">{machine.name}</div>
                          <div className="text-xs text-slate-400">{machine.host}</div>
                        </div>
                        <Pill tone={machine.status === 'online' ? 'good' : machine.status === 'degraded' ? 'warn' : 'bad'}>
                          {machine.status}
                        </Pill>
                      </div>
                      <div className="mt-3 space-y-2 text-xs text-slate-300">
                        <div>
                          CPU {machine.cpuCores} cores
                          <ProgressBar value={cpuLoad} />
                        </div>
                        <div>
                          GPU {machine.gpuCount}
                          <ProgressBar value={gpuLoad} />
                        </div>
                        <div>
                          RAM {machine.ramGb} GB
                          <ProgressBar value={ramLoad} />
                        </div>
                      </div>
                      <div className="mt-2 text-xs text-slate-400">
                        Agents: {machine.agents.length > 0 ? machine.agents.join(', ') : 'none'}
                      </div>
                      <div className="mt-1 text-xs text-slate-500">
                        Services: {machine.services.length > 0 ? machine.services.join(', ') : 'none'}
                      </div>
                      {health ? (
                        <div className="mt-2 rounded-lg border border-white/10 bg-slate-950/40 p-2 text-xs text-slate-300">
                          {health.status} · {health.latencyMs}ms · {health.details}
                        </div>
                      ) : null}
                      <div className="mt-3">
                        <Button variant="secondary" onClick={() => void runHealthcheck(machine.id)}>Run healthcheck</Button>
                      </div>
                    </div>
                  );
                })}
                {environmentMachines.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-white/15 bg-white/5 p-4 text-sm text-slate-400">
                    No machines mapped to this environment.
                  </div>
                ) : null}
              </div>
            </Panel>
          );
        })}
        {environments.length === 0 ? (
          <Panel>
            <p className="text-sm text-slate-400">No environments defined yet.</p>
          </Panel>
        ) : null}
      </div>
    </div>
  );
}
