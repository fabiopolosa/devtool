import { useEffect, useState } from 'react';
import { Button, Panel, Pill, SectionHeading } from '@/components/common';
import { useAppStore } from '@/store/app-store';
import { getOwnerMode, onOwnerModeChange, setOwnerMode, toggleOwnerMode } from '@/owner-mode';
import { getThemeMode, onThemeChange, setThemeMode, toggleThemeMode, type ThemeMode } from '@/theme';

export function SettingsPage() {
  const { auth } = useAppStore();
  const [themeMode, setThemeModeState] = useState<ThemeMode>(() => getThemeMode());
  const [ownerMode, setOwnerModeState] = useState<boolean>(() => getOwnerMode());
  const canUseOwnerMode = !auth.enabled || Boolean(auth.principal?.roles.includes('admin'));

  useEffect(() => {
    const mode = getThemeMode();
    setThemeMode(mode);
    setThemeModeState(mode);
    return onThemeChange(setThemeModeState);
  }, []);

  useEffect(() => onOwnerModeChange(setOwnerModeState), []);

  useEffect(() => {
    if (!canUseOwnerMode && ownerMode) {
      setOwnerMode(false);
      setOwnerModeState(false);
    }
  }, [canUseOwnerMode, ownerMode]);

  return (
    <div className="space-y-4">
      <Panel>
        <SectionHeading title="Settings" subtitle="Appearance and operator preferences" />
        <p className="text-sm text-[color:var(--muted)]">
          Dark mode is default (Matrix-style). You can toggle at runtime without reloading the dashboard.
        </p>
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
        <SectionHeading title="Owner Mode" subtitle="Privileged operator navigation" />
        {!canUseOwnerMode ? (
          <p className="text-sm text-[color:var(--muted)]">Owner mode requires admin privileges when authentication is enabled.</p>
        ) : null}
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border border-[color:var(--line)] bg-[color:var(--panel2)] p-3">
          <div>
            <div className="text-sm text-[color:var(--text)]">Owner shortcuts</div>
            <div className="mt-1 text-xs uppercase tracking-[0.08em] text-[color:var(--muted)]">Shows provider, telemetry and tenants controls in the main sidebar.</div>
          </div>
          <div className="flex items-center gap-2">
            <Pill tone={ownerMode ? 'good' : 'default'}>{ownerMode ? 'Enabled' : 'Disabled'}</Pill>
            <Button
              variant="primary"
              onClick={() => {
                if (!canUseOwnerMode) return;
                const next = toggleOwnerMode();
                setOwnerModeState(next);
              }}
            >
              Toggle owner mode
            </Button>
          </div>
        </div>
      </Panel>
    </div>
  );
}
