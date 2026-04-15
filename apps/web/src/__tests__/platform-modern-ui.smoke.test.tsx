import { render, screen } from '@testing-library/react';
import { RouterProvider } from '@tanstack/react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { router } from '../router/router';
import { AppStoreProvider } from '../store/app-store';

const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' }
  });

const installFetchMock = () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const raw = typeof input === 'string' ? input : input.toString();
      const url = raw.includes('://') ? new URL(raw) : new URL(raw, 'http://localhost');
      const path = `${url.pathname}${url.search}`;

      if (path.startsWith('/schema-docs')) {
        return jsonResponse({
          items: [
            {
              id: 'schema_doc_001',
              title: 'Main DB',
              description: 'schema',
              databaseName: 'devtool',
              dialect: 'postgresql',
              tables: [
                {
                  tableName: 'projects',
                  schemaName: 'public',
                  columns: [
                    { name: 'id', dataType: 'text', nullable: false },
                    { name: 'name', dataType: 'text', nullable: false }
                  ],
                  primaryKeyColumns: ['id']
                }
              ],
              conventions: [{ key: 'Naming', value: 'snake_case' }],
              stackNotes: ['Fastify + Drizzle'],
              lastIntrospectedAt: '2026-04-14T10:00:00.000Z',
              createdAt: '2026-04-14T10:00:00.000Z',
              createdBy: 'test',
              updatedAt: '2026-04-14T10:00:00.000Z',
              updatedBy: 'test'
            }
          ]
        });
      }

      if (path === '/local-repos') {
        return jsonResponse({
          items: [
            {
              id: 'lrepo_001',
              name: 'devtool',
              rootPath: '/Users/andromeda/devtool',
              description: 'workspace',
              status: 'active',
              detectedGit: true,
              currentBranch: 'main',
              indexedFileCount: 120,
              createdAt: '2026-04-14T10:00:00.000Z',
              createdBy: 'test',
              updatedAt: '2026-04-14T10:00:00.000Z',
              updatedBy: 'test'
            }
          ]
        });
      }

      if (path.startsWith('/local-repos/lrepo_001/files')) {
        return jsonResponse({
          items: [
            { name: 'README.md', relativePath: 'README.md', kind: 'file', sizeBytes: 1200 }
          ]
        });
      }

      if (path.startsWith('/local-repos/lrepo_001/file')) {
        return jsonResponse({
          item: { content: '# README', truncated: false }
        });
      }

      if (path.startsWith('/local-repos/lrepo_001/history')) {
        return jsonResponse({
          items: [
            { sha: 'abc123def456', author: 'dev', date: '2026-04-14', subject: 'Init' }
          ]
        });
      }

      if (path.startsWith('/versioning/snapshots')) {
        return jsonResponse({
          items: [
            {
              id: 'snap_001',
              localRepositoryId: 'lrepo_001',
              label: 'before',
              trigger: 'manual',
              files: [{ path: 'README.md', contentHash: 'hash1', content: '# README' }],
              metadata: {},
              createdAt: '2026-04-14T10:00:00.000Z',
              createdBy: 'test',
              updatedAt: '2026-04-14T10:00:00.000Z',
              updatedBy: 'test'
            },
            {
              id: 'snap_002',
              localRepositoryId: 'lrepo_001',
              label: 'after',
              trigger: 'manual',
              files: [{ path: 'README.md', contentHash: 'hash2', content: '# README updated' }],
              metadata: {},
              createdAt: '2026-04-14T11:00:00.000Z',
              createdBy: 'test',
              updatedAt: '2026-04-14T11:00:00.000Z',
              updatedBy: 'test'
            }
          ]
        });
      }

      if (path.startsWith('/versioning/diff')) {
        return jsonResponse({
          item: {
            leftSnapshotId: 'snap_001',
            rightSnapshotId: 'snap_002',
            added: [],
            removed: [],
            changed: [{ path: 'README.md', beforeHash: 'hash1', afterHash: 'hash2' }]
          }
        });
      }

      return jsonResponse({ items: [] });
    })
  );
};

describe('Modern platform pages smoke', () => {
  beforeEach(() => {
    window.localStorage.setItem('cp_owner_mode', '1');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    window.localStorage.clear();
  });

  it('renders Secrets page guard when auth is disabled', async () => {
    installFetchMock();
    window.history.pushState({}, '', '/settings/secrets');
    await router.navigate({ to: '/settings/secrets' });

    render(
      <AppStoreProvider authEnabledOverride={false}>
        <RouterProvider router={router} />
      </AppStoreProvider>
    );

    expect(await screen.findByRole('heading', { name: 'Secrets' })).toBeInTheDocument();
    expect(screen.getByText(/authenticated admins/i)).toBeInTheDocument();
  });

  it('renders Database page', async () => {
    installFetchMock();
    window.history.pushState({}, '', '/settings/database');
    await router.navigate({ to: '/settings/database' });

    render(
      <AppStoreProvider authEnabledOverride={false}>
        <RouterProvider router={router} />
      </AppStoreProvider>
    );

    expect(await screen.findByRole('heading', { name: 'Database' })).toBeInTheDocument();
    expect(await screen.findByText('ER Diagram')).toBeInTheDocument();
  });

  it('renders Stack page guard when auth is disabled', async () => {
    installFetchMock();
    window.history.pushState({}, '', '/settings/stack');
    await router.navigate({ to: '/settings/stack' });

    render(
      <AppStoreProvider authEnabledOverride={false}>
        <RouterProvider router={router} />
      </AppStoreProvider>
    );

    expect(await screen.findByRole('heading', { name: 'Stack & Machines' })).toBeInTheDocument();
    expect(screen.getByText(/authenticated admins/i)).toBeInTheDocument();
  });

  it('renders Local Repos page', async () => {
    installFetchMock();
    window.history.pushState({}, '', '/settings/local-repos');
    await router.navigate({ to: '/settings/local-repos' });

    render(
      <AppStoreProvider authEnabledOverride={false}>
        <RouterProvider router={router} />
      </AppStoreProvider>
    );

    expect(await screen.findByRole('heading', { name: 'Local Repos' })).toBeInTheDocument();
    expect(await screen.findByText(/Repository Registry/i)).toBeInTheDocument();
  });

  it('renders Versioning page', async () => {
    installFetchMock();
    window.history.pushState({}, '', '/settings/versioning');
    await router.navigate({ to: '/settings/versioning' });

    render(
      <AppStoreProvider authEnabledOverride={false}>
        <RouterProvider router={router} />
      </AppStoreProvider>
    );

    expect(await screen.findByRole('heading', { name: 'Versioning' })).toBeInTheDocument();
    expect(await screen.findByText('Snapshot History')).toBeInTheDocument();
  });

  it('renders Settings page', async () => {
    installFetchMock();
    window.history.pushState({}, '', '/settings');
    await router.navigate({ to: '/settings' });

    render(
      <AppStoreProvider authEnabledOverride={false}>
        <RouterProvider router={router} />
      </AppStoreProvider>
    );

    expect(await screen.findByRole('heading', { name: 'Settings' })).toBeInTheDocument();
    expect(await screen.findByText('Toggle theme')).toBeInTheDocument();
  });
});
