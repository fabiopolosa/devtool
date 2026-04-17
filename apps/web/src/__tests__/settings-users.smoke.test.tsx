import { render, screen } from '@testing-library/react';
import { RouterProvider } from '@tanstack/react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { router } from '../router/router';
import { AppStoreProvider } from '../store/app-store';

const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' }
  });

describe('Settings users smoke', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    window.localStorage.clear();
  });

  it('renders users settings page and loads tenant users', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const raw = typeof input === 'string' ? input : input.toString();
        const url = raw.includes('://') ? new URL(raw) : new URL(raw, 'http://localhost');
        const path = `${url.pathname}${url.search}`;

        if (path === '/auth/users') {
          return jsonResponse({
            items: [
              {
                id: 'user_admin_001',
                email: 'admin@control-plane.local',
                displayName: 'Control Plane Admin',
                status: 'active',
                roles: ['admin'],
                tenantMembership: { tenantId: 'tenant_default', role: 'owner' },
                self: true
              }
            ]
          });
        }

        return jsonResponse({ items: [] });
      })
    );

    window.history.pushState({}, '', '/settings/users');
    await router.navigate({ to: '/settings/users' });

    render(
      <AppStoreProvider authEnabledOverride={false}>
        <RouterProvider router={router} />
      </AppStoreProvider>
    );

    expect(await screen.findByRole('heading', { name: 'User Management' })).toBeInTheDocument();
    expect(await screen.findByText('admin@control-plane.local')).toBeInTheDocument();
  });
});
