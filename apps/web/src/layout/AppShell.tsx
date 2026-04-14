import { Link, Outlet, useMatchRoute, useNavigate } from '@tanstack/react-router';
import { useEffect, useMemo, useState } from 'react';
import { useAppStore } from '@/store/app-store';
import { Button, Pill, StatCard } from '@/components/common';
import { getThemeMode, onThemeChange, setThemeMode, toggleThemeMode, type ThemeMode } from '@/theme';

type ShellNavItem = {
  to:
    | '/'
    | '/projects'
    | '/memory'
    | '/retrieval/$runId'
    | '/approvals'
    | '/experiments'
    | '/brainstorming'
    | '/providers'
    | '/skills'
    | '/agents'
    | '/runtime'
    | '/mcp'
    | '/secrets'
    | '/database'
    | '/stack'
    | '/local-repos'
    | '/versioning'
    | '/settings'
    | '/chat/$threadId'
    | '/login'
    | '/admin/rbac';
  label: string;
  group: 'core' | 'ops' | 'infra' | 'admin';
  tier: 'primary' | 'secondary';
  params?: Record<string, string>;
};

const parseFlag = (value: string | undefined, fallback = false): boolean => {
  if (value === undefined) return fallback;
  const normalized = value.trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes';
};

const mcpFeatureEnabled = (): boolean => parseFlag(import.meta.env.VITE_MCP_ENABLED, false);

const navItems: ShellNavItem[] = [
  { to: '/', label: 'Dashboard', group: 'core', tier: 'primary' },
  { to: '/projects', label: 'Projects', group: 'core', tier: 'primary' },
  { to: '/chat/$threadId', label: 'Chat', group: 'core', tier: 'primary', params: { threadId: 'thread-1' } },
  { to: '/brainstorming', label: 'Brainstorming', group: 'core', tier: 'secondary' },
  { to: '/approvals', label: 'Approvals', group: 'ops', tier: 'primary' },
  { to: '/agents', label: 'Agents', group: 'ops', tier: 'primary' },
  { to: '/runtime', label: 'Ruflo & Runtime', group: 'ops', tier: 'secondary' },
  { to: '/memory', label: 'Memory', group: 'ops', tier: 'secondary' },
  { to: '/retrieval/$runId', label: 'Retrieved Context', group: 'ops', tier: 'secondary', params: { runId: 'run-1' } },
  { to: '/experiments', label: 'AutoResearch', group: 'ops', tier: 'secondary' },
  { to: '/providers', label: 'Providers', group: 'infra', tier: 'primary' },
  { to: '/mcp', label: 'MCP', group: 'infra', tier: 'secondary' },
  { to: '/skills', label: 'Skills', group: 'infra', tier: 'secondary' },
  { to: '/database', label: 'Database', group: 'infra', tier: 'secondary' },
  { to: '/local-repos', label: 'Local Repos', group: 'infra', tier: 'secondary' },
  { to: '/versioning', label: 'Versioning', group: 'infra', tier: 'secondary' },
  { to: '/settings', label: 'Settings', group: 'infra', tier: 'secondary' },
  { to: '/secrets', label: 'Secrets', group: 'admin', tier: 'primary' },
  { to: '/stack', label: 'Stack & Machines', group: 'admin', tier: 'primary' },
  { to: '/admin/rbac', label: 'Admin RBAC', group: 'admin', tier: 'secondary' }
] as const;

export function AppShell() {
  const { state, auth, authActions } = useAppStore();
  const matchRoute = useMatchRoute();
  const navigate = useNavigate();
  const [themeMode, setThemeModeState] = useState<ThemeMode>(() => getThemeMode());
  const activeProjects = state.projects.filter((project) => project.status === 'active').length;
  const openApprovals = state.approvals.filter((approval) => approval.status === 'pending').length;
  const runningTasks = state.tasks.filter((task) => task.state === 'running').length;
  const isLoginRoute = Boolean(matchRoute({ to: '/login' }));
  const isAdmin = auth.enabled && Boolean(auth.principal?.roles.includes('admin'));
  const showMcpNav = mcpFeatureEnabled();

  useEffect(() => {
    if (!auth.enabled || !auth.required || isLoginRoute) return;
    void navigate({ to: '/login' });
  }, [auth.enabled, auth.required, isLoginRoute, navigate]);

  useEffect(() => {
    const current = getThemeMode();
    setThemeMode(current);
    setThemeModeState(current);
    return onThemeChange(setThemeModeState);
  }, []);

  const isActive = useMemo(() => (item: ShellNavItem) => {
    if (item.params) {
      return Boolean(matchRoute({ to: item.to as any, params: item.params as any, fuzzy: true }));
    }
    return Boolean(matchRoute({ to: item.to as any, fuzzy: true }));
  }, [matchRoute]);

  const groupedNavItems = useMemo(() => {
    const allowed = navItems.filter((item) => {
      if (item.to === '/admin/rbac' && !isAdmin) return false;
      if (item.to === '/skills' && !auth.enabled) return false;
      if (item.to === '/mcp' && (!auth.enabled || !isAdmin || !showMcpNav)) return false;
      if (item.to === '/secrets' && (!auth.enabled || !isAdmin)) return false;
      if (item.to === '/stack' && (!auth.enabled || !isAdmin)) return false;
      return true;
    });

    const groups: { key: ShellNavItem['group']; label: string; items: ShellNavItem[] }[] = [
      { key: 'core', label: 'Core Commands', items: [] },
      { key: 'ops', label: 'Operations', items: [] },
      { key: 'infra', label: 'Infrastructure', items: [] },
      { key: 'admin', label: 'Admin Controls', items: [] }
    ];

    for (const item of allowed) {
      const target = groups.find((group) => group.key === item.group);
      if (target) target.items.push(item);
    }
    return groups.filter((group) => group.items.length > 0);
  }, [auth.enabled, isAdmin, showMcpNav]);

  return (
    <div className="min-h-screen text-[color:var(--text)]">
      <div className="matrix-canvas grid min-h-screen w-full gap-5 p-4 lg:grid-cols-[280px_minmax(0,1fr)] xl:grid-cols-[280px_minmax(0,1fr)_320px] xl:p-6">
        <aside className="shell-panel flex flex-col gap-4 p-4">
          <div>
            <div className="label">Control Plane</div>
            <div className="mt-2 text-2xl font-semibold leading-tight text-[color:var(--text)]" style={{ fontFamily: '"Sora", "Manrope", sans-serif' }}>
              Command Center
            </div>
            <p className="mt-2 text-xs leading-5 text-[color:var(--muted)]">
              Real-time multi-agent operations, verifications, memory and routing from a single cockpit.
            </p>
          </div>
          <nav className="space-y-3">
            {groupedNavItems.map((group) => (
              <div key={group.key} className="space-y-1.5">
                <div className="nav-group-title">{group.label}</div>
                {group.items.map((item) => (
                  <Link
                    key={item.to}
                    to={item.to as any}
                    {...(item.params ? { params: item.params as any } : {})}
                    aria-label={item.label}
                    className={`nav-link ${item.tier === 'primary' ? 'nav-link-priority' : 'nav-link-secondary-tier'} ${isActive(item) ? 'nav-link-active' : ''}`}
                  >
                    <span className="flex items-center gap-2">
                      <span aria-hidden="true" className="inline-flex h-5 w-5 items-center justify-center rounded border border-[color:var(--line)] bg-black/20 text-[10px] font-semibold">
                        {item.label.slice(0, 2).toUpperCase()}
                      </span>
                      {item.label}
                    </span>
                    {item.to === '/approvals' && openApprovals ? <Pill tone="warn">{openApprovals}</Pill> : null}
                  </Link>
                ))}
              </div>
            ))}
          </nav>
          <div className="surface-muted rounded border p-3 text-sm">
            <div className="label">Theme</div>
            <div className="mt-1.5 flex items-center justify-between gap-3">
              <span className="text-[color:var(--text)]">{themeMode === 'dark' ? 'Dark Matrix' : 'Light Mode'}</span>
              <Button
                variant="secondary"
                onClick={() => {
                  const next = toggleThemeMode();
                  setThemeModeState(next);
                }}
              >
                Toggle
              </Button>
            </div>
          </div>
          {auth.enabled ? (
            <div className="surface-muted rounded border p-3 text-sm">
              <div className="label">Session</div>
              {auth.principal ? (
                <div className="mt-2 space-y-2">
                  <div className="text-[color:var(--text)]">Logged in as {auth.principal.displayName}</div>
                  <div className="text-[color:var(--muted)]">{auth.principal.email}</div>
                  <div className="flex flex-wrap gap-1">
                    {auth.principal.roles.map((role) => (
                      <Pill key={role} tone="accent">{role}</Pill>
                    ))}
                  </div>
                  <Button variant="secondary" onClick={() => void authActions.logout()}>Log out</Button>
                </div>
              ) : (
                <div className="mt-2 space-y-2 text-[color:var(--muted)]">
                  <div>No active session</div>
                  <Link to="/login" className="text-[color:var(--accent-2)] underline underline-offset-4">Sign in</Link>
                </div>
              )}
            </div>
          ) : null}
          <div className="mt-auto grid gap-3">
            <StatCard label="Projects" value={state.projects.length} hint={`${activeProjects} active`} />
            <StatCard label="Running tasks" value={runningTasks} hint={`${openApprovals} approvals pending`} />
          </div>
        </aside>

        <main className="space-y-5">
          {auth.enabled && auth.error && !isLoginRoute ? (
            <div className="rounded-xl border p-3 text-sm" style={{ borderColor: 'color-mix(in oklab, var(--warn) 40%, transparent)', background: 'color-mix(in oklab, var(--warn) 12%, transparent)', color: 'var(--warn)' }}>
              {auth.error}
            </div>
          ) : null}
          <Outlet />
        </main>

        <aside className="hidden xl:block">
          <div className="sticky top-6 space-y-4">
            <StatCard label="Projects active" value={activeProjects} hint="Operational boundary count" />
            <StatCard label="Approvals open" value={openApprovals} hint="Awaiting user decision" />
            <StatCard label="Route health" value="92%" hint="Latest provider snapshots and workflow readiness" />
          </div>
        </aside>
      </div>
    </div>
  );
}
