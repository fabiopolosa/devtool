import { createContext, useContext, useEffect, useMemo, useState, type PropsWithChildren, type ReactElement } from 'react';

export type LocaleCode = 'en-US' | 'it-IT' | 'es-ES' | 'fr-FR' | 'de-DE';

export const uiLocaleOptions: Array<{ value: LocaleCode; label: string }> = [
  { value: 'en-US', label: 'English (US)' },
  { value: 'it-IT', label: 'Italiano' },
  { value: 'es-ES', label: 'Español' },
  { value: 'fr-FR', label: 'Français' },
  { value: 'de-DE', label: 'Deutsch' }
];

const uiLocaleStorageKey = 'cp_ui_locale';
const userOutputLocaleStorageKey = 'cp_user_output_locale';
const tenantOutputLocaleStorageKey = 'cp_tenant_output_locale';
const projectOutputLocaleStorageKey = 'cp_project_output_locale';

const supportedLocaleSet = new Set(uiLocaleOptions.map((option) => option.value));

const normalizeLocale = (value: string | null | undefined, fallback: LocaleCode): LocaleCode => {
  if (!value) return fallback;
  const normalized = value.trim();
  return supportedLocaleSet.has(normalized as LocaleCode) ? (normalized as LocaleCode) : fallback;
};

const detectBrowserLocale = (): LocaleCode => {
  if (typeof window === 'undefined') return 'en-US';
  return normalizeLocale(window.navigator.language, 'en-US');
};

const readStorageLocale = (key: string, fallback: LocaleCode): LocaleCode => {
  if (typeof window === 'undefined') return fallback;
  return normalizeLocale(window.localStorage.getItem(key), fallback);
};

const writeStorageLocale = (key: string, value: LocaleCode): void => {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(key, value);
};

export type LocaleState = {
  uiLocale: LocaleCode;
  userOutputLocale: LocaleCode;
  tenantOutputLocale: LocaleCode;
  projectOutputLocale: LocaleCode;
};

export type LocaleContextValue = LocaleState & {
  setUiLocale: (next: LocaleCode) => void;
  setUserOutputLocale: (next: LocaleCode) => void;
  setTenantOutputLocale: (next: LocaleCode) => void;
  setProjectOutputLocale: (next: LocaleCode) => void;
};

const defaultLocaleState: LocaleState = {
  uiLocale: 'en-US',
  userOutputLocale: 'en-US',
  tenantOutputLocale: 'en-US',
  projectOutputLocale: 'en-US'
};

const localeContext = createContext<LocaleContextValue>({
  ...defaultLocaleState,
  setUiLocale: () => undefined,
  setUserOutputLocale: () => undefined,
  setTenantOutputLocale: () => undefined,
  setProjectOutputLocale: () => undefined
});

export const resolveOutputLocale = (input: {
  agentLocale?: LocaleCode | undefined;
  projectLocale?: LocaleCode | undefined;
  userLocale?: LocaleCode | undefined;
  tenantLocale?: LocaleCode | undefined;
  appLocale?: LocaleCode | undefined;
}): LocaleCode => {
  return (
    input.agentLocale
    ?? input.projectLocale
    ?? input.userLocale
    ?? input.tenantLocale
    ?? input.appLocale
    ?? 'en-US'
  );
};

export const LocaleProvider = ({ children }: PropsWithChildren): ReactElement => {
  const detected = detectBrowserLocale();
  const [uiLocale, setUiLocaleState] = useState<LocaleCode>(() => readStorageLocale(uiLocaleStorageKey, detected));
  const [userOutputLocale, setUserOutputLocaleState] = useState<LocaleCode>(() =>
    readStorageLocale(userOutputLocaleStorageKey, detected)
  );
  const [tenantOutputLocale, setTenantOutputLocaleState] = useState<LocaleCode>(() =>
    readStorageLocale(tenantOutputLocaleStorageKey, detected)
  );
  const [projectOutputLocale, setProjectOutputLocaleState] = useState<LocaleCode>(() =>
    readStorageLocale(projectOutputLocaleStorageKey, detected)
  );

  useEffect(() => {
    writeStorageLocale(uiLocaleStorageKey, uiLocale);
    if (typeof document !== 'undefined') {
      document.documentElement.lang = uiLocale;
    }
  }, [uiLocale]);

  useEffect(() => {
    writeStorageLocale(userOutputLocaleStorageKey, userOutputLocale);
  }, [userOutputLocale]);

  useEffect(() => {
    writeStorageLocale(tenantOutputLocaleStorageKey, tenantOutputLocale);
  }, [tenantOutputLocale]);

  useEffect(() => {
    writeStorageLocale(projectOutputLocaleStorageKey, projectOutputLocale);
  }, [projectOutputLocale]);

  useEffect(() => {
    if (typeof window === 'undefined') return () => undefined;
    const onStorage = (event: StorageEvent): void => {
      if (event.key === uiLocaleStorageKey) {
        setUiLocaleState(normalizeLocale(event.newValue, detected));
      }
      if (event.key === userOutputLocaleStorageKey) {
        setUserOutputLocaleState(normalizeLocale(event.newValue, detected));
      }
      if (event.key === tenantOutputLocaleStorageKey) {
        setTenantOutputLocaleState(normalizeLocale(event.newValue, detected));
      }
      if (event.key === projectOutputLocaleStorageKey) {
        setProjectOutputLocaleState(normalizeLocale(event.newValue, detected));
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [detected]);

  const value = useMemo<LocaleContextValue>(
    () => ({
      uiLocale,
      userOutputLocale,
      tenantOutputLocale,
      projectOutputLocale,
      setUiLocale: setUiLocaleState,
      setUserOutputLocale: setUserOutputLocaleState,
      setTenantOutputLocale: setTenantOutputLocaleState,
      setProjectOutputLocale: setProjectOutputLocaleState
    }),
    [projectOutputLocale, tenantOutputLocale, uiLocale, userOutputLocale]
  );

  return <localeContext.Provider value={value}>{children}</localeContext.Provider>;
};

export const useLocale = (): LocaleContextValue => useContext(localeContext);
