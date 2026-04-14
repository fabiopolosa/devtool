import React, { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useState } from 'react';
import {
  approvals as initialApprovals,
  artifacts as initialArtifacts,
  experimentRuns as initialExperimentRuns,
  experiments as initialExperiments,
  memoryChunks as initialMemoryChunks,
  memoryEntries as initialMemoryEntries,
  messages as initialMessages,
  providerCapabilities as initialProviderCapabilities,
  providerHealthchecks as initialProviderHealthchecks,
  providerModels as initialProviderModels,
  providers as initialProviders,
  projectBindings as initialProjectBindings,
  projectRepositoryLinks as initialProjectRepositoryLinks,
  projects as initialProjects,
  promptVersions as initialPromptVersions,
  repositories as initialRepositories,
  researchNotes as initialResearchNotes,
  retrievalLogs as initialRetrievalLogs,
  roadmapItems as initialRoadmapItems,
  routingRules as initialRoutingRules,
  taskRuns as initialTaskRuns,
  tasks as initialTasks,
  threads as initialThreads,
  verificationResults as initialVerificationResults,
  verificationSteps as initialVerificationSteps
} from '@/data/mock';
import type {
  Approval,
  Artifact,
  AutoResearchExperiment,
  AutoResearchRun,
  ChatMessage,
  ChatThread,
  MemoryChunk,
  MemoryEntry,
  ProviderCapability,
  ProviderConfig,
  ProviderHealthcheck,
  ProviderModel,
  Project,
  ProjectProviderBinding,
  ProjectRepositoryLink,
  PromptVersion,
  Repository,
  ResearchNote,
  RetrievalQueryLog,
  RoadmapItem,
  RoutingRule,
  Task,
  TaskRun,
  VerificationResult,
  VerificationStep
} from '@cp/domain';

export type AppState = {
  projects: Project[];
  repositories: Repository[];
  projectRepositoryLinks: ProjectRepositoryLink[];
  roadmapItems: RoadmapItem[];
  tasks: Task[];
  taskRuns: TaskRun[];
  approvals: Approval[];
  artifacts: Artifact[];
  verificationResults: VerificationResult[];
  verificationSteps: VerificationStep[];
  memoryEntries: MemoryEntry[];
  memoryChunks: MemoryChunk[];
  retrievalLogs: RetrievalQueryLog[];
  researchNotes: ResearchNote[];
  promptVersions: PromptVersion[];
  routingRules: RoutingRule[];
  experiments: AutoResearchExperiment[];
  experimentRuns: AutoResearchRun[];
  threads: ChatThread[];
  messages: ChatMessage[];
  providers: ProviderConfig[];
  providerCapabilities: ProviderCapability[];
  providerModels: ProviderModel[];
  projectBindings: ProjectProviderBinding[];
  providerHealthchecks: ProviderHealthcheck[];
  taskSpecSkills: Record<string, string[]>;
};

export interface AuthPrincipal {
  userId: string;
  email: string;
  displayName: string;
  roles: string[];
  permissions: string[];
  authBypass: boolean;
}

export interface AuthState {
  enabled: boolean;
  loading: boolean;
  required: boolean;
  token: string | undefined;
  refreshToken: string | undefined;
  principal: AuthPrincipal | undefined;
  error: string | undefined;
}

const sessionStorageKey = 'cp_auth_session_token';
const refreshStorageKey = 'cp_auth_refresh_token';

const parseFlag = (value: string | undefined, defaultValue: boolean): boolean => {
  if (value === undefined) return defaultValue;
  const normalized = value.trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes';
};

const authEnabledFromEnv = (): boolean => parseFlag(import.meta.env.VITE_AUTH_ENABLED, false);
const apiBaseUrlFromEnv = (): string => (import.meta.env.VITE_API_BASE_URL ?? '').trim().replace(/\/$/, '');

type Action =
  | { type: 'approveRoadmap'; roadmapItemId: string }
  | { type: 'rejectRoadmap'; roadmapItemId: string }
  | { type: 'advanceTask'; taskId: string }
  | { type: 'advanceRun'; runId: string }
  | { type: 'reorderRoadmap'; roadmapItemId: string; direction: 'up' | 'down' }
  | { type: 'splitRoadmap'; roadmapItemId: string }
  | { type: 'mergeRoadmap'; roadmapItemId: string; targetRoadmapId: string }
  | { type: 'addMessage'; threadId: string; content: string }
  | { type: 'createProject'; name: string; description: string }
  | { type: 'linkRepository'; projectId: string; repositoryId: string }
  | { type: 'proposeRoadmapFromChat'; projectId: string; content: string }
  | { type: 'convertRoadmapToTask'; roadmapItemId: string }
  | { type: 'setTaskSkills'; taskId: string; skills: string[] };

const initialState: AppState = {
  projects: initialProjects,
  repositories: initialRepositories,
  projectRepositoryLinks: initialProjectRepositoryLinks,
  roadmapItems: initialRoadmapItems,
  tasks: initialTasks,
  taskRuns: initialTaskRuns,
  approvals: initialApprovals,
  artifacts: initialArtifacts,
  verificationResults: initialVerificationResults,
  verificationSteps: initialVerificationSteps,
  memoryEntries: initialMemoryEntries,
  memoryChunks: initialMemoryChunks,
  retrievalLogs: initialRetrievalLogs,
  researchNotes: initialResearchNotes,
  promptVersions: initialPromptVersions,
  routingRules: initialRoutingRules,
  experiments: initialExperiments,
  experimentRuns: initialExperimentRuns,
  threads: initialThreads,
  messages: initialMessages,
  providers: initialProviders,
  providerCapabilities: initialProviderCapabilities,
  providerModels: initialProviderModels,
  projectBindings: initialProjectBindings,
  providerHealthchecks: initialProviderHealthchecks,
  taskSpecSkills: {}
};

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'approveRoadmap':
      return {
        ...state,
        roadmapItems: state.roadmapItems.map((item) =>
          item.id === action.roadmapItemId ? { ...item, state: 'approved' } : item
        ),
        approvals: state.approvals.map((approval) =>
          approval.subjectId === action.roadmapItemId ? { ...approval, status: 'approved', decidedBy: 'you', decidedAt: new Date().toISOString() } : approval
        )
      };
    case 'rejectRoadmap':
      return {
        ...state,
        roadmapItems: state.roadmapItems.map((item) =>
          item.id === action.roadmapItemId ? { ...item, state: 'rejected' } : item
        ),
        approvals: state.approvals.map((approval) =>
          approval.subjectId === action.roadmapItemId ? { ...approval, status: 'rejected', decidedBy: 'you', decidedAt: new Date().toISOString() } : approval
        )
      };
    case 'advanceTask':
      return {
        ...state,
        tasks: state.tasks.map((task) =>
          task.id === action.taskId ? { ...task, state: nextTaskState(task.state) } : task
        )
      };
    case 'advanceRun':
      return {
        ...state,
        taskRuns: state.taskRuns.map((run) =>
          run.id === action.runId ? { ...run, status: nextRunStatus(run.status) } : run
        )
      };
    case 'reorderRoadmap': {
      const items = [...state.roadmapItems];
      const idx = items.findIndex((item) => item.id === action.roadmapItemId);
      if (idx < 0) return state;
      const swap = action.direction === 'up' ? idx - 1 : idx + 1;
      if (swap < 0 || swap >= items.length) return state;
      const current = items[idx];
      const target = items[swap];
      if (!current || !target) return state;
      items[idx] = target;
      items[swap] = current;
      return {
        ...state,
        roadmapItems: items.map((item, index) => ({ ...item, orderIndex: index + 1 }))
      };
    }
    case 'splitRoadmap': {
      const source = state.roadmapItems.find((item) => item.id === action.roadmapItemId);
      if (!source) return state;
      const newItem: RoadmapItem = {
        ...source,
        id: `${source.id}-split`,
        title: `${source.title} (split)`,
        description: `${source.description} Split from ${source.id}.`,
        state: 'proposed',
        orderIndex: source.orderIndex + 1,
        updatedAt: new Date().toISOString()
      };
      return {
        ...state,
        roadmapItems: [...state.roadmapItems, newItem]
      };
    }
    case 'mergeRoadmap':
      return {
        ...state,
        roadmapItems: state.roadmapItems.filter((item) => item.id !== action.roadmapItemId)
      };
    case 'addMessage': {
      const nextMessage: ChatMessage = {
        ...state.messages[0],
        id: `msg-${state.messages.length + 1}`,
        threadId: action.threadId,
        role: 'user',
        content: action.content,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        createdBy: 'you',
        updatedBy: 'you'
      };
      return { ...state, messages: [...state.messages, nextMessage] };
    }
    case 'createProject': {
      const now = new Date().toISOString();
      const project: Project = {
        ...(state.projects[0] ?? {
          createdAt: now,
          createdBy: 'you',
          updatedAt: now,
          updatedBy: 'you'
        }),
        id: `proj-${state.projects.length + 1}`,
        key: action.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
        name: action.name,
        description: action.description,
        status: 'active',
        policySetId: 'policy-main',
        createdAt: now,
        createdBy: 'you',
        updatedAt: now,
        updatedBy: 'you'
      };
      return { ...state, projects: [...state.projects, project] };
    }
    case 'linkRepository': {
      const now = new Date().toISOString();
      const link: ProjectRepositoryLink = {
        ...(state.projectRepositoryLinks[0] ?? {
          createdAt: now,
          createdBy: 'you',
          updatedAt: now,
          updatedBy: 'you'
        }),
        id: `prl-${state.projectRepositoryLinks.length + 1}`,
        projectId: action.projectId,
        repositoryId: action.repositoryId,
        role: 'secondary',
        rulesRef: 'routing-policy:v1',
        createdAt: now,
        createdBy: 'you',
        updatedAt: now,
        updatedBy: 'you'
      };
      return { ...state, projectRepositoryLinks: [...state.projectRepositoryLinks, link] };
    }
    case 'proposeRoadmapFromChat': {
      const now = new Date().toISOString();
      const nextRoadmap: RoadmapItem = {
        ...(state.roadmapItems[0] ?? {
          createdAt: now,
          createdBy: 'planner',
          updatedAt: now,
          updatedBy: 'planner'
        }),
        id: `rm-${state.roadmapItems.length + 1}`,
        projectId: action.projectId,
        title: `Proposal from chat #${state.roadmapItems.length + 1}`,
        description: action.content,
        state: 'proposed',
        priority: 60,
        orderIndex: state.roadmapItems.length + 1,
        createdAt: now,
        createdBy: 'planner',
        updatedAt: now,
        updatedBy: 'planner'
      };
      const nextApproval: Approval = {
        ...(state.approvals[0] ?? {
          createdAt: now,
          createdBy: 'planner',
          updatedAt: now,
          updatedBy: 'planner'
        }),
        id: `app-${state.approvals.length + 1}`,
        subjectType: 'roadmap_item',
        subjectId: nextRoadmap.id,
        status: 'pending',
        requestedBy: 'planner',
        reason: 'Generated from chat intent',
        createdAt: now,
        createdBy: 'planner',
        updatedAt: now,
        updatedBy: 'planner'
      };
      return {
        ...state,
        roadmapItems: [...state.roadmapItems, nextRoadmap],
        approvals: [...state.approvals, nextApproval]
      };
    }
    case 'convertRoadmapToTask': {
      const item = state.roadmapItems.find((roadmap) => roadmap.id === action.roadmapItemId);
      if (!item) return state;
      const now = new Date().toISOString();
      const nextTask: Task = {
        ...(state.tasks[0] ?? {
          createdAt: now,
          createdBy: 'planner',
          updatedAt: now,
          updatedBy: 'planner'
        }),
        id: `task-${state.tasks.length + 1}`,
        projectId: item.projectId,
        roadmapItemId: item.id,
        title: item.title,
        type: 'feature',
        state: 'proposed',
        goal: item.description,
        scopeInclude: ['implementation'],
        scopeExclude: [],
        constraints: ['Keep contract compatibility'],
        targetRepositoryIds: state.repositories.slice(0, 1).map((repo) => repo.id),
        successCriteria: ['Verification passes'],
        verificationPlan: ['lint', 'test', 'build'],
        dependencyTaskIds: [],
        riskNotes: [],
        budget: { maxRetries: 1 },
        approvalsRequired: true,
        createdAt: now,
        createdBy: 'planner',
        updatedAt: now,
        updatedBy: 'planner'
      };
      return {
        ...state,
        roadmapItems: state.roadmapItems.map((roadmap) =>
          roadmap.id === action.roadmapItemId
            ? { ...roadmap, state: 'converted', convertedTaskId: nextTask.id, updatedAt: now }
            : roadmap
        ),
        tasks: [...state.tasks, nextTask],
        taskSpecSkills: {
          ...state.taskSpecSkills,
          [nextTask.id]: []
        }
      };
    }
    case 'setTaskSkills':
      return {
        ...state,
        taskSpecSkills: {
          ...state.taskSpecSkills,
          [action.taskId]: [...action.skills]
        }
      };
    default:
      return state;
  }
}

function nextTaskState(state: Task['state']): Task['state'] {
  switch (state) {
    case 'draft': return 'proposed';
    case 'proposed': return 'approved';
    case 'approved': return 'queued';
    case 'queued': return 'running';
    case 'running': return 'verification_failed';
    case 'verification_failed': return 'waiting_for_debug';
    case 'waiting_for_debug': return 'running';
    case 'waiting_for_research': return 'running';
    case 'waiting_for_approval': return 'approved';
    case 'completed': return 'archived';
    case 'archived': return 'archived';
    case 'canceled': return 'canceled';
    default: return state;
  }
}

function nextRunStatus(status: TaskRun['status']): TaskRun['status'] {
  switch (status) {
    case 'queued': return 'running';
    case 'running': return 'waiting';
    case 'waiting': return 'completed';
    case 'failed': return 'queued';
    case 'completed': return 'completed';
    case 'canceled': return 'canceled';
    default: return status;
  }
}

const AppStoreContext = createContext<{
  state: AppState;
  dispatch: React.Dispatch<Action>;
  auth: AuthState;
  authActions: {
    login: (email: string, password: string) => Promise<{ ok: boolean; error?: string }>;
    completeOidcCallback: (code: string, state: string) => Promise<{ ok: boolean; error?: string }>;
    logout: () => Promise<void>;
    clearError: () => void;
    apiFetch: (path: string, init?: RequestInit) => Promise<Response>;
  };
} | null>(null);

export function AppStoreProvider({
  children,
  authEnabledOverride
}: {
  children: React.ReactNode;
  authEnabledOverride?: boolean;
}) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const [auth, setAuth] = useState<AuthState>({
    enabled: authEnabledOverride ?? authEnabledFromEnv(),
    loading: authEnabledOverride ?? authEnabledFromEnv(),
    required: authEnabledOverride ?? authEnabledFromEnv(),
    token: undefined,
    refreshToken: undefined,
    principal: undefined,
    error: undefined
  });

  const apiBaseUrl = useMemo(() => apiBaseUrlFromEnv(), []);

  const toUrl = useCallback(
    (path: string): string => {
      if (path.startsWith('http://') || path.startsWith('https://')) {
        return path;
      }
      return `${apiBaseUrl}${path}`;
    },
    [apiBaseUrl]
  );

  const setSessionToken = (token?: string): void => {
    if (typeof window === 'undefined') return;
    if (!token) {
      window.localStorage.removeItem(sessionStorageKey);
      return;
    }
    window.localStorage.setItem(sessionStorageKey, token);
  };

  const getSessionToken = (): string | undefined => {
    if (typeof window === 'undefined') return undefined;
    const token = window.localStorage.getItem(sessionStorageKey);
    return token ?? undefined;
  };

  const setRefreshToken = (token?: string): void => {
    if (typeof window === 'undefined') return;
    if (!token) {
      window.localStorage.removeItem(refreshStorageKey);
      return;
    }
    window.localStorage.setItem(refreshStorageKey, token);
  };

  const getRefreshToken = (): string | undefined => {
    if (typeof window === 'undefined') return undefined;
    const token = window.localStorage.getItem(refreshStorageKey);
    return token ?? undefined;
  };

  const refreshAccessSession = useCallback(async (): Promise<boolean> => {
    if (!auth.enabled) return false;
    const refreshToken = auth.refreshToken ?? getRefreshToken();
    if (!refreshToken) return false;

    try {
      const response = await fetch(toUrl('/auth/refresh'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken })
      });

      const body = (await response.json()) as {
        item?: {
          token: string;
          refreshToken: string;
          user: { id: string; email: string; displayName: string };
          roles: string[];
          permissions: string[];
        };
      };

      if (!response.ok || !body.item?.token || !body.item.refreshToken) {
        setSessionToken(undefined);
        setRefreshToken(undefined);
        setAuth((current) => ({
          ...current,
          loading: false,
          required: true,
          token: undefined,
          refreshToken: undefined,
          principal: undefined,
          error: 'Session expired. Please log in again.'
        }));
        return false;
      }

      const sessionItem = body.item;
      setSessionToken(sessionItem.token);
      setRefreshToken(sessionItem.refreshToken);
      setAuth((current) => ({
        ...current,
        loading: false,
        required: false,
        token: sessionItem.token,
        refreshToken: sessionItem.refreshToken,
        principal: {
          userId: sessionItem.user.id,
          email: sessionItem.user.email,
          displayName: sessionItem.user.displayName,
          roles: sessionItem.roles,
          permissions: sessionItem.permissions,
          authBypass: false
        },
        error: undefined
      }));
      return true;
    } catch {
      setSessionToken(undefined);
      setRefreshToken(undefined);
      setAuth((current) => ({
        ...current,
        loading: false,
        required: true,
        token: undefined,
        refreshToken: undefined,
        principal: undefined,
        error: 'Unable to refresh session. Please log in again.'
      }));
      return false;
    }
  }, [auth.enabled, auth.refreshToken, toUrl]);

  const apiFetch = useCallback(
    async (path: string, init: RequestInit = {}): Promise<Response> => {
      const makeHeaders = (token?: string): Headers => {
        const headers = new Headers(init.headers ?? {});
        if (token) {
          headers.set('Authorization', `Bearer ${token}`);
        }
        if (init.body && !headers.has('Content-Type')) {
          headers.set('Content-Type', 'application/json');
        }
        return headers;
      };

      const firstToken = auth.token ?? getSessionToken();
      let response = await fetch(toUrl(path), {
        ...init,
        headers: makeHeaders(firstToken)
      });

      if (auth.enabled && response.status === 401) {
        const refreshed = await refreshAccessSession();
        if (refreshed) {
          const retriedToken = getSessionToken();
          response = await fetch(toUrl(path), {
            ...init,
            headers: makeHeaders(retriedToken)
          });
        }
      }

      if (auth.enabled && (response.status === 401 || response.status === 403)) {
        if (response.status === 401) {
          setSessionToken(undefined);
          setRefreshToken(undefined);
        }
        setAuth((current) => ({
          ...current,
          loading: false,
          required: true,
          token: response.status === 401 ? undefined : current.token,
          refreshToken: response.status === 401 ? undefined : current.refreshToken,
          principal: response.status === 401 ? undefined : current.principal,
          error:
            response.status === 401
              ? 'Session missing or expired. Please log in.'
              : 'You are authenticated but do not have permission for this action.'
        }));
      }

      return response;
    },
    [auth.enabled, auth.token, refreshAccessSession, toUrl]
  );

  const bootstrapSession = useCallback(async () => {
    if (!auth.enabled) {
      setAuth((current) => ({ ...current, loading: false, required: false, refreshToken: undefined }));
      return;
    }

    const token = getSessionToken();
    const refreshToken = getRefreshToken();
    if (!token) {
      if (refreshToken) {
        const refreshed = await refreshAccessSession();
        if (refreshed) return;
      }
      setAuth((current) => ({
        ...current,
        loading: false,
        required: true,
        token: undefined,
        refreshToken: refreshToken ?? undefined,
        principal: undefined
      }));
      return;
    }

    try {
      const response = await fetch(toUrl('/auth/me'), {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!response.ok) {
        if (refreshToken) {
          const refreshed = await refreshAccessSession();
          if (refreshed) return;
        }
        setSessionToken(undefined);
        setRefreshToken(undefined);
        setAuth((current) => ({
          ...current,
          loading: false,
          required: true,
          token: undefined,
          refreshToken: undefined,
          principal: undefined
        }));
        return;
      }

      const body = (await response.json()) as {
        item?: {
          userId: string;
          email: string;
          displayName: string;
          roles: string[];
          permissions: string[];
          authBypass: boolean;
        };
      };

      if (!body.item) {
        setSessionToken(undefined);
        setRefreshToken(undefined);
        setAuth((current) => ({
          ...current,
          loading: false,
          required: true,
          token: undefined,
          refreshToken: undefined,
          principal: undefined
        }));
        return;
      }

      const meItem = body.item;
      setAuth((current) => ({
        ...current,
        loading: false,
        required: false,
        token,
        refreshToken: refreshToken ?? undefined,
        principal: {
          userId: meItem.userId,
          email: meItem.email,
          displayName: meItem.displayName,
          roles: meItem.roles,
          permissions: meItem.permissions,
          authBypass: meItem.authBypass
        },
        error: undefined
      }));
    } catch (error) {
      setSessionToken(undefined);
      setRefreshToken(undefined);
      setAuth((current) => ({
        ...current,
        loading: false,
        required: true,
        token: undefined,
        refreshToken: undefined,
        principal: undefined,
        error: error instanceof Error ? error.message : 'Unable to resolve active session'
      }));
    }
  }, [auth.enabled, refreshAccessSession, toUrl]);

  useEffect(() => {
    void bootstrapSession();
  }, [bootstrapSession]);

  const login = useCallback(
    async (email: string, password: string): Promise<{ ok: boolean; error?: string }> => {
      if (!auth.enabled) {
        return { ok: true };
      }

      setAuth((current) => ({ ...current, loading: true, error: undefined }));

      try {
        const response = await fetch(toUrl('/auth/login'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password })
        });

        const body = (await response.json()) as {
          item?: {
            token: string;
            refreshToken?: string;
            user: { id: string; email: string; displayName: string };
            roles: string[];
            permissions: string[];
          };
          message?: string;
        };

        if (!response.ok || !body.item?.token) {
          const errorMessage = body.message ?? 'Invalid credentials';
          setAuth((current) => ({
            ...current,
            loading: false,
            required: true,
            error: errorMessage
          }));
          return { ok: false, error: errorMessage };
        }

        const loginItem = body.item;
        setSessionToken(loginItem.token);
        setRefreshToken(loginItem.refreshToken);
        setAuth((current) => ({
          ...current,
          loading: false,
          required: false,
          token: loginItem.token,
          refreshToken: loginItem.refreshToken,
          principal: {
            userId: loginItem.user.id,
            email: loginItem.user.email,
            displayName: loginItem.user.displayName,
            roles: loginItem.roles,
            permissions: loginItem.permissions,
            authBypass: false
          },
          error: undefined
        }));
        return { ok: true };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Login request failed';
        setAuth((current) => ({
          ...current,
          loading: false,
          required: true,
          error: message
        }));
        return { ok: false, error: message };
      }
    },
    [auth.enabled, toUrl]
  );

  const completeOidcCallback = useCallback(
    async (code: string, state: string): Promise<{ ok: boolean; error?: string }> => {
      if (!auth.enabled) {
        return { ok: true };
      }

      setAuth((current) => ({ ...current, loading: true, error: undefined }));
      try {
        const response = await fetch(toUrl(`/auth/oidc/callback?code=${encodeURIComponent(code)}&state=${encodeURIComponent(state)}`), {
          method: 'GET'
        });

        const body = (await response.json()) as {
          item?: {
            token: string;
            refreshToken?: string;
            user: { id: string; email: string; displayName: string };
            roles: string[];
            permissions: string[];
          };
          message?: string;
        };

        if (!response.ok || !body.item?.token) {
          const errorMessage = body.message ?? 'OIDC authentication failed';
          setAuth((current) => ({
            ...current,
            loading: false,
            required: true,
            error: errorMessage
          }));
          return { ok: false, error: errorMessage };
        }

        const item = body.item;
        setSessionToken(item.token);
        setRefreshToken(item.refreshToken);
        setAuth((current) => ({
          ...current,
          loading: false,
          required: false,
          token: item.token,
          refreshToken: item.refreshToken,
          principal: {
            userId: item.user.id,
            email: item.user.email,
            displayName: item.user.displayName,
            roles: item.roles,
            permissions: item.permissions,
            authBypass: false
          },
          error: undefined
        }));

        return { ok: true };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'OIDC callback failed';
        setAuth((current) => ({
          ...current,
          loading: false,
          required: true,
          error: message
        }));
        return { ok: false, error: message };
      }
    },
    [auth.enabled, toUrl]
  );

  const logout = useCallback(async (): Promise<void> => {
    if (!auth.enabled) return;
    const token = auth.token ?? getSessionToken();
    try {
      if (token) {
        await fetch(toUrl('/auth/logout'), {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` }
        });
      }
    } finally {
      setSessionToken(undefined);
      setRefreshToken(undefined);
      setAuth((current) => ({
        ...current,
        loading: false,
        required: true,
        token: undefined,
        refreshToken: undefined,
        principal: undefined
      }));
    }
  }, [auth.enabled, auth.token, toUrl]);

  const clearError = useCallback(() => {
    setAuth((current) => ({ ...current, error: undefined }));
  }, []);

  const value = useMemo(
    () => ({
      state,
      dispatch,
      auth,
      authActions: {
        login,
        completeOidcCallback,
        logout,
        clearError,
        apiFetch
      }
    }),
    [state, auth, login, completeOidcCallback, logout, clearError, apiFetch]
  );

  return <AppStoreContext.Provider value={value}>{children}</AppStoreContext.Provider>;
}

export function useAppStore() {
  const ctx = useContext(AppStoreContext);
  if (!ctx) throw new Error('AppStoreProvider missing');
  return ctx;
}
