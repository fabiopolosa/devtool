import { Link, useNavigate } from '@tanstack/react-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  AgentConfig,
  AgentRuntimeProfile,
  AgentRuntimeVendor,
  Project,
  ProjectRuntimeProfile,
  ProviderConfig,
  ProviderName,
  Workspace
} from '@cp/domain';
import { buildHeartbeatPolicy, buildProjectRuntimeProfile } from '@cp/domain';
import { providerNames } from '@cp/domain';
import { Button, Panel, Pill, ProgressBar, SectionHeading } from '@/components/common';
import { HeartbeatPolicyEditor } from '@/components/runtime-profile/HeartbeatPolicyEditor';
import { RuntimeProfileSummary } from '@/components/runtime-profile/RuntimeProfileSummary';
import {
  defaultAppTargetConfig,
  describeAppTarget,
  describeHeartbeatPolicy,
  describeRuntimeProfile,
  describeLocalWrapperStatus,
  launchModeLabels,
  normalizeAppTargetConfig,
  resolveRuntimeProfileForAgent,
  resolveLocalWrapperSignals,
  runtimeHostLabels,
  runtimeVendorLabels
} from '@/components/runtime-profile/runtime-profile-utils';
import { WorkspaceBrowserPicker } from '@/components/project-onboarding/WorkspaceBrowserPicker';
import { useAppStore } from '@/store/app-store';
import { usePathParam } from './_utils';

type ProjectRuntimeRecord = Project & { runtimeProfile?: ProjectRuntimeProfile };

type LocalHostSnapshot = {
  attached?: boolean;
  connected?: boolean;
  machineAttached?: boolean;
  status?: string;
  machineName?: string;
  hostname?: string;
  workspaceAttached?: boolean;
  folderAttached?: boolean;
  localPath?: string;
  workspacePath?: string;
  previewAvailable?: boolean;
  previewStatus?: string;
  previewUrl?: string;
  previewPort?: number;
  message?: string;
};

type AppTargetConfig = {
  id?: string;
  name: string;
  runCommand?: string;
  testCommand?: string;
  devCommand?: string;
  previewUrl?: string;
  previewPort?: number;
  enabled?: boolean;
  status?: string;
  lastAction?: string;
  lastActionAt?: string;
};

type AppTargetDraft = {
  id: string | undefined;
  name: string;
  runCommand: string;
  testCommand: string;
  devCommand: string;
  previewUrl: string;
  previewPort: string;
};

const wizardSteps = [
  { key: 'basics', title: 'basics', description: 'Project defaults and first-run posture' },
  { key: 'primary-agent', title: 'primary agent', description: 'Every project starts with one coordinator. Connect its first API and/or local CLI here.' },
  { key: 'workspace', title: 'workspace', description: 'Choose local or remote workspace and select a local folder if needed' },
  { key: 'heartbeat', title: 'checks', description: 'Choose a lightweight project check cadence' },
  { key: 'review', title: 'review', description: 'Check the final onboarding plan' }
] as const;

const cliVendorOptions = ['openai_codex', 'claude_code', 'gemini_cli', 'generic_cli'] as const;
type CliRuntimeVendor = (typeof cliVendorOptions)[number];
type CoordinatorPreferredConnection = 'cli' | 'api';

type CoordinatorSetupDraft = {
  cliEnabled: boolean;
  cliVendor: CliRuntimeVendor;
  apiEnabled: boolean;
  apiProvider: ProviderName;
  apiKey: string;
  apiConfigId?: string;
  preferredConnection: CoordinatorPreferredConnection;
};

const toSelectedAgentPolicy = (agentId?: string): Record<string, unknown> =>
  agentId ? { mode: 'primary', agentIds: [agentId] } : { mode: 'manual' };

const runtimeForAgent = (agent: AgentConfig): AgentRuntimeProfile => resolveRuntimeProfileForAgent(agent);

const coordinationScore = (agent: AgentConfig): number => {
  const role = agent.role.toLowerCase();
  const name = agent.name.toLowerCase();
  const description = (agent.description ?? '').toLowerCase();
  const haystack = `${role} ${name} ${description}`;
  let score = 0;
  if (haystack.includes('coordinator')) score += 6;
  if (haystack.includes('orchestrator')) score += 5;
  if (haystack.includes('lead')) score += 2;
  if (haystack.includes('primary')) score += 2;
  return score;
};

const resolvePreferredPrimaryAgent = (agents: AgentConfig[]): AgentConfig | undefined => {
  if (agents.length === 0) return undefined;
  return [...agents].sort((left, right) => coordinationScore(right) - coordinationScore(left))[0] ?? agents[0];
};

const apiVendorByProvider: Record<ProviderName, Extract<AgentRuntimeVendor, 'openai_api' | 'anthropic_api' | 'gemini_api' | 'generic_api'>> = {
  openai: 'openai_api',
  anthropic: 'anthropic_api',
  gemini: 'gemini_api',
  openrouter: 'generic_api',
  kie_ai: 'generic_api',
  mistral: 'generic_api',
  cohere: 'generic_api',
  ai21: 'generic_api',
  zhipu: 'generic_api',
  meta_llama: 'generic_api',
  databricks_dbrx: 'generic_api',
  xai: 'generic_api',
  amazon_bedrock: 'generic_api',
  aleph_alpha: 'generic_api'
};

const providerFromApiVendor = (
  vendor?: AgentRuntimeVendor,
  providerConfigs: ProviderConfig[] = [],
  apiConfigRef?: string
): ProviderName => {
  if (apiConfigRef) {
    const matchingConfig = providerConfigs.find((item) => item.id === apiConfigRef);
    const providerId = matchingConfig?.providerId ?? matchingConfig?.provider;
    if (providerId) return providerId;
  }
  if (vendor === 'anthropic_api') return 'anthropic';
  if (vendor === 'gemini_api') return 'gemini';
  return 'openai';
};

const asRecord = (value: unknown): Record<string, unknown> | undefined =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;

const buildDefaultCoordinatorSetupDraft = (): CoordinatorSetupDraft => ({
  cliEnabled: true,
  cliVendor: 'openai_codex',
  apiEnabled: false,
  apiProvider: 'openai',
  apiKey: '',
  preferredConnection: 'cli'
});

const deriveCoordinatorSetupDraft = (
  agent: AgentConfig | undefined,
  providerConfigs: ProviderConfig[]
): CoordinatorSetupDraft => {
  if (!agent) return buildDefaultCoordinatorSetupDraft();
  const runtime = runtimeForAgent(agent);
  const metadata = asRecord(runtime.metadata);
  const connectionModes = asRecord(metadata?.connectionModes);
  const explicitCliVendor = cliVendorOptions.find((vendor) => vendor === runtime.vendor);
  const metadataCliVendor = cliVendorOptions.find(
    (vendor) => vendor === metadata?.cliVendor || vendor === connectionModes?.cliVendor
  );
  const cliEnabled =
    runtime.runtimeKind !== 'server_api'
    || connectionModes?.cliEnabled === true
    || Boolean(metadataCliVendor);
  const apiEnabled =
    runtime.runtimeKind === 'server_api'
    || typeof runtime.apiConfigRef === 'string'
    || connectionModes?.apiEnabled === true;
  const preferredConnection =
    metadata?.preferredConnection === 'api'
    || connectionModes?.preferred === 'api'
    || runtime.runtimeKind === 'server_api'
      ? 'api'
      : 'cli';
  return {
    cliEnabled,
    cliVendor: explicitCliVendor ?? metadataCliVendor ?? 'openai_codex',
    apiEnabled,
    apiProvider: providerFromApiVendor(runtime.vendor, providerConfigs, runtime.apiConfigRef),
    apiKey: '',
    ...(runtime.apiConfigRef ? { apiConfigId: runtime.apiConfigRef } : {}),
    preferredConnection
  };
};

const resolveProviderConfigForProvider = (
  providerConfigs: ProviderConfig[],
  provider: ProviderName,
  preferredId?: string
): ProviderConfig | undefined => {
  if (preferredId) {
    const preferred = providerConfigs.find((item) => item.id === preferredId);
    if (preferred) return preferred;
  }
  return providerConfigs.find((item) => (item.providerId ?? item.provider) === provider);
};

const isText = (value?: string | null): boolean => Boolean(value && value.trim().length > 0);

const buildAppTargetDraft = (target?: AppTargetConfig | null): AppTargetDraft => ({
  id: target?.id,
  name: target?.name ?? defaultAppTargetConfig().name,
  runCommand: target?.runCommand ?? '',
  testCommand: target?.testCommand ?? '',
  devCommand: target?.devCommand ?? '',
  previewUrl: target?.previewUrl ?? '',
  previewPort: typeof target?.previewPort === 'number' ? String(target.previewPort) : ''
});

const normalizeAppTargetDraft = (draft: AppTargetDraft): AppTargetConfig => {
  const previewPort = draft.previewPort.trim().length > 0 ? Number(draft.previewPort.trim()) : undefined;
  return normalizeAppTargetConfig({
    ...(isText(draft.id) ? { id: draft.id } : {}),
    name: draft.name,
    ...(isText(draft.runCommand) ? { runCommand: draft.runCommand } : {}),
    ...(isText(draft.testCommand) ? { testCommand: draft.testCommand } : {}),
    ...(isText(draft.devCommand) ? { devCommand: draft.devCommand } : {}),
    ...(isText(draft.previewUrl) ? { previewUrl: draft.previewUrl } : {}),
    ...(Number.isFinite(previewPort) ? { previewPort } : {})
  });
};

const resolveLocalMachineLabel = (localHost: LocalHostSnapshot | undefined): string =>
  localHost?.machineName ?? localHost?.hostname ?? 'Local machine';

export function ProjectOnboardingPage() {
  const navigate = useNavigate();
  const { state, auth, authActions } = useAppStore();
  const projectId = usePathParam(2);
  const projectFromStore = useMemo(() => state.projects.find((item) => item.id === projectId), [projectId, state.projects]);
  const [project, setProject] = useState<ProjectRuntimeRecord | undefined>(projectFromStore);
  const [agents, setAgents] = useState<AgentConfig[]>([]);
  const [providerConfigs, setProviderConfigs] = useState<ProviderConfig[]>([]);
  const [workspace, setWorkspace] = useState<Workspace | undefined>();
  const [projectRuntimeDraft, setProjectRuntimeDraft] = useState<ProjectRuntimeProfile>(buildProjectRuntimeProfile());
  const [coordinatorSetupDraft, setCoordinatorSetupDraft] = useState<CoordinatorSetupDraft>(buildDefaultCoordinatorSetupDraft());
  const [workspaceModeDraft, setWorkspaceModeDraft] = useState<Workspace['mode']>('local');
  const [workspacePathDraft, setWorkspacePathDraft] = useState('');
  const [localHost, setLocalHost] = useState<LocalHostSnapshot | undefined>();
  const [localWrapperLoading, setLocalWrapperLoading] = useState(false);
  const [localWrapperSaving, setLocalWrapperSaving] = useState(false);
  const [localWrapperAction, setLocalWrapperAction] = useState<string | undefined>();
  const [localWrapperError, setLocalWrapperError] = useState<string | undefined>();
  const [localWrapperNotice, setLocalWrapperNotice] = useState<string | undefined>();
  const [appTargetDraft, setAppTargetDraft] = useState<AppTargetDraft>(buildAppTargetDraft());
  const [activeStep, setActiveStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [runningHeartbeat, setRunningHeartbeat] = useState<boolean>(false);
  const [error, setError] = useState<string | undefined>();
  const [notice, setNotice] = useState<string | undefined>();
  const mountedRef = useRef(false);

  const currentProject = project ?? projectFromStore;
  const selectedPrimaryAgentId = projectRuntimeDraft.primaryAgentId ?? '';
  const selectedPrimaryAgent = agents.find((agent) => agent.id === selectedPrimaryAgentId);
  const selectedPrimaryAgentRuntime = selectedPrimaryAgent ? runtimeForAgent(selectedPrimaryAgent) : undefined;
  const selectedWorkspacePath = workspaceModeDraft === 'local' ? (workspace?.localPath ?? workspacePathDraft) : '';
  const localWrapperSignals = resolveLocalWrapperSignals(localHost, selectedWorkspacePath, appTargetDraft);
  const localWrapperReady =
    localWrapperSignals.machineAttached && localWrapperSignals.folderAttached && localWrapperSignals.previewAvailable;
  const canManageProviders =
    !auth.enabled
    || Boolean(auth.principal?.roles.includes('owner') || auth.principal?.roles.includes('admin'))
    || auth.principal?.tenantRole === 'owner'
    || auth.principal?.tenantRole === 'admin';

  const loadLocalWrapper = useCallback(async (): Promise<void> => {
    if (!projectId) {
      if (!mountedRef.current) return;
      setLocalHost(undefined);
      setAppTargetDraft(buildAppTargetDraft());
      return;
    }
    if (!mountedRef.current) return;
    setLocalWrapperLoading(true);
    setLocalWrapperError(undefined);
    try {
      const [localHostResponse, appTargetsResponse] = await Promise.all([
        authActions.apiFetchJson<{ item?: LocalHostSnapshot; message?: string }>(`/projects/${projectId}/local-host`),
        authActions.apiFetchJson<{ item?: AppTargetConfig; items?: AppTargetConfig[]; targets?: AppTargetConfig[]; message?: string }>(
          `/projects/${projectId}/app-targets`
        )
      ]);

      if (!localHostResponse.response.ok) {
        throw new Error(localHostResponse.body.message ?? `Unable to load local host (HTTP ${localHostResponse.response.status})`);
      }
      if (!appTargetsResponse.response.ok) {
        throw new Error(appTargetsResponse.body.message ?? `Unable to load app targets (HTTP ${appTargetsResponse.response.status})`);
      }

      const loadedTarget =
        appTargetsResponse.body.item
        ?? appTargetsResponse.body.items?.[0]
        ?? appTargetsResponse.body.targets?.[0]
        ?? undefined;

      if (!mountedRef.current) return;
      setLocalHost(localHostResponse.body.item);
      setAppTargetDraft(buildAppTargetDraft(loadedTarget));
    } catch (loadError) {
      if (!mountedRef.current) return;
      setLocalWrapperError(loadError instanceof Error ? loadError.message : 'Unable to load local wrapper');
    } finally {
      if (!mountedRef.current) return;
      setLocalWrapperLoading(false);
    }
  }, [authActions, projectId]);

  const loadContext = useCallback(async (): Promise<void> => {
    if (!projectId) return;
    setLoading(true);
    setError(undefined);
    try {
      const [projectResponse, runtimeResponse, agentsResponse, workspacesResponse, providersResponse] = await Promise.all([
        authActions.apiFetchJson<{ item?: ProjectRuntimeRecord; message?: string }>(`/projects/${projectId}`),
        authActions.apiFetchJson<{ item?: ProjectRuntimeRecord; message?: string }>(`/projects/${projectId}/runtime`),
        authActions.apiFetchJson<{ items?: AgentConfig[]; message?: string }>('/agents'),
        authActions.apiFetchJson<{ items?: Workspace[]; message?: string }>(`/workspaces?projectId=${encodeURIComponent(projectId)}`),
        authActions.apiFetchJson<{ items?: ProviderConfig[]; message?: string }>('/providers/config')
      ]);

      const loadedProject =
        projectResponse.response.ok && projectResponse.body.item
          ? projectResponse.body.item
          : runtimeResponse.response.ok && runtimeResponse.body.item
            ? runtimeResponse.body.item
            : projectFromStore;
      const projectMissing =
        !loadedProject
        && projectResponse.response.status === 404
        && runtimeResponse.response.status === 404;
      if (projectMissing) {
        if (!mountedRef.current) return;
        setNotice('That project is no longer available. Starting a fresh project setup instead.');
        await navigate({ to: '/projects/new' } as any);
        return;
      }
      if (!loadedProject) {
        throw new Error(projectResponse.body.message ?? `Unable to load project (HTTP ${projectResponse.response.status})`);
      }
      const loadedRuntime = buildProjectRuntimeProfile(
        runtimeResponse.response.ok && runtimeResponse.body.item
          ? runtimeResponse.body.item.runtimeProfile ?? {}
          : {}
      );
      const loadedAgents = agentsResponse.response.ok ? agentsResponse.body.items ?? [] : [];
      const loadedProviderConfigs = providersResponse.response.ok ? providersResponse.body.items ?? [] : [];
      const loadedWorkspace = workspacesResponse.response.ok ? workspacesResponse.body.items?.[0] : undefined;
      const preferredPrimaryAgent = resolvePreferredPrimaryAgent(loadedAgents);
      const selectedAgentId = loadedRuntime.primaryAgentId ?? preferredPrimaryAgent?.id ?? loadedAgents[0]?.id;
      const selectedAgent = loadedAgents.find((agent) => agent.id === selectedAgentId);

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
      setProviderConfigs(loadedProviderConfigs);
      setCoordinatorSetupDraft(deriveCoordinatorSetupDraft(selectedAgent, loadedProviderConfigs));
      setWorkspace(loadedWorkspace);
      setWorkspaceModeDraft(loadedWorkspace?.mode ?? 'local');
      setWorkspacePathDraft(loadedWorkspace?.localPath ?? '');
      if (
        !runtimeResponse.response.ok
        || !agentsResponse.response.ok
        || !workspacesResponse.response.ok
        || !providersResponse.response.ok
      ) {
        setNotice('Some advanced setup details were unavailable, so onboarding loaded with safe defaults.');
      }
      void loadLocalWrapper();
    } catch (loadError) {
      if (!mountedRef.current) return;
      setError(loadError instanceof Error ? loadError.message : 'Unable to load project onboarding data');
    } finally {
      if (!mountedRef.current) return;
      setLoading(false);
    }
  }, [authActions, navigate, projectFromStore, projectId, loadLocalWrapper]);

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

  const choosePrimaryAgent = (agent: AgentConfig): void => {
    setProjectRuntimeDraft((current) => ({
      ...current,
      primaryAgentId: agent.id,
      agentSelectionPolicy: toSelectedAgentPolicy(agent.id)
    }));
    setCoordinatorSetupDraft(deriveCoordinatorSetupDraft(agent, providerConfigs));
  };

  const setCoordinatorSetupField = (patch: Partial<CoordinatorSetupDraft>): void => {
    setCoordinatorSetupDraft((current) => ({
      ...current,
      ...patch
    }));
  };

  const upsertProviderConfig = useCallback(
    async (provider: ProviderName, apiKey: string, existingConfig?: ProviderConfig): Promise<ProviderConfig> => {
      if (!canManageProviders) {
        throw new Error('Only tenant owners can add or rotate provider keys. Ask an owner or disable Cloud / API for now.');
      }

      const targetPath = existingConfig ? `/providers/config/${existingConfig.id}` : '/providers/config';
      const method = existingConfig ? 'PATCH' : 'POST';
      const { response, body } = await authActions.apiFetchJson<{ item?: ProviderConfig; message?: string }>(targetPath, {
        method,
        body: JSON.stringify({
          providerId: provider,
          apiKey,
          enabled: true
        })
      });
      if (!response.ok || !body.item) {
        throw new Error(body.message ?? `Unable to save provider configuration (HTTP ${response.status})`);
      }
      return body.item;
    },
    [authActions, canManageProviders]
  );

  const saveAppTarget = useCallback(async (): Promise<void> => {
    if (!projectId) return;
    setLocalWrapperSaving(true);
    setLocalWrapperError(undefined);
    setLocalWrapperNotice(undefined);
    try {
      const nextTarget = normalizeAppTargetDraft(appTargetDraft);
      const { response, body } = await authActions.apiFetchJson<{ item?: AppTargetConfig; message?: string }>(
        `/projects/${projectId}/app-targets`,
        {
          method: 'PUT',
          body: JSON.stringify(nextTarget)
        }
      );
      if (!response.ok || !body.item) {
        throw new Error(body.message ?? `Unable to save app target (HTTP ${response.status})`);
      }
      if (!mountedRef.current) return;
      setAppTargetDraft(buildAppTargetDraft(body.item));
      setLocalWrapperNotice('App target saved.');
      await loadLocalWrapper();
    } catch (saveError) {
      if (!mountedRef.current) return;
      setLocalWrapperError(saveError instanceof Error ? saveError.message : 'Unable to save app target');
    } finally {
      if (!mountedRef.current) return;
      setLocalWrapperSaving(false);
    }
  }, [appTargetDraft, authActions, loadLocalWrapper, projectId]);

  const runAppTargetAction = useCallback(
    async (action: 'run' | 'test' | 'dev'): Promise<void> => {
      if (!projectId) return;
      const targetId = appTargetDraft.id?.trim();
      if (!targetId) {
        setLocalWrapperError('Save the app target first so the actions know which target to use.');
        return;
      }
      setLocalWrapperAction(action);
      setLocalWrapperError(undefined);
      setLocalWrapperNotice(undefined);
      try {
        const { response, body } = await authActions.apiFetchJson<{ item?: AppTargetConfig; message?: string }>(
          `/projects/${projectId}/app-targets/${encodeURIComponent(targetId)}/actions`,
          {
            method: 'POST',
            body: JSON.stringify({ action })
          }
        );
        if (!response.ok) {
          throw new Error(body.message ?? `Unable to ${action} app target (HTTP ${response.status})`);
        }
        if (!mountedRef.current) return;
        setLocalWrapperNotice(`App target ${action} requested.`);
        await loadLocalWrapper();
      } catch (actionError) {
        if (!mountedRef.current) return;
        setLocalWrapperError(actionError instanceof Error ? actionError.message : `Unable to ${action} app target`);
      } finally {
        if (!mountedRef.current) return;
        setLocalWrapperAction(undefined);
      }
    },
    [appTargetDraft.id, authActions, loadLocalWrapper, projectId]
  );

  const runProjectHeartbeat = async (): Promise<void> => {
    if (!projectId) return;
    setRunningHeartbeat(true);
    setError(undefined);
    setNotice(undefined);
    try {
      const response = await authActions.apiFetch(`/projects/${projectId}/runtime/heartbeat`, {
        method: 'POST',
        body: JSON.stringify({ trigger: 'manual', reason: 'onboarding_ui' })
      });
      const body = (await response.json()) as {
        item?: { jobs?: Array<{ jobId: string }>; targets?: Array<{ agentName: string }> };
        message?: string;
      };
      if (!response.ok || !body.item) {
        throw new Error(body.message ?? `Unable to run project check (HTTP ${response.status})`);
      }
      setNotice(`Project check dispatched to ${body.item.targets?.length ?? 0} agent(s).`);
      await loadContext();
    } catch (heartbeatError) {
      setError(heartbeatError instanceof Error ? heartbeatError.message : 'Unable to run project check');
    } finally {
      setRunningHeartbeat(false);
    }
  };

  const saveOnboarding = async (): Promise<void> => {
    if (!projectId) return;

    setSaving(true);
    setError(undefined);
    setNotice(undefined);
    try {
      if (!selectedPrimaryAgentId || !selectedPrimaryAgent) {
        throw new Error('This project should already have a coordinator agent. Refresh the page and try again.');
      }
      if (!coordinatorSetupDraft.cliEnabled && !coordinatorSetupDraft.apiEnabled) {
        throw new Error('Enable at least one coordinator connection: local CLI, cloud API, or both.');
      }
      if (coordinatorSetupDraft.preferredConnection === 'api' && !coordinatorSetupDraft.apiEnabled) {
        throw new Error('Cloud / API is marked as preferred, but it is not enabled yet.');
      }
      if (coordinatorSetupDraft.preferredConnection === 'cli' && !coordinatorSetupDraft.cliEnabled) {
        throw new Error('Local CLI is marked as preferred, but it is not enabled yet.');
      }

      let nextProviderConfigs = providerConfigs;
      let apiConfigId = coordinatorSetupDraft.apiConfigId;
      const trimmedApiKey = coordinatorSetupDraft.apiKey.trim();
      const existingProviderConfig = resolveProviderConfigForProvider(
        nextProviderConfigs,
        coordinatorSetupDraft.apiProvider,
        coordinatorSetupDraft.apiConfigId
      );

      if (coordinatorSetupDraft.apiEnabled) {
        if (trimmedApiKey) {
          const savedProviderConfig = await upsertProviderConfig(
            coordinatorSetupDraft.apiProvider,
            trimmedApiKey,
            existingProviderConfig
          );
          nextProviderConfigs = existingProviderConfig
            ? nextProviderConfigs.map((item) => (item.id === savedProviderConfig.id ? savedProviderConfig : item))
            : [...nextProviderConfigs, savedProviderConfig];
          apiConfigId = savedProviderConfig.id;
        } else if (existingProviderConfig) {
          apiConfigId = existingProviderConfig.id;
        } else {
          throw new Error(`Insert your first ${coordinatorSetupDraft.apiProvider} API key or turn off Cloud / API for now.`);
        }
      }

      const nextAgentRuntime: AgentRuntimeProfile = coordinatorSetupDraft.preferredConnection === 'api'
        ? {
            runtimeKind: 'server_api',
            vendor: apiVendorByProvider[coordinatorSetupDraft.apiProvider],
            host: 'api',
            launchMode: 'queued',
            args: [],
            ...(apiConfigId ? { apiConfigRef: apiConfigId } : {}),
            metadata: {
              ...(selectedPrimaryAgentRuntime?.metadata ?? {}),
              bootstrapRole: 'project_coordinator',
              onboardingStatus: 'configured',
              apiProvider: coordinatorSetupDraft.apiProvider,
              cliVendor: coordinatorSetupDraft.cliVendor,
              preferredConnection: coordinatorSetupDraft.preferredConnection,
              connectionModes: {
                cliEnabled: coordinatorSetupDraft.cliEnabled,
                apiEnabled: coordinatorSetupDraft.apiEnabled,
                preferred: coordinatorSetupDraft.preferredConnection,
                ...(coordinatorSetupDraft.apiEnabled && apiConfigId ? { apiConfigId } : {}),
                ...(coordinatorSetupDraft.cliEnabled ? { cliVendor: coordinatorSetupDraft.cliVendor } : {})
              }
            }
          }
        : {
            runtimeKind: 'desktop_cli',
            vendor: coordinatorSetupDraft.cliVendor,
            host: 'desktop_app',
            launchMode: 'interactive',
            args: [],
            metadata: {
              ...(selectedPrimaryAgentRuntime?.metadata ?? {}),
              bootstrapRole: 'project_coordinator',
              onboardingStatus: 'configured',
              apiProvider: coordinatorSetupDraft.apiProvider,
              cliVendor: coordinatorSetupDraft.cliVendor,
              preferredConnection: coordinatorSetupDraft.preferredConnection,
              connectionModes: {
                cliEnabled: coordinatorSetupDraft.cliEnabled,
                apiEnabled: coordinatorSetupDraft.apiEnabled,
                preferred: coordinatorSetupDraft.preferredConnection,
                ...(coordinatorSetupDraft.apiEnabled && apiConfigId ? { apiConfigId } : {}),
                ...(coordinatorSetupDraft.cliEnabled ? { cliVendor: coordinatorSetupDraft.cliVendor } : {})
              }
            }
          };

      const agentPatchPayload = {
        adapterType: coordinatorSetupDraft.preferredConnection === 'api' ? 'mcp_runtime' as const : 'custom_cli' as const,
        runtimeProfile: nextAgentRuntime
      };

      const agentUpdate = await authActions.apiFetchJson<{ item?: AgentConfig; message?: string }>(
        `/agents/${selectedPrimaryAgentId}`,
        {
          method: 'PATCH',
          body: JSON.stringify(agentPatchPayload)
        }
      );
      if (!agentUpdate.response.ok || !agentUpdate.body.item) {
        throw new Error(agentUpdate.body.message ?? `Unable to update coordinator agent (HTTP ${agentUpdate.response.status})`);
      }

      let workspaceRecord = workspace;
      const trimmedWorkspacePath = workspacePathDraft.trim();
      if (workspaceModeDraft === 'local' && !trimmedWorkspacePath) {
        throw new Error('Choose a local folder or switch this project to remote workspace mode.');
      }

      const createWorkspacePayload = {
        projectId,
        mode: workspaceModeDraft,
        ...(workspaceModeDraft === 'local' ? { localPath: trimmedWorkspacePath } : {})
      };
      const updateWorkspacePayload = {
        mode: workspaceModeDraft,
        localPath: workspaceModeDraft === 'local' ? trimmedWorkspacePath : ''
      };

      if (workspaceRecord) {
        const { response, body } = await authActions.apiFetchJson<{ item?: Workspace; message?: string }>(
          `/workspaces/${workspaceRecord.id}`,
          {
            method: 'PATCH',
            body: JSON.stringify(updateWorkspacePayload)
          }
        );
        if (!response.ok || !body.item) {
          throw new Error(body.message ?? `Unable to update workspace (HTTP ${response.status})`);
        }
        workspaceRecord = body.item;
      } else {
        const { response, body } = await authActions.apiFetchJson<{ item?: Workspace; message?: string }>('/workspaces', {
          method: 'POST',
          body: JSON.stringify(createWorkspacePayload)
        });
        if (!response.ok || !body.item) {
          throw new Error(body.message ?? `Unable to create workspace (HTTP ${response.status})`);
        }
        workspaceRecord = body.item;
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
        metadata: {
          ...(projectRuntimeDraft.metadata ?? {}),
          onboardingStatus: 'configured',
          coordinatorBootstrap: true
        }
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

      setProviderConfigs(nextProviderConfigs);
      setCoordinatorSetupDraft((current) => ({
        ...current,
        apiKey: '',
        ...(apiConfigId ? { apiConfigId } : {})
      }));
      setAgents((current) => current.map((item) => (item.id === agentUpdate.body.item?.id ? agentUpdate.body.item : item)));
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
      <SectionHeading title="Project basics" subtitle="Set the default posture for this project" />
      <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="space-y-3 text-sm text-slate-300">
          <p>
            <span className="label">Project</span>
            <br />
            {currentProject?.name ?? 'Loading project...'} · {currentProject?.key ?? projectId}
          </p>
          <p>{currentProject?.description ?? 'No project description was provided.'}</p>
          <p className="rounded-2xl border border-white/10 bg-white/5 p-3 text-sm text-slate-300">
            This onboarding sets project defaults only. A project can still mix local CLI agents, cloud APIs, and worker-managed runtimes later.
          </p>
          <div className="grid gap-3 md:grid-cols-2">
            <label className="space-y-1">
              <div className="label">Preferred default host</div>
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
              <div className="label">Preferred execution mode</div>
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
          <div className="label">What this sets</div>
          <div className="mt-2 flex flex-wrap gap-2">
            <Pill tone="default">host {runtimeHostLabels[projectRuntimeDraft.defaultHost]}</Pill>
            <Pill tone="default">mode {launchModeLabels[projectRuntimeDraft.defaultExecutionMode]}</Pill>
            <Pill tone="default">primary agent later</Pill>
          </div>
        </Panel>
      </div>
    </Panel>
  );

  const renderPrimaryAgentStep = () => (
    <Panel>
      <SectionHeading title="Primary agent" subtitle="This project already has a coordinator. Finish its first connection here." />
      {agents.length === 0 ? (
        <div className="rounded-2xl border border-amber-400/20 bg-amber-500/10 p-3 text-sm text-amber-100/90">
          No coordinator agent is available for this project yet. Refresh the page or recreate the project so onboarding can bootstrap it correctly.
        </div>
      ) : (
        <>
          <div className="mb-4 rounded-2xl border border-white/10 bg-white/5 p-3 text-sm text-slate-300">
            Every project starts with one coordinator agent. Configure its first connection now: local CLI, cloud API, or both. Advanced agent graphs can be added from inside the project later.
          </div>
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
                    {selected ? <Pill tone="accent">coordinator</Pill> : <Pill tone="default">available</Pill>}
                  </div>
                  <p className="mt-2 text-sm text-slate-300">{agent.description}</p>
                  <div className="mt-3 text-xs text-cyan-100/80">{describeRuntimeProfile(runtimeForAgent(agent))}</div>
                </button>
              );
            })}
          </div>
        </>
      )}
      {selectedPrimaryAgent ? (
        <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-3 text-sm text-slate-200">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              Primary agent selected: <span className="font-semibold text-white">{selectedPrimaryAgent.name}</span>
              <p className="mt-2 text-xs text-slate-400">
                This coordinator is created together with the project. You are configuring how it can start working right away.
              </p>
            </div>
            <Pill tone="good">created with project</Pill>
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <Panel className="p-3">
              <SectionHeading title="Connection modes" subtitle="API and local CLI can coexist" />
              <div className="space-y-4">
                <label className="flex items-start gap-3 rounded-2xl border border-white/10 bg-slate-950/30 p-3">
                  <input
                    type="checkbox"
                    checked={coordinatorSetupDraft.cliEnabled}
                    onChange={(event) =>
                      setCoordinatorSetupField({
                        cliEnabled: event.target.checked,
                        ...(event.target.checked ? {} : { preferredConnection: coordinatorSetupDraft.apiEnabled ? 'api' : 'cli' })
                      })
                    }
                  />
                  <div className="space-y-1">
                    <div className="font-medium text-white">Use local CLI on this machine</div>
                    <div className="text-xs text-slate-400">Best for local models, offline work, or when the coordinator should run here first.</div>
                  </div>
                </label>
                {coordinatorSetupDraft.cliEnabled ? (
                  <label className="space-y-1">
                    <div className="label">CLI runtime</div>
                    <select
                      value={coordinatorSetupDraft.cliVendor}
                      onChange={(event) =>
                        setCoordinatorSetupField({ cliVendor: event.target.value as CliRuntimeVendor })
                      }
                      className="cp-input"
                    >
                      {cliVendorOptions.map((vendor) => (
                        <option key={vendor} value={vendor}>
                          {runtimeVendorLabels[vendor]}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}

                <label className="flex items-start gap-3 rounded-2xl border border-white/10 bg-slate-950/30 p-3">
                  <input
                    type="checkbox"
                    checked={coordinatorSetupDraft.apiEnabled}
                    onChange={(event) =>
                      setCoordinatorSetupField({
                        apiEnabled: event.target.checked,
                        ...(event.target.checked ? {} : { preferredConnection: coordinatorSetupDraft.cliEnabled ? 'cli' : 'api' })
                      })
                    }
                  />
                  <div className="space-y-1">
                    <div className="font-medium text-white">Use cloud / API access</div>
                    <div className="text-xs text-slate-400">Connect hosted models through provider keys. This is the fastest way to make the coordinator useful immediately.</div>
                  </div>
                </label>
                {coordinatorSetupDraft.apiEnabled ? (
                  <div className="grid gap-3 md:grid-cols-2">
                    <label className="space-y-1">
                      <div className="label">Provider</div>
                      <select
                        value={coordinatorSetupDraft.apiProvider}
                        onChange={(event) =>
                          setCoordinatorSetupField({
                            apiProvider: event.target.value as ProviderName,
                            ...(() => {
                              const nextConfigId = resolveProviderConfigForProvider(
                                providerConfigs,
                                event.target.value as ProviderName
                              )?.id;
                              return nextConfigId ? { apiConfigId: nextConfigId } : {};
                            })()
                          })
                        }
                        className="cp-input"
                      >
                        {providerNames.map((provider) => (
                          <option key={provider} value={provider}>
                            {provider}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="space-y-1">
                      <div className="label">Insert your first API key</div>
                      <input
                        type="password"
                        value={coordinatorSetupDraft.apiKey}
                        onChange={(event) => setCoordinatorSetupField({ apiKey: event.target.value })}
                        placeholder="Paste a provider key now, or reuse an existing config below"
                        className="cp-input"
                      />
                    </label>
                  </div>
                ) : null}
                {coordinatorSetupDraft.apiEnabled ? (
                  <p className="text-xs text-slate-400">
                    {resolveProviderConfigForProvider(
                      providerConfigs,
                      coordinatorSetupDraft.apiProvider,
                      coordinatorSetupDraft.apiConfigId
                    )
                      ? `An existing ${coordinatorSetupDraft.apiProvider} provider config is already available. If you paste a new key here, onboarding will update it.`
                      : canManageProviders
                        ? 'No provider config exists yet. Pasting a key here will create the first one for this provider.'
                        : 'No provider config exists yet. A tenant owner will need to add the first key if you cannot manage providers.'}
                  </p>
                ) : null}
              </div>
            </Panel>

            <Panel className="p-3">
              <SectionHeading title="Coordinator default path" subtitle="Choose what this agent should prefer first" />
              <div className="grid gap-3">
                {([
                  {
                    value: 'cli' as const,
                    title: 'Prefer local CLI',
                    description: 'Keep the coordinator machine-first. Good when you rely on local tools, desktop agents, or offline work.'
                  },
                  {
                    value: 'api' as const,
                    title: 'Prefer cloud / API',
                    description: 'Route the coordinator through provider-backed APIs by default. Good when you want it working immediately with hosted models.'
                  }
                ]).map((option) => {
                  const disabled =
                    option.value === 'cli' ? !coordinatorSetupDraft.cliEnabled : !coordinatorSetupDraft.apiEnabled;
                  const selected = coordinatorSetupDraft.preferredConnection === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      disabled={disabled}
                      onClick={() => setCoordinatorSetupField({ preferredConnection: option.value })}
                      className={`rounded-2xl border p-3 text-left transition ${
                        disabled
                          ? 'cursor-not-allowed border-white/5 bg-white/[0.03] text-slate-500'
                          : selected
                            ? 'border-cyan-400/40 bg-cyan-400/10 text-cyan-50'
                            : 'border-white/10 bg-white/5 text-slate-200 hover:bg-white/10'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="font-semibold">{option.title}</div>
                          <div className="mt-1 text-xs text-slate-400">{option.description}</div>
                        </div>
                        {selected ? <Pill tone="accent">default</Pill> : null}
                      </div>
                    </button>
                  );
                })}
              </div>
              <div className="mt-4 rounded-2xl border border-white/10 bg-slate-950/40 px-3 py-2 text-sm text-white">
                Current runtime after onboarding: {coordinatorSetupDraft.preferredConnection === 'api'
                  ? `Cloud / API · ${coordinatorSetupDraft.apiEnabled ? coordinatorSetupDraft.apiProvider : 'not enabled yet'}`
                  : `Local CLI · ${runtimeVendorLabels[coordinatorSetupDraft.cliVendor]}`}
              </div>
              <p className="mt-3 text-xs text-slate-400">
                “Managed worker bridge” means a worker-managed runtime path. It stays available later, but we keep onboarding focused on the two clear starting modes: local CLI and cloud API.
              </p>
            </Panel>
          </div>
        </div>
      ) : null}
    </Panel>
  );

  const renderWorkspaceStep = () => (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
        <Panel>
          <SectionHeading title="Workspace mode" subtitle="Choose where the project files live first" />
          <div className="grid gap-3">
            {([
              {
                mode: 'local' as const,
                title: 'Local workspace',
                description: 'Use a folder on this machine. Best when you want local models, local repos, or offline work.'
              },
              {
                mode: 'remote' as const,
                title: 'Remote workspace',
                description: 'Keep the project managed remotely for now. You can connect a local folder later.'
              }
            ]).map((option) => {
              const selected = workspaceModeDraft === option.mode;
              return (
                <button
                  key={option.mode}
                  type="button"
                  onClick={() => setWorkspaceModeDraft(option.mode)}
                  className={`rounded-2xl border p-3 text-left transition ${
                    selected
                      ? 'border-cyan-400/40 bg-cyan-400/10 text-cyan-50'
                      : 'border-white/10 bg-white/5 text-slate-200 hover:bg-white/10'
                  }`}
                >
                  <div className="font-semibold">{option.title}</div>
                  <div className="mt-1 text-xs text-slate-400">{option.description}</div>
                </button>
              );
            })}
          </div>
          <p className="mt-3 text-xs text-slate-400">
            Local/remote sync is a valid next step, but it is not configured in this onboarding yet. For now choose the primary workspace mode.
          </p>
        </Panel>
        {workspaceModeDraft === 'local' ? (
          <WorkspaceBrowserPicker
            value={selectedWorkspacePath || undefined}
            onChange={(path) => setWorkspacePathDraft(path ?? '')}
            title="Browse workspace folders"
            subtitle="Pick a project folder from the server-approved roots"
          />
        ) : (
          <Panel>
            <SectionHeading title="Remote workspace" subtitle="No local folder is required right now" />
            <p className="text-sm text-slate-300">
              This project will start as remote-managed. You can connect a local folder later if you want local models, local repos, or a sync workflow.
            </p>
          </Panel>
        )}
      </div>
      <Panel>
        <SectionHeading title="Workspace selection" subtitle="Current selection" />
        <p className="text-sm text-slate-300">
          {workspaceModeDraft === 'local' ? selectedWorkspacePath || 'No folder selected yet.' : 'Remote workspace selected.'}
        </p>
      </Panel>
      <Panel>
        <SectionHeading
          title="Local wrapper"
          subtitle="Machine, folder, and preview"
          action={
            <Button variant="secondary" onClick={() => void loadLocalWrapper()}>
              {localWrapperLoading ? 'Refreshing...' : 'Refresh'}
            </Button>
          }
        />
        {localWrapperError ? <p className="text-sm text-[color:var(--bad)]">{localWrapperError}</p> : null}
        {localWrapperNotice ? <p className="text-sm text-emerald-300">{localWrapperNotice}</p> : null}
        <div className="project-home-summary-grid project-home-summary-grid-compact">
          <div className="project-home-summary-card">
            <span className="label">Local machine</span>
            <strong>{localWrapperSignals.machineAttached ? resolveLocalMachineLabel(localHost) : 'Not attached'}</strong>
            <span>{localWrapperSignals.machineLabel}</span>
          </div>
          <div className="project-home-summary-card">
            <span className="label">Local folder</span>
            <strong>{localWrapperSignals.folderAttached ? 'Attached' : 'Not attached'}</strong>
            <span>{selectedWorkspacePath || 'No folder selected yet'}</span>
          </div>
          <div className="project-home-summary-card">
            <span className="label">Local preview</span>
            <strong>{localWrapperSignals.previewAvailable ? 'Available' : 'Unavailable'}</strong>
            <span>{localWrapperSignals.previewHref ?? (appTargetDraft.previewPort ? `Port ${appTargetDraft.previewPort}` : 'No preview URL or port configured')}</span>
          </div>
        </div>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <label className="space-y-1">
            <div className="label">App target name</div>
            <input
              className="cp-input"
              value={appTargetDraft.name}
              onChange={(event) => setAppTargetDraft((current) => ({ ...current, name: event.target.value }))}
              placeholder="Main app target"
            />
          </label>
          <label className="space-y-1">
            <div className="label">Preview URL</div>
            <input
              className="cp-input"
              value={appTargetDraft.previewUrl}
              onChange={(event) => setAppTargetDraft((current) => ({ ...current, previewUrl: event.target.value }))}
              placeholder="http://localhost:5173"
            />
          </label>
          <label className="space-y-1">
            <div className="label">Run command</div>
            <input
              className="cp-input"
              value={appTargetDraft.runCommand}
              onChange={(event) => setAppTargetDraft((current) => ({ ...current, runCommand: event.target.value }))}
              placeholder="pnpm dev"
            />
          </label>
          <label className="space-y-1">
            <div className="label">Preview port</div>
            <input
              className="cp-input"
              value={appTargetDraft.previewPort}
              onChange={(event) => setAppTargetDraft((current) => ({ ...current, previewPort: event.target.value }))}
              placeholder="5173"
            />
          </label>
          <label className="space-y-1">
            <div className="label">Test command</div>
            <input
              className="cp-input"
              value={appTargetDraft.testCommand}
              onChange={(event) => setAppTargetDraft((current) => ({ ...current, testCommand: event.target.value }))}
              placeholder="pnpm test"
            />
          </label>
          <label className="space-y-1">
            <div className="label">Dev command</div>
            <input
              className="cp-input"
              value={appTargetDraft.devCommand}
              onChange={(event) => setAppTargetDraft((current) => ({ ...current, devCommand: event.target.value }))}
              placeholder="pnpm dev"
            />
          </label>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => void saveAppTarget()} disabled={localWrapperSaving}>
            {localWrapperSaving ? 'Saving...' : 'Save app target'}
          </Button>
          <Button variant="primary" onClick={() => void runAppTargetAction('run')} disabled={localWrapperSaving}>
            {localWrapperAction === 'run' ? 'Running...' : 'Run'}
          </Button>
          <Button variant="secondary" onClick={() => void runAppTargetAction('test')} disabled={localWrapperSaving}>
            {localWrapperAction === 'test' ? 'Testing...' : 'Test'}
          </Button>
          <Button variant="secondary" onClick={() => void runAppTargetAction('dev')} disabled={localWrapperSaving}>
            {localWrapperAction === 'dev' ? 'Starting dev...' : 'Dev'}
          </Button>
        </div>
        <div className="mt-3 flex flex-wrap gap-2 text-xs text-[color:var(--muted)]">
          <Pill tone={localWrapperSignals.machineAttached ? 'good' : 'warn'}>{localWrapperSignals.machineLabel}</Pill>
          <Pill tone={localWrapperSignals.folderAttached ? 'good' : 'warn'}>{localWrapperSignals.folderLabel}</Pill>
          <Pill tone={localWrapperSignals.previewAvailable ? 'good' : 'warn'}>{localWrapperSignals.previewLabel}</Pill>
          <Pill tone="default">{describeAppTarget(appTargetDraft)}</Pill>
          {localWrapperReady ? <Pill tone="good">ready</Pill> : <Pill tone="warn">not ready</Pill>}
        </div>
        <p className="mt-3 text-xs text-slate-400">
          {describeLocalWrapperStatus(localHost, selectedWorkspacePath, appTargetDraft)}
        </p>
      </Panel>
    </div>
  );

  const renderHeartbeatStep = () => (
    <div className="space-y-4">
      <HeartbeatPolicyEditor
        value={projectRuntimeDraft.heartbeatPolicy ?? buildHeartbeatPolicy()}
        onChange={(heartbeatPolicy) => setProjectRuntimeField({ heartbeatPolicy })}
        title="Project checks"
        subtitle="Keep onboarding light: choose a simple cadence for project checks"
        showEnabledToggle={false}
        showSummary={false}
      />
      <Panel>
        <SectionHeading
          title="Try one check now"
          subtitle="Optional: trigger a project check once to verify the path is healthy"
          action={
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" onClick={() => void runProjectHeartbeat()} disabled={runningHeartbeat}>
                {runningHeartbeat ? 'Running...' : 'Run now'}
              </Button>
            </div>
          }
        />
        <p className="text-sm text-slate-300">
          The detailed status panel stays in the project workspace. During onboarding you only need the cadence and an optional manual test.
        </p>
      </Panel>
    </div>
  );

  const renderReviewStep = () => (
    <div className="space-y-4">
      <RuntimeProfileSummary
        title="Primary agent runtime"
        subtitle="Current runtime on the selected primary agent"
        profile={selectedPrimaryAgentRuntime ?? null}
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
        <p className="text-sm text-slate-300">
          {workspaceModeDraft === 'local' ? selectedWorkspacePath || 'No workspace folder selected.' : 'Remote workspace selected.'}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Pill tone="default">mode {workspaceModeDraft}</Pill>
          <Pill tone="default">primary agent {selectedPrimaryAgent?.name ?? 'unselected'}</Pill>
        </div>
      </Panel>
      <Panel>
        <SectionHeading title="Agent runtime" subtitle="Current primary-agent setup" />
        <p className="text-sm text-slate-300">
          {selectedPrimaryAgentRuntime ? describeRuntimeProfile(selectedPrimaryAgentRuntime) : 'No primary agent selected yet.'}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Pill tone={coordinatorSetupDraft.cliEnabled ? 'good' : 'default'}>
            local CLI {coordinatorSetupDraft.cliEnabled ? runtimeVendorLabels[coordinatorSetupDraft.cliVendor] : 'off'}
          </Pill>
          <Pill tone={coordinatorSetupDraft.apiEnabled ? 'good' : 'default'}>
            cloud API {coordinatorSetupDraft.apiEnabled ? coordinatorSetupDraft.apiProvider : 'off'}
          </Pill>
          <Pill tone="accent">default {coordinatorSetupDraft.preferredConnection === 'api' ? 'cloud / API' : 'local CLI'}</Pill>
        </div>
        <p className="mt-3 text-xs text-slate-400">
          Projects can mix local CLI agents and cloud/API agents later. This onboarding only guarantees the first coordinator starts with a clear default path and a usable initial connection.
        </p>
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
    <div className="project-onboarding-modal-host">
      <div className="project-onboarding-modal-backdrop" aria-hidden />
      <section className="project-onboarding-modal" role="dialog" aria-modal="true" aria-label="Project onboarding wizard">
        <Panel className="project-onboarding-modal-panel">
          <SectionHeading
            title={`Project onboarding · ${currentProject?.name ?? projectId}`}
            subtitle="Guided setup wizard"
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
                  Exit setup
                </Link>
              </div>
            }
          />
          <ProgressBar value={((activeStep + 1) / wizardSteps.length) * 100} />
          <div className="project-onboarding-step-grid">
            {wizardSteps.map((step, index) => (
              <button
                key={step.key}
                type="button"
                onClick={() => setActiveStep(index)}
                className={`project-onboarding-step-chip ${
                  index === activeStep
                    ? 'project-onboarding-step-chip-active'
                    : ''
                }`}
              >
                <span className="project-onboarding-step-index">{index + 1}</span>
                <span>{step.title}</span>
              </button>
            ))}
          </div>
          {error ? <p className="mt-3 text-sm text-rose-300">{error}</p> : null}
          {notice ? <p className="mt-3 text-sm text-emerald-300">{notice}</p> : null}
          {auth.enabled && auth.required ? <p className="mt-3 text-sm text-slate-300">Authentication is required for onboarding.</p> : null}
        </Panel>

        <div className="project-onboarding-modal-scroll">
          {activeStep === 0 ? renderBasicsStep() : null}
          {activeStep === 1 ? renderPrimaryAgentStep() : null}
          {activeStep === 2 ? renderWorkspaceStep() : null}
          {activeStep === 3 ? renderHeartbeatStep() : null}
          {activeStep === 4 ? renderReviewStep() : null}
        </div>

        <Panel className="project-onboarding-modal-panel">
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
      </section>
    </div>
  );
}
