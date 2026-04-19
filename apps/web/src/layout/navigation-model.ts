import type { Project } from '@cp/domain';

export type VisualDomain = 'home' | 'project' | 'account' | 'tenant' | 'platform';

export type ContextNavItem = {
  id: string;
  label: string;
  to: string;
  params?: Record<string, string> | undefined;
  badge?: string | undefined;
  tone?: 'warn' | 'good';
};

export type BreadcrumbItem = {
  id: string;
  label: string;
  to?: string | undefined;
  params?: Record<string, string> | undefined;
};

const projectSectionLabels: Record<string, string> = {
  overview: 'Overview',
  setup: 'Setup',
  workspace: 'Workspace',
  agents: 'Agents',
  runs: 'Runs',
  knowledge: 'Knowledge',
  onboarding: 'Setup',
  coding: 'Workspace',
  context: 'Knowledge',
  monitoring: 'Runs',
  observability: 'Runs',
  ruflo: 'Runs',
  pipelines: 'Runs',
  tasks: 'Runs',
  approvals: 'Runs',
  experiments: 'Runs',
  repositories: 'Workspace',
  roadmap: 'Overview',
  memory: 'Knowledge'
};

const accountPaths = new Set([
  '/account/profile',
  '/account/preferences',
  '/account/providers',
  '/account/desktop',
  '/settings',
  '/settings/skills',
  '/settings/runtime',
  '/settings/mcp',
  '/settings/usage',
  '/settings/local-repos',
  '/settings/agents',
  '/settings/agents/new'
]);

const tenantPaths = new Set([
  '/tenant/users',
  '/tenant/providers',
  '/tenant/models',
  '/tenant/knowledge',
  '/tenant/prompts',
  '/tenant/workers',
  '/providers',
  '/settings/providers',
  '/settings/models',
  '/settings/users',
  '/settings/knowledge',
  '/settings/prompts',
  '/settings/pipelines',
  '/settings/workers',
  '/settings/machines'
]);

const platformPaths = new Set([
  '/platform/tenants',
  '/platform/secrets',
  '/platform/integrations',
  '/platform/rbac',
  '/platform/audit',
  '/platform/database',
  '/platform/stack',
  '/platform/versioning',
  '/settings/tenants',
  '/settings/secrets',
  '/settings/integrations',
  '/settings/rbac',
  '/settings/audit',
  '/settings/database',
  '/settings/stack',
  '/settings/versioning'
]);

const settingsLabelByPath: Record<string, string> = {
  '/account/profile': 'Profile',
  '/account/preferences': 'Preferences',
  '/account/providers': 'Providers',
  '/account/desktop': 'Desktop',
  '/tenant/users': 'Users',
  '/tenant/providers': 'Providers',
  '/tenant/models': 'Models',
  '/tenant/knowledge': 'Knowledge',
  '/tenant/prompts': 'Prompts',
  '/tenant/workers': 'Workers',
  '/platform/tenants': 'Tenants',
  '/platform/secrets': 'Secrets',
  '/platform/integrations': 'Integrations',
  '/platform/rbac': 'RBAC',
  '/platform/audit': 'Audit',
  '/platform/database': 'Database',
  '/platform/stack': 'Stack',
  '/platform/versioning': 'Versioning',
  '/settings': 'Profile & Preferences',
  '/settings/providers': 'Providers',
  '/settings/models': 'Models',
  '/settings/users': 'Users',
  '/settings/knowledge': 'Knowledge',
  '/settings/prompts': 'Prompts',
  '/settings/pipelines': 'Pipelines',
  '/settings/workers': 'Workers',
  '/settings/machines': 'Workers',
  '/settings/tenants': 'Tenants',
  '/settings/secrets': 'Secrets',
  '/settings/integrations': 'Integrations',
  '/settings/rbac': 'RBAC',
  '/settings/audit': 'Audit',
  '/settings/database': 'Database',
  '/settings/stack': 'Stack',
  '/settings/versioning': 'Versioning',
  '/settings/runtime': 'Runtime',
  '/settings/mcp': 'MCP',
  '/settings/usage': 'Usage',
  '/settings/skills': 'Skills',
  '/settings/local-repos': 'Desktop',
  '/settings/agents': 'Agent Registry',
  '/providers': 'Providers',
  '/activity': 'Activity',
  '/projects': 'Projects',
  '/projects/new': 'New Project',
  '/agents': 'Agents',
  '/help': 'Help'
};

const toTitle = (value: string): string =>
  value
    .split('-')
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(' ');

const resolveProjectPathInfo = (pathname: string): { projectId: string; section?: string; detail?: string } | undefined => {
  const segments = pathname.split('/').filter(Boolean);
  if (segments[0] === 'project' && segments[1]) {
    return {
      projectId: segments[1],
      ...(segments[2] ? { section: segments[2] } : {}),
      ...(segments[3] ? { detail: segments[3] } : {})
    };
  }
  if (segments[0] === 'projects' && segments[1] && segments[1] !== 'new') {
    return {
      projectId: segments[1],
      ...(segments[2] ? { section: segments[2] } : {}),
      ...(segments[3] ? { detail: segments[3] } : {})
    };
  }
  return undefined;
};

export const extractProjectRouteContext = (
  pathname: string
): { projectId: string; section?: string; detail?: string } | undefined => resolveProjectPathInfo(pathname);

export const resolveVisualDomain = (pathname: string): VisualDomain => {
  if (resolveProjectPathInfo(pathname)) return 'project';
  if (platformPaths.has(pathname)) return 'platform';
  if (tenantPaths.has(pathname)) return 'tenant';
  if (
    accountPaths.has(pathname)
    || pathname.startsWith('/settings/agents/')
  ) {
    return 'account';
  }
  if (pathname.startsWith('/account/')) return 'account';
  if (pathname.startsWith('/tenant/')) return 'tenant';
  if (pathname.startsWith('/platform/')) return 'platform';
  if (pathname.startsWith('/settings/')) return 'account';
  return 'home';
};

export const domainLabel = (domain: VisualDomain): string => {
  if (domain === 'project') return 'Project';
  if (domain === 'account') return 'Account';
  if (domain === 'tenant') return 'Tenant';
  if (domain === 'platform') return 'Platform';
  return 'Home';
};

export const projectSidebarItems = (input: {
  projectId: string;
  setupRequired: boolean;
  queueBadge?: string;
}): ContextNavItem[] => [
  {
    id: 'project-overview',
    label: 'Overview',
    to: '/projects/$projectId/overview',
    params: { projectId: input.projectId }
  },
  {
    id: 'project-setup',
    label: 'Setup',
    to: '/projects/$projectId/setup',
    params: { projectId: input.projectId },
    badge: input.setupRequired ? 'Required' : 'Ready',
    tone: input.setupRequired ? 'warn' : 'good'
  },
  {
    id: 'project-workspace',
    label: 'Workspace',
    to: '/projects/$projectId/workspace',
    params: { projectId: input.projectId }
  },
  {
    id: 'project-agents',
    label: 'Agents',
    to: '/projects/$projectId/agents',
    params: { projectId: input.projectId }
  },
  {
    id: 'project-runs',
    label: 'Runs',
    to: '/projects/$projectId/runs',
    params: { projectId: input.projectId },
    ...(input.queueBadge ? { badge: input.queueBadge } : {})
  },
  {
    id: 'project-knowledge',
    label: 'Knowledge',
    to: '/projects/$projectId/knowledge',
    params: { projectId: input.projectId }
  }
];

export const accountSidebarItems = (): ContextNavItem[] => [
  { id: 'account-profile', label: 'Profile', to: '/account/profile' },
  { id: 'account-preferences', label: 'Preferences', to: '/account/preferences' },
  { id: 'account-providers', label: 'Providers', to: '/account/providers' },
  { id: 'account-desktop', label: 'Desktop', to: '/account/desktop' }
];

export const tenantSidebarItems = (): ContextNavItem[] => [
  { id: 'tenant-users', label: 'Users', to: '/tenant/users' },
  { id: 'tenant-providers', label: 'Providers', to: '/tenant/providers' },
  { id: 'tenant-models', label: 'Models', to: '/tenant/models' },
  { id: 'tenant-knowledge', label: 'Knowledge', to: '/tenant/knowledge' },
  { id: 'tenant-prompts', label: 'Prompts', to: '/tenant/prompts' },
  { id: 'tenant-workers', label: 'Workers', to: '/tenant/workers' }
];

export const platformSidebarItems = (): ContextNavItem[] => [
  { id: 'platform-tenants', label: 'Tenants', to: '/platform/tenants' },
  { id: 'platform-secrets', label: 'Secrets', to: '/platform/secrets' },
  { id: 'platform-integrations', label: 'Integrations', to: '/platform/integrations' },
  { id: 'platform-rbac', label: 'RBAC', to: '/platform/rbac' },
  { id: 'platform-audit', label: 'Audit', to: '/platform/audit' },
  { id: 'platform-database', label: 'Database', to: '/platform/database' },
  { id: 'platform-stack', label: 'Stack', to: '/platform/stack' },
  { id: 'platform-versioning', label: 'Versioning', to: '/platform/versioning' }
];

export const homeSidebarItems = (): ContextNavItem[] => [
  { id: 'home-overview', label: 'Overview', to: '/' },
  { id: 'home-projects', label: 'Projects', to: '/projects' },
  { id: 'home-activity', label: 'Activity', to: '/activity' },
  { id: 'home-agents', label: 'Agents', to: '/agents' }
];

const resolveSettingsLabel = (pathname: string): string => {
  if (settingsLabelByPath[pathname]) return settingsLabelByPath[pathname];
  const segments = pathname.split('/').filter(Boolean);
  if (!segments[0]) return 'Home';
  if (segments[0] !== 'settings' && segments[0] !== 'account' && segments[0] !== 'tenant' && segments[0] !== 'platform') {
    return settingsLabelByPath[pathname] ?? toTitle(segments[0]);
  }
  const section = segments[1];
  if (!section) {
    if (segments[0] === 'account') return 'Profile';
    if (segments[0] === 'tenant') return 'Providers';
    if (segments[0] === 'platform') return 'Tenants';
    return 'Profile & Preferences';
  }
  return toTitle(section);
};

export const routeLabelFromPath = (pathname: string): string => {
  const projectPath = resolveProjectPathInfo(pathname);
  if (projectPath) {
    const section = projectPath.section;
    if (!section) return 'Overview';
    return projectSectionLabels[section] ?? toTitle(section);
  }
  return resolveSettingsLabel(pathname);
};

export const buildBreadcrumb = (input: {
  pathname: string;
  selectedProject?: Project | undefined;
}): BreadcrumbItem[] => {
  const { pathname, selectedProject } = input;
  if (pathname === '/') {
    return [{ id: 'crumb-home', label: 'Home' }];
  }

  const projectPath = resolveProjectPathInfo(pathname);
  if (projectPath) {
    const crumbs: BreadcrumbItem[] = [
      { id: 'crumb-projects', label: 'Projects', to: '/projects' },
      {
        id: 'crumb-project',
        label: selectedProject?.name ?? projectPath.projectId,
        to: '/projects/$projectId/overview',
        params: { projectId: projectPath.projectId }
      }
    ];

    if (projectPath.section) {
      const sectionLabel = projectSectionLabels[projectPath.section] ?? toTitle(projectPath.section);
      crumbs.push({
        id: `crumb-section-${projectPath.section}`,
        label: sectionLabel,
        to: `/projects/$projectId/${projectPath.section}`,
        params: { projectId: projectPath.projectId }
      });
    }

    if (projectPath.detail) {
      crumbs.push({ id: 'crumb-detail', label: toTitle(projectPath.detail) });
    }

    const compact = crumbs.slice(0, 4);
    const last = compact[compact.length - 1];
    if (last) {
      compact[compact.length - 1] = { id: last.id, label: last.label };
    }
    return compact;
  }

  const domain = resolveVisualDomain(pathname);
  const rootLabel = domainLabel(domain);
  const rootTo =
    domain === 'account'
      ? '/account/profile'
      : domain === 'tenant'
        ? '/tenant/providers'
        : domain === 'platform'
          ? '/platform/tenants'
          : '/';

  const leafLabel = resolveSettingsLabel(pathname);
  if (leafLabel === rootLabel || pathname === rootTo) {
    return [{ id: 'crumb-root', label: rootLabel }];
  }

  return [
    { id: 'crumb-root', label: rootLabel, to: rootTo },
    { id: 'crumb-leaf', label: leafLabel }
  ];
};

export const resolveProjectIdFromPath = (pathname: string): string | undefined =>
  resolveProjectPathInfo(pathname)?.projectId;
