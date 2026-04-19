import { Link } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { Button, Panel, Pill, SectionHeading } from '@/components/common';
import { uiLocaleOptions, useLocale } from '@/i18n/locale';
import { useAppStore } from '@/store/app-store';
import { getThemeMode, onThemeChange, setThemeMode, toggleThemeMode, type ThemeMode } from '@/theme';

export function SettingsPage() {
  const { auth } = useAppStore();
  const {
    uiLocale,
    userOutputLocale,
    tenantOutputLocale,
    projectOutputLocale,
    setUiLocale,
    setUserOutputLocale,
    setTenantOutputLocale,
    setProjectOutputLocale
  } = useLocale();
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
        <SectionHeading title="Settings Transition" subtitle="Choose a clear domain before editing configuration" />
        <p className="text-sm text-[color:var(--muted)]">
          This page is now an orientation checkpoint. Use top navigation for Account, Tenant, and Platform domains instead of treating
          `settings/*` as a single flat hub.
        </p>
        <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
          <Link
            to={"/account/profile" as any}
            className="rounded-xl border border-white/10 bg-white/5 px-3 py-3 text-sm text-white transition hover:bg-white/10"
          >
            <div className="font-semibold">Account</div>
            <div className="mt-1 text-xs text-[color:var(--muted)]">Profile, preferences, desktop defaults.</div>
          </Link>
          <Link
            to={"/tenant/providers" as any}
            className={`rounded-xl border px-3 py-3 text-sm transition ${
              canManageTenant
                ? "border-white/10 bg-white/5 text-white hover:bg-white/10"
                : "cursor-not-allowed border-white/10 bg-white/5 text-[color:var(--muted)] pointer-events-none"
            }`}
          >
            <div className="font-semibold">Tenant</div>
            <div className="mt-1 text-xs text-[color:var(--muted)]">Users, providers, models, prompts, workers.</div>
          </Link>
          <Link
            to={"/platform/secrets" as any}
            className={`rounded-xl border px-3 py-3 text-sm transition ${
              isSystemOwner
                ? "border-white/10 bg-white/5 text-white hover:bg-white/10"
                : "cursor-not-allowed border-white/10 bg-white/5 text-[color:var(--muted)] pointer-events-none"
            }`}
          >
            <div className="font-semibold">Platform</div>
            <div className="mt-1 text-xs text-[color:var(--muted)]">Owner-only controls: secrets, RBAC, audit, stack.</div>
          </Link>
          <Link
            to={"/projects" as any}
            className="rounded-xl border border-white/10 bg-white/5 px-3 py-3 text-sm text-white transition hover:bg-white/10"
          >
            <div className="font-semibold">Projects</div>
            <div className="mt-1 text-xs text-[color:var(--muted)]">Back to project setup and daily operations.</div>
          </Link>
        </div>
      </Panel>

      <Panel>
        <SectionHeading title="Language Foundation" subtitle="UI language and output language fallbacks" />
        <p className="text-sm text-[color:var(--muted)]">
          Fallback chain for agent output is explicit: agent override {'->'} project {'->'} user {'->'} tenant {'->'} app default.
          UI language is independent from agent output language.
        </p>
        <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
          <label className="space-y-1 text-xs uppercase tracking-[0.08em] text-[color:var(--muted)]">
            UI language
            <select
              value={uiLocale}
              onChange={(event) => setUiLocale(event.target.value as typeof uiLocale)}
              className="w-full rounded-xl border border-white/10 bg-slate-950/40 px-3 py-2 text-sm normal-case tracking-normal text-white outline-none focus:border-cyan-400/40"
            >
              {uiLocaleOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-xs uppercase tracking-[0.08em] text-[color:var(--muted)]">
            User output language
            <select
              value={userOutputLocale}
              onChange={(event) => setUserOutputLocale(event.target.value as typeof userOutputLocale)}
              className="w-full rounded-xl border border-white/10 bg-slate-950/40 px-3 py-2 text-sm normal-case tracking-normal text-white outline-none focus:border-cyan-400/40"
            >
              {uiLocaleOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-xs uppercase tracking-[0.08em] text-[color:var(--muted)]">
            Tenant default language
            <select
              value={tenantOutputLocale}
              onChange={(event) => setTenantOutputLocale(event.target.value as typeof tenantOutputLocale)}
              className="w-full rounded-xl border border-white/10 bg-slate-950/40 px-3 py-2 text-sm normal-case tracking-normal text-white outline-none focus:border-cyan-400/40"
            >
              {uiLocaleOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-xs uppercase tracking-[0.08em] text-[color:var(--muted)]">
            Project default language
            <select
              value={projectOutputLocale}
              onChange={(event) => setProjectOutputLocale(event.target.value as typeof projectOutputLocale)}
              className="w-full rounded-xl border border-white/10 bg-slate-950/40 px-3 py-2 text-sm normal-case tracking-normal text-white outline-none focus:border-cyan-400/40"
            >
              {uiLocaleOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
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
