import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
import { Button, Input, Panel, Pill, SectionHeading } from '@/components/common';
import { useAppStore } from '@/store/app-store';

const parseFlag = (value: string | undefined, defaultValue = false): boolean => {
  if (value === undefined) return defaultValue;
  const normalized = value.trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes';
};

export function LoginPage() {
  const navigate = useNavigate();
  const { auth, authActions } = useAppStore();
  const completeOidcCallback = authActions.completeOidcCallback;
  const apiFetch = authActions.apiFetch;
  const [email, setEmail] = useState('admin@control-plane.local');
  const [password, setPassword] = useState('admin123!');
  const [busy, setBusy] = useState(false);
  const [oidcBusy, setOidcBusy] = useState(false);
  const [oidcError, setOidcError] = useState<string | undefined>();
  const oidcEnabled = parseFlag(import.meta.env.VITE_AUTH_OIDC_ENABLED, false);

  useEffect(() => {
    if (!auth.enabled) return;
    if (typeof window === 'undefined') return;

    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const state = params.get('state');
    if (!code || !state) return;

    let cancelled = false;
    setOidcBusy(true);
    void completeOidcCallback(code, state).then(async (result) => {
      if (cancelled) return;
      setOidcBusy(false);
      if (result.ok) {
        window.history.replaceState({}, '', window.location.pathname);
        await navigate({ to: '/' });
      } else {
        setOidcError(result.error ?? 'OIDC authentication failed');
      }
    });

    return () => {
      cancelled = true;
    };
  }, [auth.enabled, completeOidcCallback, navigate]);

  useEffect(() => {
    if (!auth.enabled) return;
    if (auth.loading) return;
    if (auth.required) return;
    if (!auth.principal) return;
    void navigate({ to: '/' });
  }, [auth.enabled, auth.loading, auth.principal, auth.required, navigate]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!auth.enabled) return;
    setBusy(true);
    const result = await authActions.login(email, password);
    setBusy(false);
    if (result.ok) {
      await navigate({ to: '/' });
    }
  };

  const startOidc = async () => {
    if (!auth.enabled || !oidcEnabled) return;
    setOidcBusy(true);
    setOidcError(undefined);
    try {
      const response = await apiFetch('/auth/oidc/start');
      const body = (await response.json()) as {
        item?: { authorizationUrl?: string };
        message?: string;
      };
      if (!response.ok || !body.item?.authorizationUrl) {
        setOidcBusy(false);
        setOidcError(body.message ?? `Unable to start OIDC flow (HTTP ${response.status})`);
        return;
      }
      window.location.assign(body.item.authorizationUrl);
    } catch (error) {
      setOidcBusy(false);
      setOidcError(error instanceof Error ? error.message : 'Unable to start OIDC flow');
    }
  };

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <Panel>
        <SectionHeading title="Sign In" subtitle="Authentication" />
        {!auth.enabled ? (
          <div className="space-y-3 text-sm text-slate-300">
            <Pill tone="warn">Auth disabled</Pill>
            <p>
              Authentication is currently disabled. Set <code>VITE_AUTH_ENABLED=1</code> to enable session login in the dashboard.
            </p>
            <div>
              <Link to="/" className="text-cyan-300 underline underline-offset-4">Return to dashboard</Link>
            </div>
          </div>
        ) : (
          <form className="space-y-3" onSubmit={handleSubmit}>
            <label className="block text-sm text-slate-300">
              Email
              <div className="mt-1">
                <Input value={email} onChange={setEmail} placeholder="admin@control-plane.local" />
              </div>
            </label>
            <label className="block text-sm text-slate-300">
              Password
              <div className="mt-1">
                <input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="••••••••"
                  className="w-full rounded-xl border border-white/10 bg-slate-950/40 px-3 py-2 text-sm text-white outline-none placeholder:text-slate-500 focus:border-cyan-400/40"
                />
              </div>
            </label>
            {auth.error ? <p className="text-sm text-rose-300">{auth.error}</p> : null}
            {oidcError ? <p className="text-sm text-rose-300">{oidcError}</p> : null}
            <div className="flex items-center gap-2">
              <Button type="submit" variant="primary">
                {busy || auth.loading ? 'Signing in…' : 'Sign in'}
              </Button>
              {oidcEnabled ? (
                <Button type="button" variant="secondary" onClick={() => void startOidc()}>
                  {oidcBusy ? 'Redirecting…' : 'Sign in with OIDC'}
                </Button>
              ) : null}
              <Button type="button" variant="ghost" onClick={() => authActions.clearError()}>
                Clear status
              </Button>
            </div>
          </form>
        )}
      </Panel>
    </div>
  );
}
