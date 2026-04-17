import { Link, Outlet, useMatchRoute, useNavigate, useRouterState } from '@tanstack/react-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Job, Project } from '@cp/domain';
import { Button } from '@/components/common';
import { useAppStore } from '@/store/app-store';
import { getThemeMode, onThemeChange, setThemeMode, toggleThemeMode, type ThemeMode } from '@/theme';

type ShellNavItem = {
  to: string;
  label: string;
  tier?: 'primary' | 'secondary';
  access?: 'project' | 'tenant' | 'system';
  params?: Record<string, string>;
};

type ShellContextMode = 'global' | 'project' | 'platform';

type AgentChatLog = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
};

type JobStage = 'waiting_user' | 'running' | 'done' | 'error' | 'ready' | 'waiting_dependencies';

type OperationModule = {
  id: string;
  label: string;
  to: string;
  params?: Record<string, string>;
  enabled: boolean;
  reason?: string;
};

const resolveJobStage = (job: Job): JobStage => {
  if (job.status === 'waiting_user') return 'waiting_user';
  if (job.status === 'running') return 'running';
  if (job.status === 'done') return 'done';
  if (job.status === 'error') return 'error';
  if (job.status === 'idle' && job.ready) return 'ready';
  return 'waiting_dependencies';
};

const stageRank: Record<JobStage, number> = {
  waiting_user: 0,
  running: 1,
  error: 2,
  ready: 3,
  waiting_dependencies: 4,
  done: 5
};

const projectFromPath = (pathname: string): string | undefined => {
  const segments = pathname.split('/').filter(Boolean);
  if (segments[0] === 'project' && segments[1]) return segments[1];
  return undefined;
};

const routeLabelFromPath = (pathname: string): string => {
  const first = pathname.split('/').filter(Boolean)[0];
  if (!first) return 'Dashboard';
  if (first === 'settings') return 'Platform Settings';
  if (first === 'project') return 'Project Workspace';
  if (first === 'projects') return 'Projects';
  return first
    .split('-')
    .map((item) => item[0]?.toUpperCase() + item.slice(1))
    .join(' ');
};

const toLauncherCode = (project: Project): string => {
  const key = project.key.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  if (key.length >= 2) return key.slice(0, 2);
  const name = project.name.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  if (name.length >= 2) return name.slice(0, 2);
  return (key || name || project.id.slice(0, 2)).toUpperCase();
};

const resolveProjectJobsPollDelay = (input: {
  runnerLikelyActive: boolean;
  consecutiveFailures: number;
}): number => {
  const baseDelay = input.runnerLikelyActive ? 1500 : 5000;
  return Math.min(baseDelay * 2 ** input.consecutiveFailures, 30000);
};

export function AppShell() {
  const { state, auth, authActions } = useAppStore();
  const matchRoute = useMatchRoute();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (routerState) => routerState.location.pathname });
  const [themeMode, setThemeModeState] = useState<ThemeMode>(() => getThemeMode());
  const [chatOpen, setChatOpen] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [chatPending, setChatPending] = useState(false);
  const [chatLogs, setChatLogs] = useState<AgentChatLog[]>([]);
  const [platformMenuOpen, setPlatformMenuOpen] = useState(false);
  const [ownerGuardNotice, setOwnerGuardNotice] = useState<string | undefined>();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [jobsLoading, setJobsLoading] = useState(false);
  const [jobsError, setJobsError] = useState<string | undefined>();
  const isMountedRef = useRef(true);
  const projectJobsPollFailuresRef = useRef(0);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const isLoginRoute = Boolean(matchRoute({ to: '/login' }));
  const userRoleNames = auth.principal?.roles ?? [];
  const userRoleLabel = userRoleNames.length > 0 ? userRoleNames.join(', ') : 'none';
  const userTenantRole = auth.principal?.tenantRole;
  const tenantRoleLabel = userTenantRole ?? 'unknown';
  const hasAuthenticatedSession = !auth.enabled || Boolean(!auth.required && auth.principal);
  const isSystemOwner = !auth.enabled || Boolean(userRoleNames.includes('owner') || userTenantRole === 'owner');
  const isTenantAdmin =
    !auth.enabled
    || isSystemOwner
    || Boolean(userRoleNames.includes('admin') || userTenantRole === 'admin');
  const ownerModeActive = isSystemOwner;
  const canAccessPlatformProjectTier = hasAuthenticatedSession;
  const canAccessPlatformTenantTier = hasAuthenticatedSession && isTenantAdmin;
  const canAccessPlatformSystemTier = hasAuthenticatedSession && isSystemOwner;
  const hasAccessForTier = useCallback(
    (tier: 'project' | 'tenant' | 'system'): boolean => {
      if (tier === 'project') return canAccessPlatformProjectTier;
      if (tier === 'tenant') return canAccessPlatformTenantTier;
      return canAccessPlatformSystemTier;
    },
    [canAccessPlatformProjectTier, canAccessPlatformSystemTier, canAccessPlatformTenantTier]
  );
  const showOwnerModeDebugPanel = import.meta.env.DEV;
  const brandName = ((import.meta.env.VITE_PLATFORM_BRAND as string | undefined) ?? '').trim() || 'DevTools';
  const openApprovals = state.approvals.filter((approval) => approval.status === 'pending').length;
  const runningJobsCount = jobs.filter((job) => resolveJobStage(job) === 'running').length;
  const readyJobsCount = jobs.filter((job) => resolveJobStage(job) === 'ready').length;
  const waitingDependencyJobsCount = jobs.filter((job) => resolveJobStage(job) === 'waiting_dependencies').length;
  const errorJobsCount = jobs.filter((job) => resolveJobStage(job) === 'error').length;
  const attentionJobs = jobs.filter((job) => job.actionRequired).length;
  const runnerLikelyActive = runningJobsCount > 0 || readyJobsCount > 0 || waitingDependencyJobsCount > 0;

  useEffect(() => {
    if (!auth.enabled || auth.loading || !auth.required || isLoginRoute) return;
    void navigate({ to: '/login' });
  }, [auth.enabled, auth.loading, auth.required, isLoginRoute, navigate]);

  useEffect(() => {
    if (!auth.enabled || auth.loading || auth.required || !auth.principal || !isLoginRoute) return;
    void navigate({ to: '/' });
  }, [auth.enabled, auth.loading, auth.principal, auth.required, isLoginRoute, navigate]);

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    console.info('[owner-mode] computed', {
      ownerModeActive,
      canAccessPlatformProjectTier,
      canAccessPlatformTenantTier,
      canAccessPlatformSystemTier,
      authEnabled: auth.enabled,
      authLoading: auth.loading,
      authRequired: auth.required,
      userRoles: userRoleLabel,
      tenantRole: tenantRoleLabel,
      path: pathname
    });
  }, [
    auth.enabled,
    auth.loading,
    auth.required,
    canAccessPlatformProjectTier,
    canAccessPlatformTenantTier,
    canAccessPlatformSystemTier,
    ownerModeActive,
    pathname,
    tenantRoleLabel,
    userRoleLabel
  ]);

  useEffect(() => {
    const requiresTier = (() => {
      if (pathname === '/settings' || pathname === '/agents') return 'project' as const;
      if (pathname === '/providers') return 'tenant' as const;
      if (pathname === '/tenants' || pathname === '/knowledge') return 'tenant' as const;
      if (!pathname.startsWith('/settings/')) return undefined;
      if (
        pathname === '/settings/secrets'
        || pathname === '/settings/integrations'
        || pathname === '/settings/rbac'
        || pathname === '/settings/audit'
        || pathname === '/settings/database'
        || pathname === '/settings/stack'
        || pathname === '/settings/versioning'
      ) {
        return 'system' as const;
      }
      if (
        pathname === '/settings/providers'
        || pathname === '/settings/models'
        || pathname === '/settings/knowledge'
        || pathname === '/settings/pipelines'
        || pathname === '/settings/prompts'
        || pathname === '/settings/users'
        || pathname === '/settings/workers'
        || pathname === '/settings/machines'
        || pathname === '/settings/agents'
        || pathname === '/settings/agents/new'
        || pathname.startsWith('/settings/agents/')
        || pathname === '/settings/skills'
        || pathname === '/settings/tenants'
        || pathname === '/settings/runtime'
        || pathname === '/settings/usage'
        || pathname === '/settings/mcp'
      ) {
        return 'tenant' as const;
      }
      return 'project' as const;
    })();

    if (!requiresTier) return;
    if (auth.enabled && (auth.loading || auth.required)) {
      if (import.meta.env.DEV) {
        console.info('[platform-access] guard deferred until auth session resolves', {
          path: pathname,
          authLoading: auth.loading,
          authRequired: auth.required
        });
      }
      return;
    }
    if (auth.enabled && !auth.required && !auth.principal) {
      if (import.meta.env.DEV) {
        console.info('[platform-access] guard deferred until principal is available', {
          path: pathname
        });
      }
      return;
    }
    if (hasAccessForTier(requiresTier)) {
      setOwnerGuardNotice(undefined);
      return;
    }
    const reason =
      requiresTier === 'system'
        ? `System settings require owner role (tenant role: ${tenantRoleLabel}; user roles: ${userRoleLabel}).`
        : requiresTier === 'tenant'
          ? `Tenant settings require admin/owner role (tenant role: ${tenantRoleLabel}; user roles: ${userRoleLabel}).`
          : 'Sign in to access platform settings.';
    if (import.meta.env.DEV) {
      console.warn('[platform-access] route blocked', {
        path: pathname,
        reason,
        requiresTier,
        ownerModeActive,
        userRoles: userRoleLabel,
        tenantRole: tenantRoleLabel
      });
    }
    setOwnerGuardNotice(reason);
    void navigate({ to: '/settings' });
  }, [
    auth.enabled,
    auth.loading,
    auth.required,
    hasAccessForTier,
    navigate,
    ownerModeActive,
    pathname,
    tenantRoleLabel,
    userRoleLabel
  ]);

  useEffect(() => {
    if (ownerModeActive) {
      setOwnerGuardNotice(undefined);
    }
  }, [ownerModeActive]);

  useEffect(() => {
    const current = getThemeMode();
    setThemeMode(current);
    setThemeModeState(current);
    return onThemeChange(setThemeModeState);
  }, []);

  useEffect(() => {
    setPlatformMenuOpen(false);
  }, [pathname]);

  const sortedProjects = useMemo(
    () => [...state.projects].sort((left, right) => left.name.localeCompare(right.name)),
    [state.projects]
  );

  const selectedProject = useMemo(() => {
    const fromPath = projectFromPath(pathname);
    if (fromPath) {
      return sortedProjects.find((project) => project.id === fromPath) ?? sortedProjects[0];
    }

    return sortedProjects.find((project) => project.status === 'active') ?? sortedProjects[0];
  }, [pathname, sortedProjects]);

  const contextMode: ShellContextMode = useMemo(() => {
    if (pathname === '/settings' || pathname.startsWith('/settings/')) return 'platform';
    if (pathname.startsWith('/project/')) {
      return 'project';
    }
    return 'global';
  }, [pathname]);

  const context = useMemo(
    () => ({
      tenantId: selectedProject?.tenantId ?? state.projects[0]?.tenantId ?? 'tenant_default',
      projectId: contextMode === 'project' ? selectedProject?.id : undefined,
      mode: contextMode
    }),
    [contextMode, selectedProject?.id, selectedProject?.tenantId, state.projects]
  );

  const defaultThreadId = state.threads[0]?.id ?? 'thread-1';
  const projectScopedRun = useMemo(() => {
    if (!selectedProject?.id) {
      return state.taskRuns[0];
    }
    const projectTaskIds = new Set(
      state.tasks.filter((task) => task.projectId === selectedProject.id).map((task) => task.id)
    );
    return (
      state.taskRuns.find((run) => projectTaskIds.has(run.taskId)) ??
      state.taskRuns[0]
    );
  }, [selectedProject?.id, state.taskRuns, state.tasks]);

  const topBarItems: ShellNavItem[] = useMemo(
    () => [
      { to: '/activity', label: 'Activity', tier: 'primary' },
      { to: '/agents', label: 'Agents', tier: 'primary' }
    ],
    []
  );

  const platformMenuItems: ShellNavItem[] = useMemo(() => {
    if (!canAccessPlatformProjectTier) return [];
    const candidates: ShellNavItem[] = [
      { to: '/settings/providers', label: 'Providers', tier: 'primary', access: 'tenant' },
      { to: '/settings/models', label: 'Models', tier: 'primary', access: 'tenant' },
      { to: '/settings/knowledge', label: 'Knowledge', tier: 'primary', access: 'tenant' },
      { to: '/settings/pipelines', label: 'Pipelines', tier: 'primary', access: 'tenant' },
      { to: '/settings/users', label: 'Users', tier: 'primary', access: 'tenant' },
      { to: '/settings/prompts', label: 'Prompt Registry', tier: 'primary', access: 'tenant' },
      { to: '/settings/workers', label: 'Workers', tier: 'primary', access: 'tenant' },
      { to: '/settings/agents', label: 'Agents', tier: 'secondary', access: 'tenant' },
      { to: '/settings/skills', label: 'Skills', tier: 'secondary', access: 'project' },
      { to: '/settings/usage', label: 'Usage', tier: 'secondary', access: 'tenant' },
      { to: '/settings/tenants', label: 'Tenants', tier: 'secondary', access: 'tenant' },
      { to: '/settings/secrets', label: 'Secrets', tier: 'secondary', access: 'system' },
      { to: '/settings/integrations', label: 'Integrations', tier: 'secondary', access: 'system' },
      { to: '/settings/audit', label: 'Audit', tier: 'secondary', access: 'system' },
      { to: '/settings/rbac', label: 'RBAC', tier: 'secondary', access: 'system' }
    ];
    return candidates.filter((item) => hasAccessForTier(item.access ?? 'project'));
  }, [canAccessPlatformProjectTier, hasAccessForTier]);

  const projectNavItems: ShellNavItem[] = useMemo(() => {
    if (!selectedProject?.id) return [];
    return [
      { to: '/project/$projectId/tasks', params: { projectId: selectedProject.id }, label: 'Tasks', tier: 'primary' },
      { to: '/project/$projectId/pipelines', params: { projectId: selectedProject.id }, label: 'Pipelines', tier: 'primary' },
      {
        to: '/project/$projectId/artifacts/$runId',
        params: { projectId: selectedProject.id, runId: projectScopedRun?.id ?? 'run-1' },
        label: 'Artifacts',
        tier: 'secondary'
      },
      {
        to: '/project/$projectId/chat/$threadId',
        params: { projectId: selectedProject.id, threadId: defaultThreadId },
        label: 'Chat',
        tier: 'primary'
      },
      { to: '/project/$projectId/coding', params: { projectId: selectedProject.id }, label: 'Coding', tier: 'primary' },
      { to: '/project/$projectId/brainstorming', params: { projectId: selectedProject.id }, label: 'Brainstorming', tier: 'primary' },
      { to: '/project/$projectId/context', params: { projectId: selectedProject.id }, label: 'Context', tier: 'secondary' },
      { to: '/project/$projectId/approvals', params: { projectId: selectedProject.id }, label: 'Approvals', tier: 'primary' },
      {
        to: '/project/$projectId/experiments',
        params: { projectId: selectedProject.id },
        label: 'AutoSearch',
        tier: 'secondary'
      },
      {
        to: '/project/$projectId/ruflo',
        params: { projectId: selectedProject.id },
        label: 'Ruflo',
        tier: 'secondary'
      }
    ];
  }, [defaultThreadId, projectScopedRun?.id, selectedProject?.id]);

  const operationModules = useMemo((): OperationModule[] => {
    if (!selectedProject?.id) return [];
    const byLabel = new Map(projectNavItems.map((item) => [item.label, item]));
    const hasJobs = jobs.length > 0;
    const hasApprovals = openApprovals > 0;
    const hasRuns = state.taskRuns.length > 0;
    const hasExperiments = state.experiments.length > 0;
    const routeFor = (label: string): { to: string; params?: Record<string, string> } | undefined => {
      const found = byLabel.get(label);
      if (!found) return undefined;
      return found.params ? { to: found.to, params: found.params } : { to: found.to };
    };

    const modules: OperationModule[] = [
      {
        id: 'chat',
        label: 'Chat',
        ...(routeFor('Chat') ?? { to: '/project/$projectId/chat/$threadId', params: { projectId: selectedProject.id, threadId: defaultThreadId } }),
        enabled: true
      },
      {
        id: 'tasks',
        label: 'Tasks',
        ...(routeFor('Tasks') ?? { to: '/project/$projectId/tasks', params: { projectId: selectedProject.id } }),
        enabled: true
      },
      {
        id: 'agents',
        label: 'Agents',
        to: '/project/$projectId/agents',
        params: { projectId: selectedProject.id },
        enabled: true
      },
      {
        id: 'monitoring',
        label: 'Monitoring',
        to: '/project/$projectId/monitoring',
        params: { projectId: selectedProject.id },
        enabled: hasJobs,
        ...(!hasJobs ? { reason: 'No jobs yet' } : {})
      },
      {
        id: 'actions',
        label: 'Actions',
        ...(routeFor('Approvals') ?? { to: '/project/$projectId/approvals', params: { projectId: selectedProject.id } }),
        enabled: true,
        ...(!hasApprovals ? { reason: 'No pending approvals' } : {})
      },
      {
        id: 'schemas',
        label: 'Schemas',
        to: '/project/$projectId/schemas',
        params: { projectId: selectedProject.id },
        enabled: true
      },
      {
        id: 'context',
        label: 'Context',
        ...(routeFor('Context') ?? { to: '/project/$projectId/context', params: { projectId: selectedProject.id } }),
        enabled: true
      },
      {
        id: 'coding',
        label: 'Coding',
        ...(routeFor('Coding') ?? { to: '/project/$projectId/coding', params: { projectId: selectedProject.id } }),
        enabled: true
      },
      {
        id: 'observability',
        label: 'Observability',
        to: '/project/$projectId/observability',
        params: { projectId: selectedProject.id },
        enabled: hasRuns,
        ...(!hasRuns ? { reason: 'No runs yet' } : {})
      },
      {
        id: 'autosearch',
        label: 'AutoSearch',
        ...(routeFor('AutoSearch') ?? { to: '/project/$projectId/experiments', params: { projectId: selectedProject.id } }),
        enabled: hasExperiments || state.tasks.length > 0,
        ...(!hasExperiments ? { reason: 'No experiment history' } : {})
      },
      {
        id: 'ruflo',
        label: 'Ruflo',
        ...(routeFor('Ruflo') ?? { to: '/project/$projectId/ruflo', params: { projectId: selectedProject.id } }),
        enabled: true
      }
    ];

    return modules.filter((module) => Boolean(module.to));
  }, [
    openApprovals,
    jobs.length,
    projectNavItems,
    selectedProject?.id,
    state.experiments.length,
    state.taskRuns.length,
    state.tasks.length,
    defaultThreadId
  ]);

  const loadProjectJobs = useCallback(async (): Promise<void> => {
    if (context.mode !== 'project' || !selectedProject?.id || (auth.enabled && auth.required)) {
      if (isMountedRef.current) {
        setJobs([]);
        setJobsError(undefined);
      }
      projectJobsPollFailuresRef.current = 0;
      return;
    }
    if (isMountedRef.current) {
      setJobsLoading(true);
      setJobsError(undefined);
    }
    try {
      const { response, body } = await authActions.apiFetchJson<{ items?: Job[]; message?: string }>(
        `/projects/${selectedProject.id}/jobs`
      );
      if (!response.ok) {
        throw new Error(body.message ?? `Unable to load project jobs (HTTP ${response.status})`);
      }
      if (isMountedRef.current) {
        setJobs(body.items ?? []);
      }
      projectJobsPollFailuresRef.current = 0;
    } catch (error) {
      projectJobsPollFailuresRef.current += 1;
      if (isMountedRef.current) {
        setJobsError(error instanceof Error ? error.message : 'Unable to load project jobs');
      }
    } finally {
      if (isMountedRef.current) {
        setJobsLoading(false);
      }
    }
  }, [auth.enabled, auth.required, authActions, context.mode, selectedProject?.id]);

  useEffect(() => {
    if (context.mode !== 'project' || !selectedProject?.id) return;
    void loadProjectJobs();
  }, [context.mode, loadProjectJobs, selectedProject?.id]);

  useEffect(() => {
    if (context.mode !== 'project' || !selectedProject?.id || (auth.enabled && auth.required)) return;
    let cancelled = false;
    let timer: number | undefined;
    let inFlight = false;
    const schedule = (delayMs: number): void => {
      if (cancelled) return;
      timer = window.setTimeout(() => {
        void tick();
      }, delayMs);
    };
    const tick = async (): Promise<void> => {
      const nextDelay = resolveProjectJobsPollDelay({
        runnerLikelyActive,
        consecutiveFailures: projectJobsPollFailuresRef.current
      });
      if (cancelled || inFlight) {
        schedule(nextDelay);
        return;
      }
      inFlight = true;
      try {
        await loadProjectJobs();
      } finally {
        inFlight = false;
      }
      schedule(
        resolveProjectJobsPollDelay({
          runnerLikelyActive,
          consecutiveFailures: projectJobsPollFailuresRef.current
        })
      );
    };
    schedule(
      resolveProjectJobsPollDelay({
        runnerLikelyActive,
        consecutiveFailures: projectJobsPollFailuresRef.current
      })
    );
    return () => {
      cancelled = true;
      if (timer !== undefined) {
        window.clearTimeout(timer);
      }
    };
  }, [
    auth.enabled,
    auth.required,
    context.mode,
    loadProjectJobs,
    runnerLikelyActive,
    selectedProject?.id
  ]);

  const orderedJobs = useMemo(
    () =>
      [...jobs].sort((left, right) => {
        if (left.actionRequired !== right.actionRequired) {
          return Number(right.actionRequired) - Number(left.actionRequired);
        }
        const leftStage = resolveJobStage(left);
        const rightStage = resolveJobStage(right);
        if (leftStage !== rightStage) {
          return stageRank[leftStage] - stageRank[rightStage];
        }
        if (left.status !== right.status) {
          return left.status.localeCompare(right.status);
        }
        if (left.priority !== right.priority) {
          return right.priority - left.priority;
        }
        return right.updatedAt.localeCompare(left.updatedAt);
      }),
    [jobs]
  );
  const selectedJobForContext = useMemo(() => {
    return orderedJobs.find((job) => job.actionRequired) ?? orderedJobs[0];
  }, [orderedJobs]);

  const sendAgentChat = async (): Promise<void> => {
    const message = chatInput.trim();
    if (!message) return;

    setChatLogs((current) => [
      ...current,
      {
        id: `u-${Date.now()}`,
        role: 'user',
        content: message
      }
    ]);
    setChatInput('');
    setChatPending(true);

    try {
      const { response, body } = await authActions.apiFetchJson<{
        item?: {
          response?: string;
        };
        message?: string;
      }>('/agent/chat', {
        method: 'POST',
        body: JSON.stringify({
          message,
          jobId: selectedJobForContext?.id,
          context: {
            projectId: selectedProject?.id,
            resourceId: selectedJobForContext?.resourceId
          }
        })
      });

      if (!response.ok) {
        throw new Error(body.message ?? `Agent chat failed (HTTP ${response.status})`);
      }

      setChatLogs((current) => [
        ...current,
        {
          id: `a-${Date.now()}`,
          role: 'assistant',
          content: body.item?.response ?? 'No response generated.'
        }
      ]);
    } catch (error) {
      setChatLogs((current) => [
        ...current,
        {
          id: `e-${Date.now()}`,
          role: 'assistant',
          content: error instanceof Error ? error.message : 'Agent chat failed'
        }
      ]);
    } finally {
      setChatPending(false);
    }
  };

  const isActive = useMemo(
    () => (item: ShellNavItem) => {
      if (item.params) {
        return Boolean(matchRoute({ to: item.to as any, params: item.params as any, fuzzy: true }));
      }
      return Boolean(matchRoute({ to: item.to as any, fuzzy: true }));
    },
    [matchRoute]
  );

  const activeRouteLabel = routeLabelFromPath(pathname);
  const activeWorkspaceDescriptor = selectedProject ? `${selectedProject.key} · ${selectedProject.name}` : 'No project';
  const tenantName = selectedProject?.tenantId ?? state.projects[0]?.tenantId ?? 'tenant_default';
  const contextDescriptor =
    context.mode === 'platform'
      ? `platform · ${context.tenantId}`
      : context.mode === 'project'
        ? `project · ${context.projectId ?? 'unselected'}`
      : `global · ${context.tenantId}`;

  if (auth.enabled && isLoginRoute) {
    return (
      <div className="platform-root context-global text-[color:var(--text)]">
        <main className="mx-auto w-full max-w-xl px-4 py-10">
          <Outlet />
        </main>
      </div>
    );
  }

  if (auth.enabled && (auth.loading || auth.required || !auth.principal)) {
    return (
      <div className="platform-root context-global text-[color:var(--text)]">
        <main className="mx-auto w-full max-w-xl px-4 py-10">
          <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-6 text-sm text-[color:var(--muted)]">
            {auth.loading ? 'Resolving session…' : 'Redirecting to sign in…'}
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className={`platform-root context-${context.mode} text-[color:var(--text)]`}>
      <header className="platform-topbar">
        <div className="platform-topbar-left">
          <Link to="/" className="platform-topbar-brand" aria-label="DevTools Home">
            {brandName}
          </Link>
          {topBarItems.map((item) => (
            <Link
              key={item.label}
              to={item.to as any}
              {...(item.params ? { params: item.params as any } : {})}
              className={`nav-link platform-topbar-link ${isActive(item) ? 'nav-link-active' : ''}`}
            >
              {item.label}
            </Link>
          ))}
          {canAccessPlatformProjectTier ? (
            <div className="platform-megamenu">
              <button
                type="button"
                className={`nav-link platform-topbar-link ${pathname.startsWith('/settings/') ? 'nav-link-active' : ''}`}
                onClick={() => setPlatformMenuOpen((current) => !current)}
              >
                Platform
              </button>
              {platformMenuOpen ? (
                <div className="platform-megamenu-content">
                  {platformMenuItems.map((item) => (
                    <Link
                      key={`platform:${item.label}`}
                      to={item.to as any}
                      {...(item.params ? { params: item.params as any } : {})}
                      className={`nav-link ${
                        item.tier === 'primary' ? 'nav-link-priority' : 'nav-link-secondary-tier'
                      } ${isActive(item) ? 'nav-link-active' : ''}`}
                    >
                      {item.label}
                    </Link>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
          {canAccessPlatformProjectTier ? (
            <Link
              to="/settings"
              className={`nav-link platform-topbar-link ${isActive({ to: '/settings', label: 'Settings' }) ? 'nav-link-active' : ''}`}
            >
              Settings
            </Link>
          ) : null}
          <Link
            to="/help"
            className={`nav-link platform-topbar-link ${isActive({ to: '/help', label: 'Help' }) ? 'nav-link-active' : ''}`}
          >
            Help
          </Link>
        </div>
        <div className="platform-topbar-right">
          <div className="platform-session-text">tenant {tenantName}</div>
          <div className="platform-session-text">System Access: {ownerModeActive ? 'OWNER' : 'RESTRICTED'}</div>
        </div>
      </header>

      <div className="platform-grid">
        <aside className="platform-rail platform-rail-projects">
          <section className="platform-section">
            <div className="platform-section-title">Launcher</div>
            <div className="platform-launcher-grid">
              {sortedProjects.length === 0 ? (
                <div className="platform-empty-row">No projects available.</div>
              ) : (
                sortedProjects.map((project) => {
                  const selected = selectedProject?.id === project.id;
                  return (
                    <Link
                      key={project.id}
                      to="/project/$projectId/tasks"
                      params={{ projectId: project.id }}
                      className={`platform-launcher-item ${selected ? 'platform-launcher-item-active' : ''}`}
                      title={project.name}
                    >
                      <span>{toLauncherCode(project)}</span>
                    </Link>
                  );
                })
              )}
            </div>
          </section>
        </aside>

        <aside className="platform-rail platform-rail-jobs">
          <header className="platform-header-block">
            <div className="platform-job-title-row">
              <div>
                <div className="label">Project Context</div>
                <div className="platform-title-sm">{selectedProject?.name ?? 'No project selected'}</div>
              </div>
              {selectedProject?.id ? (
                <Button variant="secondary" onClick={() => void loadProjectJobs()}>
                  Refresh
                </Button>
              ) : null}
            </div>
            <div className="platform-subtitle">Tasks and pipelines are project-scoped execution units.</div>
          </header>

          <section className="platform-section">
            <div className="platform-section-title">Operations</div>
            <div className="platform-operations-list">
              {operationModules.length === 0 ? (
                <div className="platform-empty-row">Select a project from launcher.</div>
              ) : (
                operationModules.map((module) =>
                  module.enabled ? (
                    <Link
                      key={module.id}
                      to={module.to as any}
                      {...(module.params ? { params: module.params as any } : {})}
                      className={`nav-link nav-link-priority ${isActive(module) ? 'nav-link-active' : ''}`}
                    >
                      <span>{module.label}</span>
                    </Link>
                  ) : (
                    <div key={module.id} className="platform-op-disabled" title={module.reason ?? 'Unavailable'}>
                      <span>{module.label}</span>
                      <small>{module.reason ?? 'Unavailable'}</small>
                    </div>
                  )
                )
              )}
            </div>
          </section>

          <section className="platform-section">
            <div className="platform-section-title">Live Queue</div>
            {jobsLoading ? <div className="platform-empty-row">Loading jobs…</div> : null}
            {!jobsLoading && jobsError ? <div className="platform-error-row">{jobsError}</div> : null}
            {!jobsLoading && !jobsError ? (
              <div className="platform-inline-stat-grid">
                <div className="platform-inline-stat">
                  <span>Running</span>
                  <strong>{runningJobsCount}</strong>
                </div>
                <div className="platform-inline-stat">
                  <span>Ready</span>
                  <strong>{readyJobsCount}</strong>
                </div>
                <div className="platform-inline-stat">
                  <span>Action</span>
                  <strong>{attentionJobs}</strong>
                </div>
                <div className="platform-inline-stat">
                  <span>Errors</span>
                  <strong>{errorJobsCount}</strong>
                </div>
              </div>
            ) : null}
          </section>
        </aside>

        <main className="platform-workspace">
          <header className="platform-workspace-header">
            <div className="platform-workspace-context">
              <div className="label">Workspace</div>
              <div className="platform-workspace-title">{activeRouteLabel}</div>
              <div className="platform-subtitle">{activeWorkspaceDescriptor}</div>
              <div className="platform-context-chip">{contextDescriptor}</div>
            </div>
            <div className="platform-workspace-actions">
              <div className="platform-session-text">
                {auth.enabled ? (
                  auth.principal ? (
                    <span>Logged in as {auth.principal.displayName}</span>
                  ) : (
                    <span>No active session</span>
                  )
                ) : (
                  <span>Single-tenant mode</span>
                )}
              </div>
              <Button
                variant="secondary"
                onClick={() => {
                  const next = toggleThemeMode();
                  setThemeModeState(next);
                }}
              >
                {themeMode === 'dark' ? 'Dark' : 'Light'}
              </Button>
              {auth.enabled && auth.principal ? (
                <Button variant="secondary" onClick={() => void authActions.logout()}>
                  Logout
                </Button>
              ) : null}
            </div>
          </header>

          {auth.enabled && auth.error && !isLoginRoute ? (
            <div className="platform-error-row platform-workspace-banner">{auth.error}</div>
          ) : null}
          {showOwnerModeDebugPanel ? (
            <div className="platform-context-chip platform-workspace-banner" data-testid="owner-mode-debug-panel">
              ownerModeActive={String(ownerModeActive)} | userRoles={userRoleLabel} | tenantRole={tenantRoleLabel}
            </div>
          ) : null}
          {ownerGuardNotice ? (
            <div className="platform-error-row platform-workspace-banner">{ownerGuardNotice}</div>
          ) : null}

          <section className="platform-workspace-body">
            <Outlet />
          </section>
        </main>
      </div>

      <button
        type="button"
        onClick={() => setChatOpen((current) => !current)}
        className="platform-chat-toggle"
      >
        Agent Chat {attentionJobs > 0 ? `(${attentionJobs})` : ''}
      </button>

      {chatOpen ? (
        <section className="platform-chat-panel">
          <header className="platform-chat-header">
            <div>
              <div className="label">Agent Console</div>
              <div className="platform-title-sm">Conversation</div>
            </div>
            <Button variant="secondary" onClick={() => setChatOpen(false)}>
              Close
            </Button>
          </header>

          <div className="platform-chat-context">
            <div>jobId: {selectedJobForContext?.id ?? 'n/a'}</div>
            <div>planId: {selectedJobForContext?.resourceType === 'brainstorm' ? selectedJobForContext.resourceId : 'n/a'}</div>
          </div>

          <div className="platform-chat-log">
            {chatLogs.length === 0 ? (
              <div className="platform-empty-row">No messages yet.</div>
            ) : (
              chatLogs.map((entry) => (
                <div
                  key={entry.id}
                  className={`platform-chat-bubble ${entry.role === 'assistant' ? 'platform-chat-bubble-assistant' : ''}`}
                >
                  <div className="platform-chat-role">{entry.role}</div>
                  <div>{entry.content}</div>
                </div>
              ))
            )}
          </div>

          <div className="platform-chat-input-row">
            <input
              value={chatInput}
              onChange={(event) => setChatInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  void sendAgentChat();
                }
              }}
              className="cp-input"
              placeholder="Send instruction, ask status, or request action…"
            />
            <Button variant="primary" onClick={() => void sendAgentChat()}>
              {chatPending ? '…' : 'Send'}
            </Button>
          </div>
        </section>
      ) : null}
    </div>
  );
}
