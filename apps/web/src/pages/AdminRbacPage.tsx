import { useCallback, useEffect, useMemo, useState } from 'react';
import type {
  DelegatedPermission,
  ProjectRoleBinding,
  RepositoryRoleBinding,
  Role
} from '@cp/domain';
import { Button, Input, Panel, Pill, SectionHeading } from '@/components/common';
import { useAppStore } from '@/store/app-store';

type AuditEventView = {
  id: string;
  action: string;
  status: 'success' | 'failure';
  occurredAt: string;
  resourceType: string;
  resourceId?: string;
};

export function AdminRbacPage() {
  const { auth, authActions } = useAppStore();
  const [roles, setRoles] = useState<Role[]>([]);
  const [auditEvents, setAuditEvents] = useState<AuditEventView[]>([]);
  const [projectBindings, setProjectBindings] = useState<ProjectRoleBinding[]>([]);
  const [repositoryBindings, setRepositoryBindings] = useState<RepositoryRoleBinding[]>([]);
  const [delegatedPermissions, setDelegatedPermissions] = useState<DelegatedPermission[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const [newRoleName, setNewRoleName] = useState<Role['name']>('editor');
  const [newRoleDescription, setNewRoleDescription] = useState('');
  const [newRolePermissions, setNewRolePermissions] = useState('project.read,project.write,task.read,task.write');
  const [permissionDrafts, setPermissionDrafts] = useState<Record<string, string>>({});

  const [projectBindingUserId, setProjectBindingUserId] = useState('user_viewer_001');
  const [projectBindingProjectId, setProjectBindingProjectId] = useState('proj_001');
  const [projectBindingRole, setProjectBindingRole] = useState<Role['name']>('editor');

  const [repositoryBindingUserId, setRepositoryBindingUserId] = useState('user_viewer_001');
  const [repositoryBindingRepositoryId, setRepositoryBindingRepositoryId] = useState('repo_001');
  const [repositoryBindingRole, setRepositoryBindingRole] = useState<Role['name']>('viewer');

  const [delegationUserId, setDelegationUserId] = useState('user_viewer_001');
  const [delegationPermission, setDelegationPermission] = useState('task.write');
  const [delegationScopeType, setDelegationScopeType] = useState<'global' | 'project' | 'repository'>('project');
  const [delegationScopeId, setDelegationScopeId] = useState('proj_001');
  const [delegationExpiresAt, setDelegationExpiresAt] = useState('2026-12-31T23:59:59.000Z');

  const isAdmin = auth.principal?.roles.includes('admin') ?? false;
  const roleOptions = useMemo(() => ['admin', 'editor', 'operator', 'viewer'] as const, []);

  const loadAdminData = useCallback(async () => {
    if (!auth.enabled || !isAdmin) return;
    setLoading(true);
    setError(undefined);
    try {
      const [rolesRes, eventsRes, projectBindingsRes, repositoryBindingsRes, delegatedPermissionsRes] = await Promise.all([
        authActions.apiFetch('/admin/roles'),
        authActions.apiFetch('/admin/audit-events'),
        authActions.apiFetch('/admin/project-role-bindings'),
        authActions.apiFetch('/admin/repository-role-bindings'),
        authActions.apiFetch('/admin/delegated-permissions')
      ]);

      if (!rolesRes.ok) throw new Error(`Unable to load roles: HTTP ${rolesRes.status}`);
      if (!eventsRes.ok) throw new Error(`Unable to load audit events: HTTP ${eventsRes.status}`);
      if (!projectBindingsRes.ok) throw new Error(`Unable to load project role bindings: HTTP ${projectBindingsRes.status}`);
      if (!repositoryBindingsRes.ok) throw new Error(`Unable to load repository role bindings: HTTP ${repositoryBindingsRes.status}`);
      if (!delegatedPermissionsRes.ok) throw new Error(`Unable to load delegated permissions: HTTP ${delegatedPermissionsRes.status}`);

      const roleBody = (await rolesRes.json()) as { items?: Role[] };
      const eventBody = (await eventsRes.json()) as { items?: AuditEventView[] };
      const projectBindingBody = (await projectBindingsRes.json()) as { items?: ProjectRoleBinding[] };
      const repositoryBindingBody = (await repositoryBindingsRes.json()) as { items?: RepositoryRoleBinding[] };
      const delegatedPermissionsBody = (await delegatedPermissionsRes.json()) as { items?: DelegatedPermission[] };

      const nextRoles = roleBody.items ?? [];
      setRoles(nextRoles);
      setAuditEvents(eventBody.items ?? []);
      setProjectBindings(projectBindingBody.items ?? []);
      setRepositoryBindings(repositoryBindingBody.items ?? []);
      setDelegatedPermissions(delegatedPermissionsBody.items ?? []);
      setPermissionDrafts(
        Object.fromEntries(nextRoles.map((role) => [role.id, role.permissions.join(',')]))
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load admin data');
    } finally {
      setLoading(false);
    }
  }, [auth.enabled, authActions, isAdmin]);

  useEffect(() => {
    void loadAdminData();
  }, [loadAdminData]);

  const createRole = async () => {
    if (!newRoleDescription.trim()) {
      setError('Role description is required.');
      return;
    }
    const permissions = newRolePermissions.split(',').map((entry) => entry.trim()).filter(Boolean);
    if (!permissions.length) {
      setError('Provide at least one permission.');
      return;
    }

    setLoading(true);
    setError(undefined);
    try {
      const response = await authActions.apiFetch('/admin/roles', {
        method: 'POST',
        body: JSON.stringify({
          name: newRoleName,
          description: newRoleDescription.trim(),
          permissions
        })
      });
      if (!response.ok) {
        throw new Error(`Unable to create role: HTTP ${response.status}`);
      }
      setNewRoleDescription('');
      await loadAdminData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create role');
    } finally {
      setLoading(false);
    }
  };

  const updateRolePermissions = async (roleId: string) => {
    const raw = permissionDrafts[roleId] ?? '';
    const permissions = raw.split(',').map((entry) => entry.trim()).filter(Boolean);
    if (!permissions.length) {
      setError('Permissions cannot be empty.');
      return;
    }

    setLoading(true);
    setError(undefined);
    try {
      const response = await authActions.apiFetch(`/admin/roles/${roleId}/permissions`, {
        method: 'PATCH',
        body: JSON.stringify({ permissions })
      });
      if (!response.ok) {
        throw new Error(`Unable to update role: HTTP ${response.status}`);
      }
      await loadAdminData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update role permissions');
    } finally {
      setLoading(false);
    }
  };

  const createProjectBinding = async () => {
    setLoading(true);
    setError(undefined);
    try {
      const response = await authActions.apiFetch('/admin/project-role-bindings', {
        method: 'POST',
        body: JSON.stringify({
          userId: projectBindingUserId.trim(),
          projectId: projectBindingProjectId.trim(),
          roleName: projectBindingRole
        })
      });
      if (!response.ok) {
        throw new Error(`Unable to create project role binding: HTTP ${response.status}`);
      }
      await loadAdminData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create project role binding');
    } finally {
      setLoading(false);
    }
  };

  const deleteProjectBinding = async (bindingId: string) => {
    setLoading(true);
    setError(undefined);
    try {
      const response = await authActions.apiFetch(`/admin/project-role-bindings/${bindingId}`, { method: 'DELETE' });
      if (!response.ok) {
        throw new Error(`Unable to delete project role binding: HTTP ${response.status}`);
      }
      await loadAdminData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete project role binding');
    } finally {
      setLoading(false);
    }
  };

  const createRepositoryBinding = async () => {
    setLoading(true);
    setError(undefined);
    try {
      const response = await authActions.apiFetch('/admin/repository-role-bindings', {
        method: 'POST',
        body: JSON.stringify({
          userId: repositoryBindingUserId.trim(),
          repositoryId: repositoryBindingRepositoryId.trim(),
          roleName: repositoryBindingRole
        })
      });
      if (!response.ok) {
        throw new Error(`Unable to create repository role binding: HTTP ${response.status}`);
      }
      await loadAdminData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create repository role binding');
    } finally {
      setLoading(false);
    }
  };

  const deleteRepositoryBinding = async (bindingId: string) => {
    setLoading(true);
    setError(undefined);
    try {
      const response = await authActions.apiFetch(`/admin/repository-role-bindings/${bindingId}`, { method: 'DELETE' });
      if (!response.ok) {
        throw new Error(`Unable to delete repository role binding: HTTP ${response.status}`);
      }
      await loadAdminData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete repository role binding');
    } finally {
      setLoading(false);
    }
  };

  const grantDelegatedPermission = async () => {
    if (!delegationPermission.trim()) {
      setError('Delegated permission is required.');
      return;
    }
    if (delegationScopeType !== 'global' && !delegationScopeId.trim()) {
      setError('Scope ID is required for project/repository delegation.');
      return;
    }
    if (!delegationExpiresAt.trim()) {
      setError('Delegation expiration is required.');
      return;
    }

    setLoading(true);
    setError(undefined);
    try {
      const response = await authActions.apiFetch('/admin/delegated-permissions', {
        method: 'POST',
        body: JSON.stringify({
          granteeUserId: delegationUserId.trim(),
          permission: delegationPermission.trim(),
          scopeType: delegationScopeType,
          ...(delegationScopeType !== 'global' ? { scopeId: delegationScopeId.trim() } : {}),
          expiresAt: delegationExpiresAt.trim()
        })
      });
      if (!response.ok) {
        throw new Error(`Unable to delegate permission: HTTP ${response.status}`);
      }
      await loadAdminData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delegate permission');
    } finally {
      setLoading(false);
    }
  };

  const revokeDelegatedPermission = async (delegatedPermissionId: string) => {
    setLoading(true);
    setError(undefined);
    try {
      const response = await authActions.apiFetch(`/admin/delegated-permissions/${delegatedPermissionId}/revoke`, {
        method: 'POST'
      });
      if (!response.ok) {
        throw new Error(`Unable to revoke delegated permission: HTTP ${response.status}`);
      }
      await loadAdminData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to revoke delegated permission');
    } finally {
      setLoading(false);
    }
  };

  if (!auth.enabled) {
    return (
      <Panel>
        <SectionHeading title="RBAC Administration" subtitle="Admin" />
        <p className="text-sm text-slate-300">
          Authentication is disabled (`VITE_AUTH_ENABLED=0`). Enable auth to manage roles and permissions.
        </p>
      </Panel>
    );
  }

  if (!isAdmin) {
    return (
      <Panel>
        <SectionHeading title="RBAC Administration" subtitle="Admin" />
        <p className="text-sm text-slate-300">Admin role required.</p>
      </Panel>
    );
  }

  return (
    <div className="space-y-5">
      <Panel>
        <SectionHeading title="Role Management" subtitle="Admin controls" />
        {error ? <p className="mb-3 text-sm text-rose-300">{error}</p> : null}
        <div className="grid gap-2 md:grid-cols-[140px_1fr_1fr_auto]">
          <select
            value={newRoleName}
            onChange={(event) => setNewRoleName(event.target.value as Role['name'])}
            className="rounded-xl border border-white/10 bg-slate-950/40 px-3 py-2 text-sm text-white outline-none focus:border-cyan-400/40"
          >
            {roleOptions.map((role) => (
              <option key={role} value={role}>{role}</option>
            ))}
          </select>
          <Input value={newRoleDescription} onChange={setNewRoleDescription} placeholder="Role description" />
          <Input value={newRolePermissions} onChange={setNewRolePermissions} placeholder="permission.one,permission.two" />
          <Button variant="primary" onClick={() => void createRole()}>Create/Ensure</Button>
        </div>
      </Panel>

      <Panel>
        <SectionHeading title="Roles" subtitle={loading ? 'Loading…' : 'Current definitions'} />
        <div className="space-y-3">
          {roles.map((role) => (
            <div key={role.id} className="rounded-xl border border-white/10 bg-white/5 p-3">
              <div className="flex items-center gap-2">
                <div className="font-medium text-white">{role.name}</div>
                {role.isSystem ? <Pill tone="accent">system</Pill> : null}
              </div>
              <div className="mt-1 text-sm text-slate-400">{role.description}</div>
              <div className="mt-3 flex flex-wrap gap-1">
                {role.permissions.map((permission) => (
                  <Pill key={`${role.id}:${permission}`}>{permission}</Pill>
                ))}
              </div>
              <div className="mt-3 grid gap-2 md:grid-cols-[1fr_auto]">
                <Input
                  value={permissionDrafts[role.id] ?? ''}
                  onChange={(value) => setPermissionDrafts((current) => ({ ...current, [role.id]: value }))}
                  placeholder="permission.one,permission.two"
                />
                <Button variant="secondary" onClick={() => void updateRolePermissions(role.id)}>
                  Save permissions
                </Button>
              </div>
            </div>
          ))}
        </div>
      </Panel>

      <Panel>
        <SectionHeading title="Project Role Bindings" subtitle="Scoped access at project level" />
        <div className="grid gap-2 md:grid-cols-[1fr_1fr_140px_auto]">
          <Input value={projectBindingUserId} onChange={setProjectBindingUserId} placeholder="user id" />
          <Input value={projectBindingProjectId} onChange={setProjectBindingProjectId} placeholder="project id" />
          <select
            value={projectBindingRole}
            onChange={(event) => setProjectBindingRole(event.target.value as Role['name'])}
            className="rounded-xl border border-white/10 bg-slate-950/40 px-3 py-2 text-sm text-white outline-none focus:border-cyan-400/40"
          >
            {roleOptions.map((role) => (
              <option key={`project-${role}`} value={role}>{role}</option>
            ))}
          </select>
          <Button variant="primary" onClick={() => void createProjectBinding()}>Add</Button>
        </div>
        <div className="mt-3 space-y-2 text-sm">
          {projectBindings.map((binding) => (
            <div key={binding.id} className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-3 py-2">
              <div className="text-slate-300">
                user <span className="text-white">{binding.userId}</span> {'->'} project <span className="text-white">{binding.projectId}</span> (role {binding.roleId})
              </div>
              <Button variant="ghost" onClick={() => void deleteProjectBinding(binding.id)}>Remove</Button>
            </div>
          ))}
        </div>
      </Panel>

      <Panel>
        <SectionHeading title="Repository Role Bindings" subtitle="Scoped access at repository level" />
        <div className="grid gap-2 md:grid-cols-[1fr_1fr_140px_auto]">
          <Input value={repositoryBindingUserId} onChange={setRepositoryBindingUserId} placeholder="user id" />
          <Input value={repositoryBindingRepositoryId} onChange={setRepositoryBindingRepositoryId} placeholder="repository id" />
          <select
            value={repositoryBindingRole}
            onChange={(event) => setRepositoryBindingRole(event.target.value as Role['name'])}
            className="rounded-xl border border-white/10 bg-slate-950/40 px-3 py-2 text-sm text-white outline-none focus:border-cyan-400/40"
          >
            {roleOptions.map((role) => (
              <option key={`repository-${role}`} value={role}>{role}</option>
            ))}
          </select>
          <Button variant="primary" onClick={() => void createRepositoryBinding()}>Add</Button>
        </div>
        <div className="mt-3 space-y-2 text-sm">
          {repositoryBindings.map((binding) => (
            <div key={binding.id} className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-3 py-2">
              <div className="text-slate-300">
                user <span className="text-white">{binding.userId}</span> {'->'} repository <span className="text-white">{binding.repositoryId}</span> (role {binding.roleId})
              </div>
              <Button variant="ghost" onClick={() => void deleteRepositoryBinding(binding.id)}>Remove</Button>
            </div>
          ))}
        </div>
      </Panel>

      <Panel>
        <SectionHeading title="Delegated Permissions" subtitle="Temporary delegated rights" />
        <div className="grid gap-2 md:grid-cols-[1fr_1fr_140px_1fr_1fr_auto]">
          <Input value={delegationUserId} onChange={setDelegationUserId} placeholder="grantee user id" />
          <Input value={delegationPermission} onChange={setDelegationPermission} placeholder="permission (e.g. task.write)" />
          <select
            value={delegationScopeType}
            onChange={(event) => setDelegationScopeType(event.target.value as 'global' | 'project' | 'repository')}
            className="rounded-xl border border-white/10 bg-slate-950/40 px-3 py-2 text-sm text-white outline-none focus:border-cyan-400/40"
          >
            <option value="global">global</option>
            <option value="project">project</option>
            <option value="repository">repository</option>
          </select>
          <Input
            value={delegationScopeId}
            onChange={setDelegationScopeId}
            placeholder={delegationScopeType === 'global' ? 'scope id not required' : `${delegationScopeType} id`}
          />
          <Input value={delegationExpiresAt} onChange={setDelegationExpiresAt} placeholder="expires at ISO" />
          <Button variant="primary" onClick={() => void grantDelegatedPermission()}>Grant</Button>
        </div>
        <div className="mt-3 space-y-2 text-sm">
          {delegatedPermissions.map((entry) => (
            <div key={entry.id} className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-3 py-2">
              <div className="text-slate-300">
                {entry.permission} {'->'} {entry.granteeUserId} ({entry.scopeType}{entry.scopeId ? `:${entry.scopeId}` : ''}) until {new Date(entry.expiresAt).toLocaleString()}
                {entry.revokedAt ? <span className="ml-2 text-rose-300">(revoked)</span> : null}
              </div>
              {!entry.revokedAt ? (
                <Button variant="ghost" onClick={() => void revokeDelegatedPermission(entry.id)}>Revoke</Button>
              ) : null}
            </div>
          ))}
        </div>
      </Panel>

      <Panel>
        <SectionHeading title="Audit Trail" subtitle="Recent auth/admin actions" />
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="text-slate-400">
              <tr>
                <th className="py-2 pr-3">Time</th>
                <th className="py-2 pr-3">Action</th>
                <th className="py-2 pr-3">Resource</th>
                <th className="py-2 pr-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {auditEvents.map((event) => (
                <tr key={event.id} className="border-t border-white/10 text-slate-300">
                  <td className="py-2 pr-3">{new Date(event.occurredAt).toLocaleString()}</td>
                  <td className="py-2 pr-3">{event.action}</td>
                  <td className="py-2 pr-3">{event.resourceType}{event.resourceId ? `:${event.resourceId}` : ''}</td>
                  <td className="py-2 pr-3">
                    <Pill tone={event.status === 'success' ? 'good' : 'bad'}>{event.status}</Pill>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}
