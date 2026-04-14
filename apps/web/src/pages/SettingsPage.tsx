import { useEffect, useState } from 'react';
import { Button, Panel, Pill, SectionHeading } from '@/components/common';
import { getThemeMode, onThemeChange, setThemeMode, toggleThemeMode, type ThemeMode } from '@/theme';

export function SettingsPage() {
  const [themeMode, setThemeModeState] = useState<ThemeMode>(() => getThemeMode());

  useEffect(() => {
    const mode = getThemeMode();
    setThemeMode(mode);
    setThemeModeState(mode);
    return onThemeChange(setThemeModeState);
  }, []);

  return (
    <div className="space-y-5">
      <Panel>
        <SectionHeading title="Settings" subtitle="Appearance and operator preferences" />
        <p className="text-sm text-slate-300">
          Dark mode is default (Matrix-style). You can toggle at runtime without reloading the dashboard.
        </p>
      </Panel>

      <Panel>
        <SectionHeading title="Theme" subtitle="Color system" />
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/5 p-3">
          <div>
            <div className="text-sm text-white">Current mode</div>
            <div className="mt-1 text-xs text-slate-400">Saved in local storage and applied globally.</div>
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
    </div>
  );
}
