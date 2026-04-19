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

type ProjectNavigatorItem = {
  id: string;
  label: string;
  to: string;
  params?: Record<string, string>;
  badge?: string;
  tone?: 'warn' | 'good';
};

type ProjectRuntimeSnapshot = {
  primaryAgentId?: string;
  workspaceId?: string;
};

type WorkspaceSummary = {
  id?: string;
  localPath?: string;
};

type ProjectLauncherSummary = {
  repoCount: number;
  roadmapCount: number;
  taskCount: number;
  likelyNeedsSetup: boolean;
};

type ProjectLauncherTone = {
  background: string;
  border: string;
  text: string;
  glow: string;
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
  const segments = pathname.split('/').filter(Boolean);
  const first = segments[0];
  if (!first) return 'Dashboard';
  if (first === 'settings') return 'Platform Settings';
  if (first === 'projects' && segments[1] === 'new') return 'New Project';
  if (first === 'project') {
    const section = segments[2];
    if (!section) return 'Project Home';
    if (section === 'onboarding') return 'Project Setup';
    return section
      .split('-')
      .map((item) => item[0]?.toUpperCase() + item.slice(1))
      .join(' ');
  }
  if (first === 'projects') return 'Projects';
  return first
    .split('-')
    .map((item) => item[0]?.toUpperCase() + item.slice(1))
    .join(' ');
};

const toLauncherCode = (project: Project): string => {
  const key = project.key.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  if (key.length >= 2) return key.slice(0, Math.min(3, key.length));
  const name = project.name.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  if (name.length >= 2) return name.slice(0, Math.min(3, name.length));
  return (key || name || project.id.slice(0, 3)).toUpperCase();
};

const launcherToneForProject = (project: Project): ProjectLauncherTone => {
  const palette = [
    { background: 'rgba(31, 119, 255, 0.18)', border: 'rgba(95, 166, 255, 0.38)', text: '#d9eeff', glow: 'rgba(31, 119, 255, 0.26)' },
    { background: 'rgba(30, 201, 122, 0.18)', border: 'rgba(96, 230, 161, 0.38)', text: '#ddfff1', glow: 'rgba(30, 201, 122, 0.24)' },
    { background: 'rgba(255, 163, 26, 0.18)', border: 'rgba(255, 196, 95, 0.4)', text: '#fff3d8', glow: 'rgba(255, 163, 26, 0.22)' },
    { background: 'rgba(255, 96, 145, 0.18)', border: 'rgba(255, 150, 184, 0.42)', text: '#ffe1eb', glow: 'rgba(255, 96, 145, 0.22)' },
    { background: 'rgba(117, 92, 255, 0.18)', border: 'rgba(160, 142, 255, 0.4)', text: '#ece7ff', glow: 'rgba(117, 92, 255, 0.22)' },
    { background: 'rgba(0, 200, 220, 0.18)', border: 'rgba(114, 232, 242, 0.42)', text: '#d9fcff', glow: 'rgba(0, 200, 220, 0.2)' }
  ] as const;

  const seed = `${project.id}:${project.key}:${project.name}`;
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 33 + seed.charCodeAt(index)) >>> 0;
  }
  return palette[hash % palette.length] ?? palette[0];
};

const resolveProjectJobsPollDelay = (input: {
  runnerLikelyActive: boolean;
  consecutiveFailures: number;
}): number => {
  const baseDelay = input.runnerLikelyActive ? 4000 : 12000;
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
  const [launcherBusyProjectId, setLauncherBusyProjectId] = useState<string | undefined>();
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
  const showOwnerModeDebugPanel =
    import.meta.env.DEV
    && typeof window !== 'undefined'
    && window.localStorage.getItem('cp_shell_debug') === '1';
  const brandName = ((import.meta.env.VITE_PLATFORM_BRAND as string | undefined) ?? '').trim() || 'DevTools';
  const runningJobsCount = jobs.filter((job) => resolveJobStage(job) === 'running').length;
  const readyJobsCount = jobs.filter((job) => resolveJobStage(job) === 'ready').length;
  const waitingDependencyJobsCount = jobs.filter((job) => resolveJobStage(job) === 'waiting_dependencies').length;
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

  const projectLauncherSummaries = useMemo(() => {
    const summaries = new Map<string, ProjectLauncherSummary>();
    for (const project of sortedProjects) {
      const repoCount = state.projectRepositoryLinks.filter((link) => link.projectId === project.id).length;
      const roadmapCount = state.roadmapItems.filter((item) => item.projectId === project.id).length;
      const taskCount = state.tasks.filter((item) => item.projectId === project.id).length;
      summaries.set(project.id, {
        repoCount,
        roadmapCount,
        taskCount,
        likelyNeedsSetup: repoCount + roadmapCount + taskCount === 0
      });
    }
    return summaries;
  }, [sortedProjects, state.projectRepositoryLinks, state.roadmapItems, state.tasks]);

  const selectedProject = useMemo(() => {
    const fromPath = projectFromPath(pathname);
    if (fromPath) {
      return sortedProjects.find((project) => project.id === fromPath) ?? sortedProjects[0];
    }

    return sortedProjects.find((project) => project.status === 'active') ?? sortedProjects[0];
  }, [pathname, sortedProjects]);

  const selectedProjectSummary = selectedProject ? projectLauncherSummaries.get(selectedProject.id) : undefined;

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

  const topBarItems: ShellNavItem[] = useMemo(
    () => [
      { to: '/projects', label: 'Projects', tier: 'primary' },
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

  const projectNavigatorItems = useMemo((): ProjectNavigatorItem[] => {
    if (!selectedProject?.id) return [];
    const setupRequired = Boolean(selectedProjectSummary?.likelyNeedsSetup);
    const queueBadge = jobsLoading
      ? 'Queue syncing…'
      : jobs.length > 0
        ? `${runningJobsCount} running · ${readyJobsCount} ready`
        : 'Queue idle';
    return [
      {
        id: 'project-home',
        label: 'Project Home',
        to: '/project/$projectId',
        params: { projectId: selectedProject.id }
      },
      {
        id: 'setup',
        label: 'Setup',
        to: '/project/$projectId/onboarding',
        params: { projectId: selectedProject.id },
        badge: setupRequired ? 'Required' : 'Configured',
        tone: setupRequired ? 'warn' : 'good'
      },
      {
        id: 'coding',
        label: 'Coding',
        to: '/project/$projectId/coding',
        params: { projectId: selectedProject.id }
      },
      {
        id: 'context',
        label: 'Context',
        to: '/project/$projectId/context',
        params: { projectId: selectedProject.id }
      },
      {
        id: 'operations',
        label: 'Operations',
        to: '/project/$projectId/monitoring',
        params: { projectId: selectedProject.id },
        badge: queueBadge,
        ...(jobs.length > 0 ? { tone: 'good' as const } : {})
      }
    ];
  }, [
    jobs.length,
    jobsLoading,
    readyJobsCount,
    runningJobsCount,
    selectedProject?.id,
    selectedProjectSummary?.likelyNeedsSetup
  ]);

  const resolveProjectEntry = useCallback(
    async (project: Project): Promise<{ to: '/project/$projectId' | '/project/$projectId/onboarding'; params: { projectId: string } }> => {
      const fallback =
        projectLauncherSummaries.get(project.id)?.likelyNeedsSetup
          ? { to: '/project/$projectId/onboarding' as const, params: { projectId: project.id } }
          : { to: '/project/$projectId' as const, params: { projectId: project.id } };

      try {
        const [runtimeResult, workspaceResult] = await Promise.all([
          authActions.apiFetchJson<{ item?: { runtimeProfile?: ProjectRuntimeSnapshot }; message?: string }>(
            `/projects/${project.id}/runtime`
          ),
          authActions.apiFetchJson<{ items?: WorkspaceSummary[]; message?: string }>(
            `/workspaces?projectId=${encodeURIComponent(project.id)}`
          )
        ]);

        if (!runtimeResult.response.ok || !workspaceResult.response.ok) {
          return fallback;
        }

        const runtimeProfile = runtimeResult.body.item?.runtimeProfile;
        const workspace = workspaceResult.body.items?.[0];
        const hasPrimaryAgent = Boolean(runtimeProfile?.primaryAgentId);
        const hasWorkspace = Boolean(runtimeProfile?.workspaceId || workspace?.id || workspace?.localPath?.trim());

        return !hasPrimaryAgent || !hasWorkspace
          ? { to: '/project/$projectId/onboarding', params: { projectId: project.id } }
          : { to: '/project/$projectId', params: { projectId: project.id } };
      } catch {
        return fallback;
      }
    },
    [authActions, projectLauncherSummaries]
  );

  const openProjectFromLauncher = useCallback(
    async (project: Project): Promise<void> => {
      setLauncherBusyProjectId(project.id);
      try {
        const target = await resolveProjectEntry(project);
        await navigate(target as any);
      } finally {
        setLauncherBusyProjectId((current) => (current === project.id ? undefined : current));
      }
    },
    [navigate, resolveProjectEntry]
  );

  const loadProjectJobs = useCallback(async (input?: { silent?: boolean }): Promise<void> => {
    const silent = input?.silent ?? false;
    if (context.mode !== 'project' || !selectedProject?.id || (auth.enabled && auth.required)) {
      if (isMountedRef.current) {
        setJobs([]);
        setJobsError(undefined);
      }
      projectJobsPollFailuresRef.current = 0;
      return;
    }
    if (!silent && isMountedRef.current) {
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
        setJobsError(undefined);
      }
      projectJobsPollFailuresRef.current = 0;
    } catch (error) {
      projectJobsPollFailuresRef.current += 1;
      if (isMountedRef.current) {
        setJobsError(error instanceof Error ? error.message : 'Unable to load project jobs');
      }
    } finally {
      if (!silent && isMountedRef.current) {
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
        if (typeof document !== 'undefined' && document.visibilityState !== 'visible') {
          schedule(30000);
          return;
        }
        await loadProjectJobs({ silent: true });
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
  const setupIsRequired = Boolean(selectedProjectSummary?.likelyNeedsSetup);
  const selectedProjectGuidance = !selectedProject
    ? 'Select a project from Launcher to start.'
    : setupIsRequired
      ? 'Continue setup first, then move to Coding and Operations.'
      : 'Setup complete. Use Project Home, Coding, Context and Operations.';
  const setupStateLabel = setupIsRequired ? 'Setup required' : 'Setup complete';
  const projectOperationsActive = Boolean(
    selectedProject
      && (
        pathname.startsWith(`/project/${selectedProject.id}/monitoring`)
        || pathname.startsWith(`/project/${selectedProject.id}/approvals`)
        || pathname.startsWith(`/project/${selectedProject.id}/agents`)
        || pathname.startsWith(`/project/${selectedProject.id}/observability`)
      )
  );
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
          <Link
            to="/help"
            className={`nav-link platform-topbar-link platform-topbar-link-quiet ${isActive({ to: '/help', label: 'Help' }) ? 'nav-link-active' : ''}`}
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
                  const tone = launcherToneForProject(project);
                  return (
                    <button
                      type="button"
                      key={project.id}
                      onClick={() => void openProjectFromLauncher(project)}
                      aria-label={project.name}
                      className={`platform-launcher-item ${selected ? 'platform-launcher-item-active' : ''}`}
                      style={
                        {
                          '--launcher-accent-bg': tone.background,
                          '--launcher-accent-border': tone.border,
                          '--launcher-accent-text': tone.text,
                          '--launcher-accent-glow': tone.glow
                        } as React.CSSProperties
                      }
                      title={project.name}
                    >
                      <span>{launcherBusyProjectId === project.id ? '…' : toLauncherCode(project)}</span>
                    </button>
                  );
                })
              )}
            </div>
            <div className="platform-launcher-actions">
              <Link to="/projects" className="platform-launcher-cta">
                All Projects
              </Link>
              <Link to="/projects/new" className="platform-launcher-cta platform-launcher-cta-primary">
                + New Project
              </Link>
            </div>
          </section>
        </aside>

        <aside className={`platform-rail platform-rail-jobs ${context.mode === 'project' ? 'platform-rail-jobs-active' : ''}`}>
          <header className="platform-header-block">
            <div className="platform-job-title-row">
              <div>
                <div className="label">Current Project</div>
                <div className="platform-title-sm">{selectedProject?.name ?? 'No project selected'}</div>
                {selectedProject ? (
                  <div className="platform-project-context-meta">
                    <span className="platform-project-context-key">{selectedProject.key}</span>
                    <span className={`platform-project-state-badge ${setupIsRequired ? 'platform-project-state-badge-warn' : 'platform-project-state-badge-good'}`}>
                      {setupStateLabel}
                    </span>
                  </div>
                ) : null}
              </div>
              {selectedProject?.id ? (
                <div className="platform-context-actions">
                  <Button variant="secondary" onClick={() => void navigate({ to: '/project/$projectId', params: { projectId: selectedProject.id } } as any)}>
                    Project Home
                  </Button>
                  <Button
                    variant={setupIsRequired ? 'primary' : 'secondary'}
                    onClick={() => void navigate({ to: '/project/$projectId/onboarding', params: { projectId: selectedProject.id } } as any)}
                  >
                    {setupIsRequired ? 'Continue setup' : 'Setup'}
                  </Button>
                </div>
              ) : null}
            </div>
            <div className="platform-subtitle">{selectedProjectGuidance}</div>
          </header>

          <section className="platform-section">
            <div className="platform-section-title">Project Navigator</div>
            <div className="platform-project-navigator">
              {projectNavigatorItems.length === 0 ? (
                <div className="platform-empty-row">Select a project from launcher.</div>
              ) : (
                projectNavigatorItems.map((item) => (
                  <Link
                    key={item.id}
                    to={item.to as any}
                    {...(item.params ? { params: item.params as any } : {})}
                    className={`platform-project-nav-item ${
                      isActive(
                        item.params
                          ? { to: item.to, params: item.params, label: item.label }
                          : { to: item.to, label: item.label }
                      )
                        ? 'platform-project-nav-item-active'
                        : ''
                    }`}
                  >
                    <div className="platform-project-nav-copy">
                      <div className="platform-project-nav-title">{item.label}</div>
                    </div>
                    <span
                      className={`platform-project-nav-badge ${
                        item.tone === 'warn'
                          ? 'platform-project-nav-badge-warn'
                          : item.tone === 'good'
                            ? 'platform-project-nav-badge-good'
                            : ''
                      }`}
                    >
                      {item.badge ?? 'Open'}
                    </span>
                  </Link>
                ))
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
              </div>
            ) : null}
          </section>
        </aside>

        <main className={`platform-workspace ${context.mode === 'project' ? 'platform-workspace-project' : ''}`}>
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

          {context.mode === 'project' && selectedProject ? (
            <section className="platform-project-bar">
              <div className="platform-project-bar-main">
                <div className="platform-project-bar-label">Project</div>
                <div className="platform-project-bar-title-row">
                  <div className="platform-project-bar-title">{selectedProject.name}</div>
                  <span className="platform-project-bar-key">{selectedProject.key}</span>
                </div>
                <div className="platform-project-bar-meta">
                  <span className={`platform-project-state-badge ${setupIsRequired ? 'platform-project-state-badge-warn' : 'platform-project-state-badge-good'}`}>
                    {setupStateLabel}
                  </span>
                </div>
                <div className="platform-subtitle">{selectedProjectGuidance}</div>
              </div>
              <div className="platform-project-bar-actions">
                <Link
                  to="/project/$projectId"
                  params={{ projectId: selectedProject.id }}
                  className={`nav-link nav-link-priority ${pathname === `/project/${selectedProject.id}` ? 'nav-link-active' : ''}`}
                >
                  Project Home
                </Link>
                <Link
                  to="/project/$projectId/onboarding"
                  params={{ projectId: selectedProject.id }}
                  className={`nav-link ${pathname.includes(`/project/${selectedProject.id}/onboarding`) ? 'nav-link-active' : ''}`}
                >
                  {setupIsRequired ? 'Continue setup' : 'Setup'}
                </Link>
                <Link
                  to="/project/$projectId/coding"
                  params={{ projectId: selectedProject.id }}
                  className={`nav-link ${pathname.includes(`/project/${selectedProject.id}/coding`) ? 'nav-link-active' : ''}`}
                >
                  Coding
                </Link>
                <Link
                  to="/project/$projectId/context"
                  params={{ projectId: selectedProject.id }}
                  className={`nav-link ${pathname.includes(`/project/${selectedProject.id}/context`) ? 'nav-link-active' : ''}`}
                >
                  Context
                </Link>
                <Link
                  to="/project/$projectId/monitoring"
                  params={{ projectId: selectedProject.id }}
                  className={`nav-link ${projectOperationsActive ? 'nav-link-active' : ''}`}
                >
                  Operations
                </Link>
              </div>
            </section>
          ) : null}

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
