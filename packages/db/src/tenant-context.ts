import { AsyncLocalStorage } from "node:async_hooks";

export interface TenantRequestContext {
  tenantId: string;
}

export const DEFAULT_TENANT_ID = "tenant_default";

const storage = new AsyncLocalStorage<TenantRequestContext>();

export const runWithTenantContext = async <T>(
  context: TenantRequestContext,
  fn: () => Promise<T>
): Promise<T> => storage.run(context, fn);

export const enterTenantContext = (context: TenantRequestContext): void => {
  storage.enterWith(context);
};

export const getTenantContext = (): TenantRequestContext | undefined => storage.getStore();

export const getCurrentTenantId = (): string | undefined => storage.getStore()?.tenantId;
