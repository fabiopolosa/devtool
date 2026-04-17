import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, Input, Panel, Pill, SectionHeading } from '@/components/common';
import { useAppStore } from '@/store/app-store';

type TenantRole = 'owner' | 'admin' | 'manager' | 'user' | 'guest';
type GlobalRole = 'admin' | 'editor' | 'operator' | 'viewer';

type UserRow = {
  id: string;
  email: string;
  displayName: string;
  status: string;
  lastLoginAt?: string;
  roles?: string[];
  tenantMembership?: {
    tenantId: string;
    role: TenantRole;
  } | null;
  self?: boolean;
};

type UsersListResponse = {
  items?: UserRow[];
  message?: string;
};

type UserMutationResponse = {
  item?: UserRow;
  message?: string;
};

const tenantRoleOptions: TenantRole[] = ['owner', 'admin', 'manager', 'user', 'guest'];
const globalRoleOptions: GlobalRole[] = ['admin', 'editor', 'operator', 'viewer'];

const prettyDate = (value?: string): string => {
  if (!value) return 'Never';
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return value;
  return new Date(parsed).toLocaleString();
};

export function SettingsUsersPage() {
  const { auth, authActions } = useAppStore();

  const roleNames = auth.principal?.roles ?? [];
  const tenantRole = auth.principal?.tenantRole;
  const isSystemOwner = !auth.enabled || roleNames.includes('owner') || tenantRole === 'owner';
  const canManage =
    !auth.enabled ||
    isSystemOwner ||
    roleNames.includes('admin') ||
    tenantRole === 'admin';

  const [items, setItems] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [notice, setNotice] = useState<string | undefined>();

  const [createEmail, setCreateEmail] = useState('');
  const [createDisplayName, setCreateDisplayName] = useState('');
  const [createPassword, setCreatePassword] = useState('');
  const [createRole, setCreateRole] = useState<GlobalRole>('viewer');
  const [createTenantRole, setCreateTenantRole] = useState<TenantRole>('user');

  const [pendingRoleByUser, setPendingRoleByUser] = useState<Record<string, GlobalRole>>({});
  const [pendingTenantRoleByUser, setPendingTenantRoleByUser] = useState<Record<string, TenantRole>>({});

  const loadUsers = useCallback(async (): Promise<void> => {
    if (!canManage) {
      setItems([]);
      return;
    }
    setLoading(true);
    setError(undefined);
    try {
      const { response, body } = await authActions.apiFetchJson<UsersListResponse>('/auth/users');
      if (!response.ok) {
        throw new Error(body.message ?? `Unable to load users (HTTP ${response.status})`);
      }
      const next = body.items ?? [];
      setItems(next);
      setPendingRoleByUser((current) => {
        const nextMap: Record<string, GlobalRole> = {};
        for (const row of next) {
          const fallback = (row.roles?.[0] as GlobalRole | undefined) ?? 'viewer';
          nextMap[row.id] = current[row.id] ?? fallback;
        }
        return nextMap;
      });
      setPendingTenantRoleByUser((current) => {
        const nextMap: Record<string, TenantRole> = {};
        for (const row of next) {
          const fallback = row.tenantMembership?.role ?? 'user';
          nextMap[row.id] = current[row.id] ?? fallback;
        }
        return nextMap;
      });
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load users.');
    } finally {
      setLoading(false);
    }
  }, [authActions, canManage]);

  useEffect(() => {
    void loadUsers();
  }, [loadUsers]);

  const selfProfile = useMemo(() => {
    if (!auth.principal) return null;
    return {
      userId: auth.principal.userId,
      displayName: auth.principal.displayName,
      email: auth.principal.email,
      roles: auth.principal.roles,
      tenantRole: auth.principal.tenantRole ?? 'unknown'
    };
  }, [auth.principal]);

  const createUser = async (): Promise<void> => {
    if (!canManage || saving) return;
    const email = createEmail.trim().toLowerCase();
    const displayName = createDisplayName.trim();
    if (!email || !displayName || !createPassword.trim()) {
      setError('email, display name and password are required.');
      return;
    }

    setSaving(true);
    setError(undefined);
    setNotice(undefined);
    try {
      const { response, body } = await authActions.apiFetchJson<UserMutationResponse>('/auth/users', {
        method: 'POST',
        body: JSON.stringify({
          email,
          displayName,
          password: createPassword,
          roles: [createRole],
          tenantRole: createTenantRole
        })
      });
      if (!response.ok) {
        throw new Error(body.message ?? `Unable to create user (HTTP ${response.status})`);
      }
      setCreateEmail('');
      setCreateDisplayName('');
      setCreatePassword('');
      setCreateRole('viewer');
      setCreateTenantRole('user');
      setNotice('User created successfully.');
      await loadUsers();
    } catch (mutationError) {
      setError(mutationError instanceof Error ? mutationError.message : 'Unable to create user.');
    } finally {
      setSaving(false);
    }
  };

  const assignRole = async (userId: string): Promise<void> => {
    if (!canManage || saving) return;
    const role = pendingRoleByUser[userId] ?? 'viewer';
    setSaving(true);
    setError(undefined);
    setNotice(undefined);
    try {
      const { response, body } = await authActions.apiFetchJson<{ message?: string }>(`/auth/users/${userId}/roles`, {
        method: 'POST',
        body: JSON.stringify({ roles: [role] })
      });
      if (!response.ok) {
        throw new Error(body.message ?? `Unable to assign role (HTTP ${response.status})`);
      }
      setNotice(`Role ${role} assigned.`);
      await loadUsers();
    } catch (mutationError) {
      setError(mutationError instanceof Error ? mutationError.message : 'Unable to assign role.');
    } finally {
      setSaving(false);
    }
  };

  const assignTenantRole = async (userId: string): Promise<void> => {
    if (!canManage || saving) return;
    const role = pendingTenantRoleByUser[userId] ?? 'user';
    setSaving(true);
    setError(undefined);
    setNotice(undefined);
    try {
      const { response, body } = await authActions.apiFetchJson<{ message?: string }>(
        `/auth/users/${userId}/tenant-membership`,
        {
          method: 'PUT',
          body: JSON.stringify({ role })
        }
      );
      if (!response.ok) {
        throw new Error(body.message ?? `Unable to update tenant membership (HTTP ${response.status})`);
      }
      setNotice(`Tenant role updated to ${role}.`);
      await loadUsers();
    } catch (mutationError) {
      setError(
        mutationError instanceof Error
          ? mutationError.message
          : 'Unable to update tenant membership.'
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <Panel>
        <SectionHeading title="User Management" subtitle="Tenant-scoped users, roles, memberships" />
        <p className="text-sm text-[color:var(--muted)]">
          Manage users for the current tenant, assign global roles, and control tenant membership from one place.
        </p>
        {!canManage ? (
          <div className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
            Tenant user management requires tenant role `admin|owner`.
          </div>
        ) : null}
      </Panel>

      <Panel>
        <SectionHeading title="My Profile" subtitle="Current session identity" />
        {!selfProfile ? (
          <p className="text-sm text-[color:var(--muted)]">Sign in to see your profile.</p>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-xl border border-[color:var(--line)] bg-[color:var(--panel2)] p-3">
              <div className="label">User</div>
              <div className="mt-1 text-sm text-[color:var(--text)]">{selfProfile.displayName}</div>
              <div className="mt-1 text-xs text-[color:var(--muted)]">{selfProfile.userId}</div>
            </div>
            <div className="rounded-xl border border-[color:var(--line)] bg-[color:var(--panel2)] p-3">
              <div className="label">Email</div>
              <div className="mt-1 text-sm text-[color:var(--text)]">{selfProfile.email}</div>
            </div>
            <div className="rounded-xl border border-[color:var(--line)] bg-[color:var(--panel2)] p-3">
              <div className="label">Global Roles</div>
              <div className="mt-2 flex flex-wrap gap-2">
                {selfProfile.roles.length === 0 ? <Pill tone="default">none</Pill> : null}
                {selfProfile.roles.map((role) => (
                  <Pill key={role} tone="accent">{role}</Pill>
                ))}
              </div>
            </div>
            <div className="rounded-xl border border-[color:var(--line)] bg-[color:var(--panel2)] p-3">
              <div className="label">Tenant Role</div>
              <div className="mt-2">
                <Pill tone={selfProfile.tenantRole === 'owner' ? 'good' : 'default'}>{selfProfile.tenantRole}</Pill>
              </div>
            </div>
          </div>
        )}
      </Panel>

      <Panel>
        <SectionHeading title="Create User" subtitle="Add user with role + tenant membership" />
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <Input value={createEmail} onChange={setCreateEmail} placeholder="email@example.com" />
          <Input value={createDisplayName} onChange={setCreateDisplayName} placeholder="Display name" />
          <input
            type="password"
            value={createPassword}
            onChange={(event) => setCreatePassword(event.target.value)}
            placeholder="Temporary password"
            className="cp-input"
          />
          <select
            className="cp-input"
            value={createRole}
            onChange={(event) => setCreateRole(event.target.value as GlobalRole)}
          >
            {globalRoleOptions.map((role) => (
              <option key={role} value={role}>{role}</option>
            ))}
          </select>
          <select
            className="cp-input"
            value={createTenantRole}
            onChange={(event) => setCreateTenantRole(event.target.value as TenantRole)}
          >
            {tenantRoleOptions.map((role) => (
              <option key={role} value={role}>{role}</option>
            ))}
          </select>
        </div>
        <div className="mt-3">
          <Button variant="primary" onClick={() => void createUser()}>
            {saving ? 'Saving...' : 'Create user'}
          </Button>
        </div>
      </Panel>

      <Panel>
        <SectionHeading title="Tenant Users" subtitle="Roles and membership controls" />
        {error ? <div className="mb-3 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">{error}</div> : null}
        {notice ? <div className="mb-3 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">{notice}</div> : null}

        {loading ? <p className="text-sm text-[color:var(--muted)]">Loading users...</p> : null}
        {!loading && items.length === 0 ? <p className="text-sm text-[color:var(--muted)]">No users in current tenant.</p> : null}

        <div className="space-y-3">
          {items.map((item) => (
            <div key={item.id} className="rounded-xl border border-[color:var(--line)] bg-[color:var(--panel2)] p-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-[color:var(--text)]">{item.displayName}</div>
                  <div className="text-xs text-[color:var(--muted)]">{item.email}</div>
                  <div className="mt-1 text-xs text-[color:var(--muted)]">Last login: {prettyDate(item.lastLoginAt)}</div>
                </div>
                <div className="flex items-center gap-2">
                  <Pill tone={item.status === 'active' ? 'good' : 'warn'}>{item.status}</Pill>
                  {item.self ? <Pill tone="accent">You</Pill> : null}
                </div>
              </div>

              <div className="mt-3 grid gap-3 lg:grid-cols-2">
                <div className="rounded-lg border border-[color:var(--line)] bg-[color:var(--panel)] p-3">
                  <div className="label">Global roles</div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {(item.roles ?? []).length === 0 ? <Pill tone="default">none</Pill> : null}
                    {(item.roles ?? []).map((role) => (
                      <Pill key={`${item.id}-${role}`} tone="accent">{role}</Pill>
                    ))}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <select
                      className="cp-input min-w-[180px]"
                      value={pendingRoleByUser[item.id] ?? 'viewer'}
                      onChange={(event) =>
                        setPendingRoleByUser((current) => ({
                          ...current,
                          [item.id]: event.target.value as GlobalRole
                        }))
                      }
                    >
                      {globalRoleOptions.map((role) => (
                        <option key={role} value={role}>{role}</option>
                      ))}
                    </select>
                    <Button variant="secondary" onClick={() => void assignRole(item.id)}>
                      Add role
                    </Button>
                  </div>
                </div>

                <div className="rounded-lg border border-[color:var(--line)] bg-[color:var(--panel)] p-3">
                  <div className="label">Tenant membership</div>
                  <div className="mt-2 text-sm text-[color:var(--text)]">
                    {item.tenantMembership ? `${item.tenantMembership.tenantId} · ${item.tenantMembership.role}` : 'Not assigned'}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <select
                      className="cp-input min-w-[180px]"
                      value={pendingTenantRoleByUser[item.id] ?? 'user'}
                      onChange={(event) =>
                        setPendingTenantRoleByUser((current) => ({
                          ...current,
                          [item.id]: event.target.value as TenantRole
                        }))
                      }
                    >
                      {tenantRoleOptions.map((role) => (
                        <option key={role} value={role}>{role}</option>
                      ))}
                    </select>
                    <Button variant="secondary" onClick={() => void assignTenantRole(item.id)}>
                      Set tenant role
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}
