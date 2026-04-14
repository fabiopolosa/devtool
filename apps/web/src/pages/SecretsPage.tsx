import { useCallback, useEffect, useState } from 'react';
import type { SecretConfig, SecretScope } from '@cp/domain';
import { Button, Input, Panel, Pill, SectionHeading } from '@/components/common';
import { useAppStore } from '@/store/app-store';

const secretScopes: SecretScope[] = ['global', 'project', 'repository', 'provider', 'environment'];

type SecretCreatePayload = {
  name: string;
  description: string;
  value: string;
  scope: SecretScope;
};

export function SecretsPage() {
  const { auth, authActions } = useAppStore();
  const [items, setItems] = useState<SecretConfig[]>([]);
  const [revealedValues, setRevealedValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [form, setForm] = useState<SecretCreatePayload>({
    name: '',
    description: '',
    value: '',
    scope: 'global'
  });

  const isAdmin = auth.enabled && Boolean(auth.principal?.roles.includes('admin'));

  const loadSecrets = useCallback(async () => {
    setLoading(true);
    setError(undefined);
    try {
      const response = await authActions.apiFetch('/secrets');
      const body = (await response.json()) as { items?: SecretConfig[]; message?: string };
      if (!response.ok) {
        throw new Error(body.message ?? `Unable to load secrets (HTTP ${response.status})`);
      }
      setItems(body.items ?? []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load secrets');
    } finally {
      setLoading(false);
    }
  }, [authActions]);

  useEffect(() => {
    if (!auth.enabled || !isAdmin) return;
    void loadSecrets();
  }, [auth.enabled, isAdmin, loadSecrets]);

  const createSecret = async (): Promise<void> => {
    if (!form.name.trim() || !form.description.trim() || !form.value.trim()) {
      setError('Name, description and value are required.');
      return;
    }

    setSaving(true);
    setError(undefined);
    try {
      const response = await authActions.apiFetch('/secrets', {
        method: 'POST',
        body: JSON.stringify(form)
      });
      const body = (await response.json()) as { item?: SecretConfig; message?: string };
      if (!response.ok || !body.item) {
        throw new Error(body.message ?? `Unable to create secret (HTTP ${response.status})`);
      }
      setForm({ name: '', description: '', value: '', scope: form.scope });
      await loadSecrets();
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : 'Unable to create secret');
    } finally {
      setSaving(false);
    }
  };

  const revealSecret = async (secretId: string): Promise<void> => {
    setError(undefined);
    try {
      const response = await authActions.apiFetch(`/secrets/${secretId}/reveal`);
      const body = (await response.json()) as { value?: string; message?: string };
      if (!response.ok || body.value === undefined) {
        throw new Error(body.message ?? `Unable to reveal secret (HTTP ${response.status})`);
      }
      setRevealedValues((current) => ({
        ...current,
        [secretId]: body.value ?? ''
      }));
    } catch (revealError) {
      setError(revealError instanceof Error ? revealError.message : 'Unable to reveal secret');
    }
  };

  const deleteSecret = async (secretId: string): Promise<void> => {
    setError(undefined);
    try {
      const response = await authActions.apiFetch(`/secrets/${secretId}`, {
        method: 'DELETE'
      });
      if (!response.ok) {
        const body = (await response.json()) as { message?: string };
        throw new Error(body.message ?? `Unable to delete secret (HTTP ${response.status})`);
      }
      setRevealedValues((current) => {
        const next = { ...current };
        delete next[secretId];
        return next;
      });
      await loadSecrets();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Unable to delete secret');
    }
  };

  if (!auth.enabled || !isAdmin) {
    return (
      <Panel>
        <SectionHeading title="Secrets" subtitle="Privileged" />
        <p className="text-sm text-slate-300">
          Secrets management is available only for authenticated admins.
        </p>
      </Panel>
    );
  }

  return (
    <div className="space-y-5">
      <Panel>
        <SectionHeading title="Secrets" subtitle="Encrypted at rest (AES-GCM)" />
        <p className="text-sm text-slate-300">
          Values are encrypted server-side and redacted by default. Use reveal only when operationally required.
        </p>
        {error ? <p className="mt-3 text-sm text-rose-300">{error}</p> : null}
      </Panel>

      <Panel>
        <SectionHeading title="Create Secret" subtitle="Control-plane secret registry" />
        <div className="grid gap-2 md:grid-cols-2">
          <Input
            value={form.name}
            onChange={(value) => setForm((current) => ({ ...current, name: value }))}
            placeholder="SECRET_NAME"
          />
          <select
            value={form.scope}
            onChange={(event) => setForm((current) => ({ ...current, scope: event.target.value as SecretScope }))}
            className="rounded-xl border border-white/10 bg-slate-950/40 px-3 py-2 text-sm text-white outline-none focus:border-cyan-400/40"
          >
            {secretScopes.map((scope) => (
              <option key={scope} value={scope}>
                {scope}
              </option>
            ))}
          </select>
        </div>
        <div className="mt-2">
          <Input
            value={form.description}
            onChange={(value) => setForm((current) => ({ ...current, description: value }))}
            placeholder="What this secret is used for"
          />
        </div>
        <div className="mt-2">
          <input
            type="password"
            value={form.value}
            onChange={(event) => setForm((current) => ({ ...current, value: event.target.value }))}
            placeholder="Secret value"
            className="w-full rounded-xl border border-white/10 bg-slate-950/40 px-3 py-2 text-sm text-white outline-none placeholder:text-slate-500 focus:border-cyan-400/40"
          />
        </div>
        <div className="mt-3 flex justify-end">
          <Button variant="primary" onClick={() => void createSecret()}>
            {saving ? 'Saving...' : 'Create secret'}
          </Button>
        </div>
      </Panel>

      <Panel>
        <SectionHeading
          title="Secret Registry"
          subtitle={loading ? 'Loading...' : `${items.length} entries`}
          action={
            <Button variant="secondary" onClick={() => void loadSecrets()}>
              Refresh
            </Button>
          }
        />
        <div className="space-y-3">
          {items.map((item) => (
            <div key={item.id} className="rounded-xl border border-white/10 bg-white/5 p-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="font-medium text-white">{item.name}</div>
                  <div className="text-xs text-slate-400">{item.description}</div>
                </div>
                <Pill tone="accent">{item.scope}</Pill>
              </div>
              <div className="mt-2 rounded-lg border border-emerald-400/20 bg-emerald-400/5 px-3 py-2 text-xs text-emerald-200">
                {revealedValues[item.id] ?? item.encryptedValue}
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button variant="secondary" onClick={() => void revealSecret(item.id)}>
                  Reveal
                </Button>
                <Button onClick={() => void deleteSecret(item.id)}>Delete</Button>
              </div>
            </div>
          ))}
          {!loading && items.length === 0 ? (
            <p className="text-sm text-slate-400">No secrets configured yet.</p>
          ) : null}
        </div>
      </Panel>
    </div>
  );
}
