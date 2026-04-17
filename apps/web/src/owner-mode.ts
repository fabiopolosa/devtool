export type OwnerMode = boolean;

const ownerModeStorageKey = "cp_owner_mode";
const ownerModeEvent = "cp:owner-mode";

const parseFlag = (value: string | null): boolean => {
  if (value === null) return false;
  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
};

const defaultOwnerMode = (): boolean => {
  const explicit = (import.meta.env.VITE_OWNER_MODE_DEFAULT as string | undefined) ?? "";
  if (explicit.trim().length > 0) {
    return parseFlag(explicit);
  }
  const mode = ((import.meta.env.MODE as string | undefined) ?? "").trim().toLowerCase();
  if (mode === "test") return true;
  return Boolean(import.meta.env.DEV);
};

export const getOwnerMode = (): OwnerMode => {
  if (typeof window === "undefined") return false;
  const stored = window.localStorage.getItem(ownerModeStorageKey);
  if (stored === null) return defaultOwnerMode();
  return parseFlag(stored);
};

export const setOwnerMode = (enabled: OwnerMode): OwnerMode => {
  if (typeof window === "undefined") return enabled;
  window.localStorage.setItem(ownerModeStorageKey, enabled ? "1" : "0");
  window.dispatchEvent(new CustomEvent(ownerModeEvent, { detail: enabled }));
  return enabled;
};

export const toggleOwnerMode = (): OwnerMode => setOwnerMode(!getOwnerMode());

export const onOwnerModeChange = (listener: (enabled: OwnerMode) => void): (() => void) => {
  if (typeof window === "undefined") return () => undefined;
  const onStorage = (event: StorageEvent): void => {
    if (event.key === ownerModeStorageKey) {
      listener(parseFlag(event.newValue));
    }
  };
  const onCustomEvent = (event: Event): void => {
    const detail = (event as CustomEvent<boolean>).detail;
    listener(Boolean(detail));
  };
  window.addEventListener("storage", onStorage);
  window.addEventListener(ownerModeEvent, onCustomEvent);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(ownerModeEvent, onCustomEvent);
  };
};
