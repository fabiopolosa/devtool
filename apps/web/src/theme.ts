export type ThemeMode = "dark" | "light";

const storageKey = "cp_theme_mode";
const eventName = "cp-theme-changed";

export const getThemeMode = (): ThemeMode => {
  if (typeof window === "undefined") return "dark";
  const stored = window.localStorage.getItem(storageKey);
  if (stored === "light" || stored === "dark") {
    return stored;
  }
  return "dark";
};

export const setThemeMode = (mode: ThemeMode): void => {
  if (typeof document !== "undefined") {
    document.documentElement.dataset.theme = mode;
  }
  if (typeof window !== "undefined") {
    window.localStorage.setItem(storageKey, mode);
    window.dispatchEvent(new CustomEvent(eventName, { detail: { mode } }));
  }
};

export const toggleThemeMode = (): ThemeMode => {
  const next: ThemeMode = getThemeMode() === "dark" ? "light" : "dark";
  setThemeMode(next);
  return next;
};

export const onThemeChange = (callback: (mode: ThemeMode) => void): (() => void) => {
  if (typeof window === "undefined") {
    return () => {};
  }
  const handler = (event: Event) => {
    const custom = event as CustomEvent<{ mode?: ThemeMode }>;
    callback(custom.detail?.mode === "light" ? "light" : "dark");
  };
  window.addEventListener(eventName, handler);
  return () => window.removeEventListener(eventName, handler);
};
