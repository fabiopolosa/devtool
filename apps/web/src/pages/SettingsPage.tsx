import { Link } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { Button, Panel, Pill, SectionHeading } from '@/components/common';
import { useAppStore } from '@/store/app-store';
import { getThemeMode, onThemeChange, setThemeMode, toggleThemeMode, type ThemeMode } from '@/theme';

export function SettingsPage() {
  const { auth } = useAppStore();
  const [themeMode, setThemeModeState] = useState<ThemeMode>(() => getThemeMode());
  const roleNames = auth.principal?.roles ?? [];
  const tenantRole = auth.principal?.tenantRole;
  const isSystemOwner = !auth.enabled || roleNames.includes('owner') || tenantRole === 'owner';
  const canManageTenant = !auth.enabled || isSystemOwner || roleNames.includes('admin') || tenantRole === 'admin';

  useEffect(() => {
    const mode = getThemeMode();
    setThemeMode(mode);
    setThemeModeState(mode);
    return onThemeChange(setThemeModeState);
  }, []);

  return (
    <div className="space-y-4">
      <Panel>
        <SectionHeading title="Settings" subtitle="Appearance and operator preferences" />
        <p className="text-sm text-[color:var(--muted)]">
          Platform settings are always visible. Access is tiered by role: project (all users), tenant (admin), system (owner).
        </p>
      </Panel>

      <Panel>
        <SectionHeading title="Project Tier" subtitle="Available to authenticated users" />
        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          {[
            { to: "/projects", label: "Projects" },
            { to: "/agents", label: "Agents" },
            { to: "/settings/skills", label: "Skills" }
          ].map((item) => (
            <Link
              key={item.to}
              to={item.to as any}
              className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white transition hover:bg-white/10"
            >
              {item.label}
            </Link>
          ))}
        </div>
      </Panel>

      <Panel>
        <SectionHeading title="Tenant Tier" subtitle="Admin / owner tenant controls" />
        {!canManageTenant ? (
          <p className="text-sm text-[color:var(--muted)]">Tenant controls require tenant role `admin|owner` (or system admin).</p>
        ) : null}
        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          {[
            { to: "/settings/providers", label: "Providers" },
            { to: "/settings/models", label: "Models" },
            { to: "/settings/users", label: "Users" },
            { to: "/settings/knowledge", label: "Knowledge" },
            { to: "/settings/pipelines", label: "Pipelines" },
            { to: "/settings/prompts", label: "Prompts" },
            { to: "/settings/workers", label: "Workers" },
            { to: "/settings/agents", label: "Agent Registry" },
            { to: "/settings/tenants", label: "Tenants" }
          ].map((item) => (
            <Link
              key={item.to}
              to={item.to as any}
              className={`rounded-xl border px-3 py-2 text-sm transition ${
                canManageTenant
                  ? "border-white/10 bg-white/5 text-white hover:bg-white/10"
                  : "cursor-not-allowed border-white/10 bg-white/5 text-[color:var(--muted)] pointer-events-none"
              }`}
            >
              {item.label}
            </Link>
          ))}
        </div>
      </Panel>

      <Panel>
        <SectionHeading title="System Tier" subtitle="Owner role required" />
        {!isSystemOwner ? (
          <p className="text-sm text-[color:var(--muted)]">System controls require owner role.</p>
        ) : null}
        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          {[
            { to: "/settings/secrets", label: "Secrets" },
            { to: "/settings/integrations", label: "Integrations" },
            { to: "/settings/rbac", label: "RBAC" },
            { to: "/settings/audit", label: "Audit" }
          ].map((item) => (
            <Link
              key={item.to}
              to={item.to as any}
              className={`rounded-xl border px-3 py-2 text-sm transition ${
                isSystemOwner
                  ? "border-white/10 bg-white/5 text-white hover:bg-white/10"
                  : "cursor-not-allowed border-white/10 bg-white/5 text-[color:var(--muted)] pointer-events-none"
              }`}
            >
              {item.label}
            </Link>
          ))}
        </div>
      </Panel>

      <Panel>
        <SectionHeading title="Theme" subtitle="Color system" />
        <div className="flex flex-wrap items-center justify-between gap-3 border border-[color:var(--line)] bg-[color:var(--panel2)] p-3">
          <div>
            <div className="text-sm text-[color:var(--text)]">Current mode</div>
            <div className="mt-1 text-xs uppercase tracking-[0.08em] text-[color:var(--muted)]">Saved in local storage and applied globally.</div>
          </div>
          <div className="flex items-center gap-2">
            <Pill tone={themeMode === 'dark' ? 'good' : 'accent'}>
              {themeMode === 'dark' ? 'Dark Matrix' : 'Light'}
            </Pill>
            <Button
              variant="primary"
              onClick={() => {
                const next = toggleThemeMode();
                setThemeModeState(next);
              }}
            >
              Toggle theme
            </Button>
          </div>
        </div>
      </Panel>

      <Panel>
        <SectionHeading title="System Access" subtitle="Derived from role (no manual toggle)" />
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border border-[color:var(--line)] bg-[color:var(--panel2)] p-3">
          <div>
            <div className="text-sm text-[color:var(--text)]">Role-based system controls</div>
            <div className="mt-1 text-xs uppercase tracking-[0.08em] text-[color:var(--muted)]">System routes are unlocked automatically only for owner users.</div>
          </div>
          <div className="flex items-center gap-2">
            <Pill tone={isSystemOwner ? 'good' : 'default'}>{isSystemOwner ? 'Owner' : 'Restricted'}</Pill>
          </div>
        </div>
      </Panel>
    </div>
  );
}
