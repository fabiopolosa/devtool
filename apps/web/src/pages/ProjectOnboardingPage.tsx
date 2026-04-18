import { Link, useNavigate } from '@tanstack/react-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AgentConfig, AgentRuntimeProfile, Project, ProjectRuntimeProfile, Workspace } from '@cp/domain';
import { buildHeartbeatPolicy, buildProjectRuntimeProfile } from '@cp/domain';
import { Button, Panel, Pill, ProgressBar, SectionHeading } from '@/components/common';
import { HeartbeatPolicyEditor } from '@/components/runtime-profile/HeartbeatPolicyEditor';
import { RuntimeProfilePicker } from '@/components/runtime-profile/RuntimeProfilePicker';
import { RuntimeProfileSummary } from '@/components/runtime-profile/RuntimeProfileSummary';
import {
  defaultRuntimeProfile,
  describeHeartbeatPolicy,
  describeRuntimeProfile,
  launchModeLabels,
  normalizeRuntimeKindSelection,
  runtimeHostLabels,
  runtimeKindFromAdapterType,
  runtimeKindLabels,
  runtimeKindOptions,
  runtimeKindToCompatibilityAdapter,
  runtimeVendorLabels
} from '@/components/runtime-profile/runtime-profile-utils';
import { WorkspaceBrowserPicker } from '@/components/project-onboarding/WorkspaceBrowserPicker';
import { useAppStore } from '@/store/app-store';
import { usePathParam } from './_utils';

type ProjectRuntimeRecord = Project & { runtimeProfile?: ProjectRuntimeProfile };

type HeartbeatStatus = {
  projectId: string;
  projectName: string;
  runtimeProfile: ProjectRuntimeProfile;
  lastTriggeredAt?: string;
  lastTrigger?: string;
  lastTriggeredBy?: string;
  lastReason?: string;
  lastJobIds: string[];
  overallStatus: 'idle' | 'queued' | 'running' | 'done' | 'error' | 'disabled';
  due: boolean;
  completedCount: number;
  failedCount: number;
  runningCount: number;
  queuedCount: number;
};

const wizardSteps = [
  { key: 'basics', title: 'basics', description: 'Project defaults and execution direction' },
  { key: 'primary-agent', title: 'primary agent', description: 'Choose the main orchestrating agent' },
  { key: 'runtime-family', title: 'runtime family', description: 'Pick the runtime family and vendor tree' },
  { key: 'vendor-config', title: 'vendor-specific config', description: 'Set vendor/runtime details' },
  { key: 'workspace', title: 'workspace picker', description: 'Browse allowed folders for the project workspace' },
  { key: 'heartbeat', title: 'heartbeat policy', description: 'Set project heartbeat schedule and triggers' },
  { key: 'review', title: 'review', description: 'Check the final onboarding plan' }
] as const;

const heartbeatTone = (status: HeartbeatStatus['overallStatus']): 'default' | 'good' | 'warn' | 'bad' | 'accent' => {
  if (status === 'done') return 'good';
  if (status === 'running' || status === 'queued') return 'accent';
  if (status === 'error') return 'bad';
  if (status === 'disabled') return 'warn';
  return 'default';
};

const toSelectedAgentPolicy = (agentId?: string): Record<string, unknown> =>
  agentId ? { mode: 'primary', agentIds: [agentId] } : { mode: 'manual' };

const runtimeForAgent = (agent: AgentConfig): AgentRuntimeProfile =>
  agent.runtimeProfile ?? defaultRuntimeProfile(runtimeKindFromAdapterType(agent.adapterType));

export function ProjectOnboardingPage() {
  const navigate = useNavigate();
  const { state, auth, authActions } = useAppStore();
  const projectId = usePathParam(1);
  const projectFromStore = useMemo(() => state.projects.find((item) => item.id === projectId), [projectId, state.projects]);
  const [project, setProject] = useState<ProjectRuntimeRecord | undefined>(projectFromStore);
  const [agents, setAgents] = useState<AgentConfig[]>([]);
  const [workspace, setWorkspace] = useState<Workspace | undefined>();
  const [projectRuntimeDraft, setProjectRuntimeDraft] = useState<ProjectRuntimeProfile>(buildProjectRuntimeProfile());
  const [agentRuntimeDraft, setAgentRuntimeDraft] = useState<AgentRuntimeProfile>(defaultRuntimeProfile('mcp_bridge'));
  const [heartbeatStatus, setHeartbeatStatus] = useState<HeartbeatStatus | undefined>();
  const [workspaceModeDraft, setWorkspaceModeDraft] = useState<Workspace['mode']>('local');
  const [workspacePathDraft, setWorkspacePathDraft] = useState('');
  const [activeStep, setActiveStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [runningHeartbeat, setRunningHeartbeat] = useState<'manual' | 'tick' | undefined>();
  const [error, setError] = useState<string | undefined>();
  const [notice, setNotice] = useState<string | undefined>();
  const mountedRef = useRef(false);

  const currentProject = project ?? projectFromStore;
  const selectedPrimaryAgentId = projectRuntimeDraft.primaryAgentId ?? '';
  const selectedPrimaryAgent = agents.find((agent) => agent.id === selectedPrimaryAgentId);
  const selectedWorkspacePath = workspace?.localPath ?? workspacePathDraft;

  const loadContext = useCallback(async (): Promise<void> => {
    if (!projectId) return;
    setLoading(true);
    setError(undefined);
    try {
      const [projectResponse, runtimeResponse, heartbeatResponse, agentsResponse, workspacesResponse] = await Promise.all([
        authActions.apiFetchJson<{ item?: ProjectRuntimeRecord; message?: string }>(`/projects/${projectId}`),
        authActions.apiFetchJson<{ item?: ProjectRuntimeRecord; message?: string }>(`/projects/${projectId}/runtime`),
        authActions.apiFetchJson<{ item?: HeartbeatStatus; message?: string }>(`/projects/${projectId}/runtime/heartbeat/status`),
        authActions.apiFetchJson<{ items?: AgentConfig[]; message?: string }>('/agents'),
        authActions.apiFetchJson<{ items?: Workspace[]; message?: string }>(`/workspaces?projectId=${encodeURIComponent(projectId)}`)
      ]);

      if (!projectResponse.response.ok || !projectResponse.body.item) {
        throw new Error(projectResponse.body.message ?? `Unable to load project (HTTP ${projectResponse.response.status})`);
      }
      if (!runtimeResponse.response.ok || !runtimeResponse.body.item) {
        throw new Error(runtimeResponse.body.message ?? `Unable to load project runtime (HTTP ${runtimeResponse.response.status})`);
      }
      if (!heartbeatResponse.response.ok || !heartbeatResponse.body.item) {
        throw new Error(heartbeatResponse.body.message ?? `Unable to load project heartbeat status (HTTP ${heartbeatResponse.response.status})`);
      }
      if (!agentsResponse.response.ok) {
        throw new Error(agentsResponse.body.message ?? `Unable to load agents (HTTP ${agentsResponse.response.status})`);
      }
      if (!workspacesResponse.response.ok) {
        throw new Error(workspacesResponse.body.message ?? `Unable to load workspaces (HTTP ${workspacesResponse.response.status})`);
      }

      const loadedProject = projectResponse.body.item;
      const loadedRuntime = buildProjectRuntimeProfile(runtimeResponse.body.item.runtimeProfile ?? {});
      const loadedAgents = agentsResponse.body.items ?? [];
      const loadedWorkspace = workspacesResponse.body.items?.[0];
      const selectedAgentId = loadedRuntime.primaryAgentId ?? loadedAgents[0]?.id;
      const selectedAgent = selectedAgentId ? loadedAgents.find((agent) => agent.id === selectedAgentId) : loadedAgents[0];

      if (!mountedRef.current) return;
      setProject(loadedProject);
      setProjectRuntimeDraft(
        selectedAgentId
          ? {
              ...loadedRuntime,
              primaryAgentId: selectedAgentId,
              agentSelectionPolicy: loadedRuntime.agentSelectionPolicy ?? toSelectedAgentPolicy(selectedAgentId)
            }
          : loadedRuntime
      );
      setAgents(loadedAgents);
      setWorkspace(loadedWorkspace);
      setWorkspaceModeDraft(loadedWorkspace?.mode ?? 'local');
      setWorkspacePathDraft(loadedWorkspace?.localPath ?? '');
      setHeartbeatStatus(heartbeatResponse.body.item);
      if (selectedAgent) {
        setAgentRuntimeDraft(runtimeForAgent(selectedAgent));
      }
    } catch (loadError) {
      if (!mountedRef.current) return;
      setError(loadError instanceof Error ? loadError.message : 'Unable to load project onboarding data');
    } finally {
      if (!mountedRef.current) return;
      setLoading(false);
    }
  }, [authActions, projectId]);

  useEffect(() => {
    mountedRef.current = true;
    void loadContext();
    return () => {
      mountedRef.current = false;
    };
  }, [loadContext]);

  const setProjectRuntimeField = (patch: Partial<ProjectRuntimeProfile>): void => {
    setProjectRuntimeDraft((current) => ({
      ...current,
      ...patch,
      metadata: patch.metadata ? { ...patch.metadata } : current.metadata,
      agentSelectionPolicy: patch.agentSelectionPolicy ? { ...patch.agentSelectionPolicy } : current.agentSelectionPolicy,
      heartbeatPolicy: patch.heartbeatPolicy ? { ...patch.heartbeatPolicy } : current.heartbeatPolicy
    }));
  };

  const setAgentRuntimeKind = (runtimeKind: Parameters<typeof normalizeRuntimeKindSelection>[0]): void => {
    const defaults = normalizeRuntimeKindSelection(runtimeKind);
    setAgentRuntimeDraft((current) => {
      const nextProfile: AgentRuntimeProfile = {
        ...defaults,
        metadata: current.metadata ?? {}
      };
      if (current.command !== undefined) nextProfile.command = current.command;
      if (current.args !== undefined) nextProfile.args = [...current.args];
      if (current.cwd !== undefined) nextProfile.cwd = current.cwd;
      if (current.mcpServerRef !== undefined) nextProfile.mcpServerRef = current.mcpServerRef;
      if (current.apiConfigRef !== undefined) nextProfile.apiConfigRef = current.apiConfigRef;
      if (current.workerPoolSize !== undefined) nextProfile.workerPoolSize = current.workerPoolSize;
      return nextProfile;
    });
  };

  const choosePrimaryAgent = (agent: AgentConfig): void => {
    setProjectRuntimeDraft((current) => ({
      ...current,
      primaryAgentId: agent.id,
      agentSelectionPolicy: toSelectedAgentPolicy(agent.id)
    }));
    setAgentRuntimeDraft(runtimeForAgent(agent));
  };

  const runProjectHeartbeat = async (mode: 'manual' | 'tick'): Promise<void> => {
    if (!projectId) return;
    setRunningHeartbeat(mode);
    setError(undefined);
    setNotice(undefined);
    try {
      const endpoint = mode === 'manual' ? `/projects/${projectId}/runtime/heartbeat` : `/projects/${projectId}/runtime/heartbeat/tick`;
      const response = await authActions.apiFetch(endpoint, {
        method: 'POST',
        body: JSON.stringify(mode === 'manual' ? { trigger: 'manual', reason: 'onboarding_ui' } : { reason: 'onboarding_ui' })
      });
      const body = (await response.json()) as {
        item?: { jobs?: Array<{ jobId: string }>; targets?: Array<{ agentName: string }> };
        message?: string;
      };
      if (!response.ok || !body.item) {
        throw new Error(body.message ?? `Unable to ${mode} project heartbeat (HTTP ${response.status})`);
      }
      setNotice(
        mode === 'manual'
          ? `Heartbeat dispatched to ${body.item.targets?.length ?? 0} agent(s).`
          : `Heartbeat tick completed with ${body.item.jobs?.length ?? 0} job(s).`
      );
      await loadContext();
    } catch (heartbeatError) {
      setError(heartbeatError instanceof Error ? heartbeatError.message : `Unable to ${mode} project heartbeat`);
    } finally {
      setRunningHeartbeat(undefined);
    }
  };

  const saveOnboarding = async (): Promise<void> => {
    if (!projectId) return;
    if (!currentProject) {
      setError('Project not found.');
      return;
    }

    setSaving(true);
    setError(undefined);
    setNotice(undefined);
    try {
      let workspaceRecord = workspace;
      const workspacePayload = {
        projectId,
        mode: workspaceModeDraft,
        ...(workspacePathDraft.trim() ? { localPath: workspacePathDraft.trim() } : {})
      };

      if (workspaceRecord) {
        const { response, body } = await authActions.apiFetchJson<{ item?: Workspace; message?: string }>(
          `/workspaces/${workspaceRecord.id}`,
          {
            method: 'PATCH',
            body: JSON.stringify({
              mode: workspacePayload.mode,
              ...(workspacePayload.localPath ? { localPath: workspacePayload.localPath } : {})
            })
          }
        );
        if (!response.ok || !body.item) {
          throw new Error(body.message ?? `Unable to update workspace (HTTP ${response.status})`);
        }
        workspaceRecord = body.item;
      } else if (workspacePayload.mode === 'local' || workspacePayload.localPath) {
        const { response, body } = await authActions.apiFetchJson<{ item?: Workspace; message?: string }>('/workspaces', {
          method: 'POST',
          body: JSON.stringify(workspacePayload)
        });
        if (!response.ok || !body.item) {
          throw new Error(body.message ?? `Unable to create workspace (HTTP ${response.status})`);
        }
        workspaceRecord = body.item;
      }

      if (selectedPrimaryAgentId) {
        const { response, body } = await authActions.apiFetchJson<{ item?: AgentConfig; message?: string }>(
          `/agents/${selectedPrimaryAgentId}`,
          {
            method: 'PUT',
            body: JSON.stringify({
              runtimeProfile: agentRuntimeDraft,
              adapterType: runtimeKindToCompatibilityAdapter(agentRuntimeDraft.runtimeKind)
            })
          }
        );
        if (!response.ok || !body.item) {
          throw new Error(body.message ?? `Unable to update primary agent runtime (HTTP ${response.status})`);
        }
      }

      const runtimePayload: Partial<ProjectRuntimeProfile> = {
        ...(selectedPrimaryAgentId ? { primaryAgentId: selectedPrimaryAgentId } : {}),
        ...(workspaceRecord ? { workspaceId: workspaceRecord.id } : {}),
        defaultHost: projectRuntimeDraft.defaultHost,
        defaultExecutionMode: projectRuntimeDraft.defaultExecutionMode,
        heartbeatPolicy: projectRuntimeDraft.heartbeatPolicy ?? buildHeartbeatPolicy(),
        agentSelectionPolicy: selectedPrimaryAgentId
          ? toSelectedAgentPolicy(selectedPrimaryAgentId)
          : projectRuntimeDraft.agentSelectionPolicy,
        metadata: projectRuntimeDraft.metadata ?? {}
      };

      const { response, body } = await authActions.apiFetchJson<{ item?: ProjectRuntimeRecord; message?: string }>(
        `/projects/${projectId}/runtime`,
        {
          method: 'PUT',
          body: JSON.stringify(runtimePayload)
        }
      );
      if (!response.ok || !body.item) {
        throw new Error(body.message ?? `Unable to update project runtime (HTTP ${response.status})`);
      }

      setWorkspace(workspaceRecord);
      setProject(body.item);
      setNotice('Project onboarding saved.');
      await navigate({ to: '/project/$projectId', params: { projectId } });
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to save onboarding');
    } finally {
      setSaving(false);
    }
  };

  const renderBasicsStep = () => (
    <Panel>
      <SectionHeading title="Project basics" subtitle="Review and shape project defaults" />
      <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="space-y-3 text-sm text-slate-300">
          <p>
            <span className="label">Project</span>
            <br />
            {currentProject?.name ?? 'Loading project...'} · {currentProject?.key ?? projectId}
          </p>
          <p>{currentProject?.description ?? 'No project description was provided.'}</p>
          <div className="grid gap-3 md:grid-cols-2">
            <label className="space-y-1">
              <div className="label">Default host</div>
              <select
                value={projectRuntimeDraft.defaultHost}
                onChange={(event) => setProjectRuntimeField({ defaultHost: event.target.value as ProjectRuntimeProfile['defaultHost'] })}
                className="cp-input"
              >
                {(['desktop_app', 'local_worker', 'remote_worker', 'api'] as const).map((host) => (
                  <option key={host} value={host}>
                    {runtimeHostLabels[host]}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1">
              <div className="label">Default execution mode</div>
              <select
                value={projectRuntimeDraft.defaultExecutionMode}
                onChange={(event) =>
                  setProjectRuntimeField({ defaultExecutionMode: event.target.value as ProjectRuntimeProfile['defaultExecutionMode'] })
                }
                className="cp-input"
              >
                {(['interactive', 'headless', 'queued'] as const).map((mode) => (
                  <option key={mode} value={mode}>
                    {launchModeLabels[mode]}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>
        <Panel className="p-3">
          <div className="label">Project runtime defaults</div>
          <div className="mt-2 flex flex-wrap gap-2">
            <Pill tone="default">host {runtimeHostLabels[projectRuntimeDraft.defaultHost]}</Pill>
            <Pill tone="default">mode {launchModeLabels[projectRuntimeDraft.defaultExecutionMode]}</Pill>
            <Pill tone="default">heartbeat {describeHeartbeatPolicy(projectRuntimeDraft.heartbeatPolicy ?? buildHeartbeatPolicy())}</Pill>
          </div>
        </Panel>
      </div>
    </Panel>
  );

  const renderPrimaryAgentStep = () => (
    <Panel>
      <SectionHeading title="Primary agent" subtitle="Choose the main orchestrating agent" />
      {agents.length === 0 ? (
        <p className="text-sm text-slate-400">No agents are available yet. Create an agent first.</p>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {agents.map((agent) => {
            const selected = agent.id === selectedPrimaryAgentId;
            return (
              <button
                key={agent.id}
                type="button"
                onClick={() => choosePrimaryAgent(agent)}
                className={`rounded-2xl border p-3 text-left transition ${
                  selected
                    ? 'border-cyan-400/40 bg-cyan-400/10 text-cyan-50'
                    : 'border-white/10 bg-white/5 text-slate-200 hover:bg-white/10'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-semibold">{agent.name}</div>
                    <div className="mt-1 text-xs text-slate-400">{agent.role}</div>
                  </div>
                  {selected ? <Pill tone="accent">primary</Pill> : <Pill tone="default">available</Pill>}
                </div>
                <p className="mt-2 text-sm text-slate-300">{agent.description}</p>
                <div className="mt-3 text-xs text-cyan-100/80">{describeRuntimeProfile(runtimeForAgent(agent))}</div>
              </button>
            );
          })}
        </div>
      )}
      {selectedPrimaryAgent ? (
        <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-3 text-sm text-slate-200">
          Primary agent selected: <span className="font-semibold text-white">{selectedPrimaryAgent.name}</span>
        </div>
      ) : null}
    </Panel>
  );

  const renderRuntimeFamilyStep = () => (
    <Panel>
      <SectionHeading title="Runtime family" subtitle="Choose the family tree, not the old adapter label" />
      <div className="grid gap-3 xl:grid-cols-5">
        {runtimeKindOptions.map((option) => {
          const selected = agentRuntimeDraft.runtimeKind === option.value;
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => setAgentRuntimeKind(option.value)}
              className={`rounded-2xl border p-3 text-left transition ${
                selected
                  ? 'border-cyan-400/40 bg-cyan-400/10 text-cyan-50'
                  : 'border-white/10 bg-white/5 text-slate-200 hover:bg-white/10'
              }`}
            >
              <div className="font-semibold">{option.label}</div>
              <div className="mt-1 text-xs text-slate-400">{option.description}</div>
            </button>
          );
        })}
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <Pill tone="default">family {runtimeKindLabels[agentRuntimeDraft.runtimeKind]}</Pill>
        <Pill tone="default">compatibility preserved under the hood</Pill>
      </div>
    </Panel>
  );

  const renderVendorStep = () => (
    <RuntimeProfilePicker
      value={agentRuntimeDraft}
      onChange={setAgentRuntimeDraft}
      title="Vendor-specific config"
      subtitle="Set vendor/runtime details for the primary agent"
      showSummary={false}
      showRuntimeKindPicker={false}
    />
  );

  const renderWorkspaceStep = () => (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
        <Panel>
          <SectionHeading title="Workspace mode" subtitle="How the project is executed" />
          <label className="space-y-1">
            <div className="label">Workspace mode</div>
            <select
              value={workspaceModeDraft}
              onChange={(event) => setWorkspaceModeDraft(event.target.value as Workspace['mode'])}
              className="cp-input"
            >
              <option value="local">local</option>
              <option value="remote">remote</option>
            </select>
          </label>
          <div className="mt-3 flex flex-wrap gap-2">
            <Pill tone={workspaceModeDraft === 'local' ? 'accent' : 'default'}>local</Pill>
            <Pill tone={workspaceModeDraft === 'remote' ? 'accent' : 'default'}>remote</Pill>
          </div>
        </Panel>
        <WorkspaceBrowserPicker
          value={selectedWorkspacePath || undefined}
          onChange={(path) => setWorkspacePathDraft(path ?? '')}
          title="Browse workspace folders"
          subtitle="Pick a project folder from the server-approved roots"
        />
      </div>
      <Panel>
        <SectionHeading title="Workspace selection" subtitle="Current selection" />
        <p className="text-sm text-slate-300">{selectedWorkspacePath || 'No folder selected yet.'}</p>
      </Panel>
    </div>
  );

  const renderHeartbeatStep = () => (
    <div className="space-y-4">
      <HeartbeatPolicyEditor
        value={projectRuntimeDraft.heartbeatPolicy ?? buildHeartbeatPolicy()}
        onChange={(heartbeatPolicy) => setProjectRuntimeField({ heartbeatPolicy })}
      />
      <Panel>
        <SectionHeading
          title="Heartbeat status"
          subtitle="Manual trigger and scheduled execution"
          action={
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" onClick={() => void runProjectHeartbeat('manual')} disabled={Boolean(runningHeartbeat)}>
                {runningHeartbeat === 'manual' ? 'Triggering...' : 'Run heartbeat'}
              </Button>
              <Button variant="secondary" onClick={() => void runProjectHeartbeat('tick')} disabled={Boolean(runningHeartbeat)}>
                {runningHeartbeat === 'tick' ? 'Ticking...' : 'Scheduler tick'}
              </Button>
            </div>
          }
        />
        <div className="flex flex-wrap gap-2">
          <Pill tone={heartbeatTone(heartbeatStatus?.overallStatus ?? 'idle')}>status {heartbeatStatus?.overallStatus ?? 'idle'}</Pill>
          <Pill tone={heartbeatStatus?.due ? 'warn' : 'default'}>{heartbeatStatus?.due ? 'due' : 'not due'}</Pill>
          <Pill tone="default">jobs {heartbeatStatus?.lastJobIds.length ?? 0}</Pill>
          <Pill tone="default">completed {heartbeatStatus?.completedCount ?? 0}</Pill>
          <Pill tone="default">running {heartbeatStatus?.runningCount ?? 0}</Pill>
          <Pill tone="default">failed {heartbeatStatus?.failedCount ?? 0}</Pill>
        </div>
        <p className="mt-3 text-sm text-slate-300">{describeHeartbeatPolicy(projectRuntimeDraft.heartbeatPolicy ?? buildHeartbeatPolicy())}</p>
      </Panel>
    </div>
  );

  const renderReviewStep = () => (
    <div className="space-y-4">
      <RuntimeProfileSummary
        title="Primary agent runtime"
        subtitle="Final runtime summary"
        profile={agentRuntimeDraft}
      />
      <Panel>
        <SectionHeading title="Project defaults" subtitle="Project runtime profile" />
        <div className="flex flex-wrap gap-2">
          <Pill tone="default">host {runtimeHostLabels[projectRuntimeDraft.defaultHost]}</Pill>
          <Pill tone="default">mode {launchModeLabels[projectRuntimeDraft.defaultExecutionMode]}</Pill>
          {selectedPrimaryAgent ? <Pill tone="good">primary {selectedPrimaryAgent.name}</Pill> : <Pill tone="warn">no primary agent</Pill>}
          {workspace ? <Pill tone="good">workspace {workspace.id}</Pill> : <Pill tone="warn">workspace not saved yet</Pill>}
        </div>
        <p className="mt-3 text-sm text-slate-300">{describeHeartbeatPolicy(projectRuntimeDraft.heartbeatPolicy ?? buildHeartbeatPolicy())}</p>
      </Panel>
      <Panel>
        <SectionHeading title="Workspace" subtitle="Browser-selected folder" />
        <p className="text-sm text-slate-300">{selectedWorkspacePath || 'No workspace folder selected.'}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Pill tone="default">mode {workspaceModeDraft}</Pill>
          <Pill tone="default">primary agent {selectedPrimaryAgent?.name ?? 'unselected'}</Pill>
        </div>
      </Panel>
      <Panel>
        <SectionHeading title="Agent runtime" subtitle="Vendor tree and launch configuration" />
        <p className="text-sm text-slate-300">{describeRuntimeProfile(agentRuntimeDraft)}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Pill tone="default">vendor {runtimeVendorLabels[agentRuntimeDraft.vendor]}</Pill>
          <Pill tone="default">host {runtimeHostLabels[agentRuntimeDraft.host]}</Pill>
          <Pill tone="default">mode {launchModeLabels[agentRuntimeDraft.launchMode]}</Pill>
          <Pill tone="default">family {runtimeKindLabels[agentRuntimeDraft.runtimeKind]}</Pill>
        </div>
      </Panel>
      <div className="flex flex-wrap gap-2">
        <Button variant="primary" onClick={() => void saveOnboarding()} disabled={saving}>
          {saving ? 'Saving...' : 'Finish onboarding'}
        </Button>
        <Link
          to="/project/$projectId"
          params={{ projectId: projectId ?? '' }}
          className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white transition hover:bg-white/10"
        >
          Back to project
        </Link>
      </div>
    </div>
  );

  if (!projectId) {
    return <Panel>No project id provided.</Panel>;
  }

  if (loading && !currentProject) {
    return <Panel>Loading project onboarding...</Panel>;
  }

  return (
    <div className="space-y-5">
      <Panel>
        <SectionHeading
          title={`Project onboarding · ${currentProject?.name ?? projectId}`}
          subtitle="A guided path from project basics to runtime readiness"
          action={
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" onClick={() => void loadContext()}>
                {loading ? 'Refreshing...' : 'Refresh'}
              </Button>
              <Link
                to="/project/$projectId"
                params={{ projectId }}
                className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white transition hover:bg-white/10"
              >
                Project detail
              </Link>
            </div>
          }
        />
        <ProgressBar value={((activeStep + 1) / wizardSteps.length) * 100} />
        <div className="mt-3 flex flex-wrap gap-2">
          {wizardSteps.map((step, index) => (
            <button
              key={step.key}
              type="button"
              onClick={() => setActiveStep(index)}
              className={`rounded-xl border px-3 py-2 text-left text-sm transition ${
                index === activeStep
                  ? 'border-cyan-400/40 bg-cyan-400/10 text-cyan-50'
                  : 'border-white/10 bg-white/5 text-slate-200 hover:bg-white/10'
              }`}
            >
              <div className="font-medium">{step.title}</div>
              <div className="mt-1 text-xs text-slate-400">{step.description}</div>
            </button>
          ))}
        </div>
        {error ? <p className="mt-3 text-sm text-rose-300">{error}</p> : null}
        {notice ? <p className="mt-3 text-sm text-emerald-300">{notice}</p> : null}
        {auth.enabled && auth.required ? <p className="mt-3 text-sm text-slate-300">Authentication is required for onboarding.</p> : null}
      </Panel>

      {activeStep === 0 ? renderBasicsStep() : null}
      {activeStep === 1 ? renderPrimaryAgentStep() : null}
      {activeStep === 2 ? renderRuntimeFamilyStep() : null}
      {activeStep === 3 ? renderVendorStep() : null}
      {activeStep === 4 ? renderWorkspaceStep() : null}
      {activeStep === 5 ? renderHeartbeatStep() : null}
      {activeStep === 6 ? renderReviewStep() : null}

      <Panel>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-1">
            <div className="label">
              Step {activeStep + 1} of {wizardSteps.length}
            </div>
            <div className="text-sm text-slate-300">{wizardSteps[activeStep]?.description ?? ''}</div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => setActiveStep((current) => Math.max(0, current - 1))} disabled={activeStep === 0}>
              Back
            </Button>
            {activeStep < wizardSteps.length - 1 ? (
              <Button variant="primary" onClick={() => setActiveStep((current) => Math.min(wizardSteps.length - 1, current + 1))}>
                Next
              </Button>
            ) : (
              <Button variant="primary" onClick={() => void saveOnboarding()} disabled={saving}>
                {saving ? 'Saving...' : 'Finish onboarding'}
              </Button>
            )}
          </div>
        </div>
      </Panel>
    </div>
  );
}
