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
    | '/providers'
    | '/skills'
    | '/agents'
    | '/runtime'
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
  params?: Record<string, string>;
};

const navItems: ShellNavItem[] = [
  { to: '/', label: 'Dashboard' },
  { to: '/projects', label: 'Projects' },
  { to: '/memory', label: 'Memory' },
  { to: '/retrieval/$runId', label: 'Retrieved Context', params: { runId: 'run-1' } },
  { to: '/approvals', label: 'Approvals' },
  { to: '/experiments', label: 'AutoResearch' },
  { to: '/providers', label: 'Providers' },
  { to: '/skills', label: 'Skills' },
  { to: '/agents', label: 'Agents' },
  { to: '/runtime', label: 'Ruflo & Runtime' },
  { to: '/secrets', label: 'Secrets' },
  { to: '/database', label: 'Database' },
  { to: '/stack', label: 'Stack & Machines' },
  { to: '/local-repos', label: 'Local Repos' },
  { to: '/versioning', label: 'Versioning' },
  { to: '/settings', label: 'Settings' },
  { to: '/admin/rbac', label: 'Admin RBAC' },
  { to: '/chat/$threadId', label: 'Chat', params: { threadId: 'thread-1' } }
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

  return (
    <div className="min-h-screen text-slate-100">
      <div className="matrix-canvas grid min-h-screen w-full gap-5 p-4 lg:grid-cols-[270px_minmax(0,1fr)] xl:grid-cols-[270px_minmax(0,1fr)_320px] xl:p-6">
        <aside className="shell-panel flex flex-col gap-4 p-4">
          <div>
            <div className="label">Control Plane</div>
            <div className="mt-2 font-display text-3xl font-semibold leading-none text-white">Command Center</div>
            <p className="mt-3 text-sm leading-6 text-slate-400">
              Multi-agent execution, memory, providers, roadmap, and verification in one pane.
            </p>
          </div>
          <nav className="space-y-1">
            {navItems.map((item) => (
              ((item.to === '/admin/rbac' && !isAdmin) ||
              (item.to === '/skills' && !auth.enabled) ||
              (item.to === '/secrets' && (!auth.enabled || !isAdmin)) ||
              (item.to === '/stack' && (!auth.enabled || !isAdmin))) ? null : (
              <Link
                key={item.to}
                to={item.to as any}
                {...(item.params ? { params: item.params as any } : {})}
                className={`flex items-center justify-between rounded-xl border px-3 py-2 text-sm transition ${
                  isActive(item)
                    ? 'border-cyan-400/30 bg-cyan-400/10 text-cyan-100'
                    : 'border-transparent text-slate-300 hover:border-white/10 hover:bg-white/5'
                }`}
              >
                {item.label}
                {item.to === '/approvals' && openApprovals ? <Pill tone="warn">{openApprovals}</Pill> : null}
              </Link>
              )
            ))}
          </nav>
          <div className="rounded-xl border border-white/10 bg-white/5 p-3 text-sm">
            <div className="label">Theme</div>
            <div className="mt-2 flex items-center justify-between gap-3">
              <span className="text-slate-300">{themeMode === 'dark' ? 'Dark Matrix' : 'Light'}</span>
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
            <div className="rounded-xl border border-white/10 bg-white/5 p-3 text-sm">
              <div className="label">Session</div>
              {auth.principal ? (
                <div className="mt-2 space-y-2">
                  <div className="text-white">Logged in as {auth.principal.displayName}</div>
                  <div className="text-slate-400">{auth.principal.email}</div>
                  <div className="flex flex-wrap gap-1">
                    {auth.principal.roles.map((role) => (
                      <Pill key={role} tone="accent">{role}</Pill>
                    ))}
                  </div>
                  <Button variant="secondary" onClick={() => void authActions.logout()}>Log out</Button>
                </div>
              ) : (
                <div className="mt-2 space-y-2 text-slate-300">
                  <div>No active session</div>
                  <Link to="/login" className="text-cyan-300 underline underline-offset-4">Sign in</Link>
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
            <div className="rounded-xl border border-amber-400/30 bg-amber-400/10 p-3 text-sm text-amber-200">
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
