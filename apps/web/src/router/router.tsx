import { createRootRoute, createRoute, createRouter } from '@tanstack/react-router';
import { AppShell } from '@/layout/AppShell';
import { DashboardPage } from '@/pages/DashboardPage';
import { ActivityPage } from '@/pages/ActivityPage';
import { ProjectsPage } from '@/pages/ProjectsPage';
import { ProjectDetailPage } from '@/pages/ProjectDetailPage';
import { ProjectOnboardingPage } from '@/pages/ProjectOnboardingPage';
import { ProjectTasksPage } from '@/pages/ProjectTasksPage';
import { ProjectPipelinesPage } from '@/pages/ProjectPipelinesPage';
import { RepositoriesPage } from '@/pages/RepositoriesPage';
import { RoadmapPage } from '@/pages/RoadmapPage';
import { TaskDetailPage } from '@/pages/TaskDetailPage';
import { RunDetailPage } from '@/pages/RunDetailPage';
import { MemoryPage } from '@/pages/MemoryPage';
import { KnowledgePage } from '@/pages/KnowledgePage';
import { RetrievalPage } from '@/pages/RetrievalPage';
import { ArtifactsPage } from '@/pages/ArtifactsPage';
import { ApprovalsPage } from '@/pages/ApprovalsPage';
import { ExperimentsPage } from '@/pages/ExperimentsPage';
import { ChatPage } from '@/pages/ChatPage';
import { BrainstormingPage } from '@/pages/BrainstormingPage';
import { BrainstormPlanPage } from '@/pages/BrainstormPlanPage';
import { ProvidersPage } from '@/pages/ProvidersPage';
import { LoginPage } from '@/pages/LoginPage';
import { AdminRbacPage } from '@/pages/AdminRbacPage';
import { SkillsPage } from '@/pages/SkillsPage';
import { AgentsListPage } from '@/pages/AgentsListPage';
import { AgentDetailPage } from '@/pages/AgentDetailPage';
import { AgentCreatePage } from '@/pages/AgentCreatePage';
import { RuntimePage } from '@/pages/RuntimePage';
import { McpPage } from '@/pages/McpPage';
import { SecretsPage } from '@/pages/SecretsPage';
import { DatabasePage } from '@/pages/DatabasePage';
import { StackPage } from '@/pages/StackPage';
import { LocalReposPage } from '@/pages/LocalReposPage';
import { VersioningPage } from '@/pages/VersioningPage';
import { CodingWorkflowPage } from '@/pages/CodingWorkflowPage';
import { ContextPage } from '@/pages/ContextPage';
import { SettingsPage } from '@/pages/SettingsPage';
import { SettingsProvidersPage } from '@/pages/SettingsProvidersPage';
import { ModelsPage } from '@/pages/ModelsPage';
import { SettingsKnowledgePage } from '@/pages/SettingsKnowledgePage';
import { SettingsPromptsPage } from '@/pages/SettingsPromptsPage';
import { SettingsUsersPage } from '@/pages/SettingsUsersPage';
import { WorkersPage } from '@/pages/WorkersPage';
import { HelpPage } from '@/pages/HelpPage';

const rootRoute = createRootRoute({
  component: AppShell
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: DashboardPage
});

const projectsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'projects',
  component: ProjectsPage
});

const projectsNewRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'projects/new',
  component: ProjectsPage
});

const canonicalProjectOverviewRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'projects/$projectId/overview',
  component: ProjectDetailPage
});

const canonicalProjectDefaultRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'projects/$projectId',
  component: ProjectDetailPage
});

const canonicalProjectSetupRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'projects/$projectId/setup',
  component: ProjectOnboardingPage
});

const canonicalProjectWorkspaceRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'projects/$projectId/workspace',
  component: CodingWorkflowPage
});

const canonicalProjectWorkspaceContextRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'projects/$projectId/workspace/context',
  component: ContextPage
});

const canonicalProjectAgentsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'projects/$projectId/agents',
  component: AgentsListPage
});

const canonicalProjectRunsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'projects/$projectId/runs',
  component: RuntimePage
});

const canonicalProjectKnowledgeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'projects/$projectId/knowledge',
  component: KnowledgePage
});

const activityRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'activity',
  component: ActivityPage
});

const projectWorkspaceRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'project/$projectId',
  component: ProjectDetailPage
});

const projectOnboardingRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'project/$projectId/onboarding',
  component: ProjectOnboardingPage
});

const projectTasksListRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'project/$projectId/tasks',
  component: ProjectTasksPage
});

const projectPipelinesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'project/$projectId/pipelines',
  component: ProjectPipelinesPage
});

const projectAgentsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'project/$projectId/agents',
  component: AgentsListPage
});

const projectMonitoringRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'project/$projectId/monitoring',
  component: RuntimePage
});

const projectSchemasRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'project/$projectId/schemas',
  component: DatabasePage
});

const projectObservabilityRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'project/$projectId/observability',
  component: RuntimePage
});

const projectCodingRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'project/$projectId/coding',
  component: CodingWorkflowPage
});

const projectContextRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'project/$projectId/context',
  component: ContextPage
});

const projectRepositoriesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'project/$projectId/repositories',
  component: RepositoriesPage
});

const projectRoadmapRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'project/$projectId/roadmap',
  component: RoadmapPage
});

const projectTaskRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'project/$projectId/tasks/$taskId',
  component: TaskDetailPage
});

const projectRunRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'project/$projectId/runs/$runId',
  component: RunDetailPage
});

const projectMemoryRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'project/$projectId/memory',
  component: MemoryPage
});

const projectKnowledgeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'project/$projectId/knowledge',
  component: KnowledgePage
});

const projectRetrievalRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'project/$projectId/retrieval/$runId',
  component: RetrievalPage
});

const projectArtifactsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'project/$projectId/artifacts/$runId',
  component: ArtifactsPage
});

const projectApprovalsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'project/$projectId/approvals',
  component: ApprovalsPage
});

const projectExperimentsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'project/$projectId/experiments',
  component: ExperimentsPage
});

const projectRufloRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'project/$projectId/ruflo',
  component: RuntimePage
});

const projectChatRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'project/$projectId/chat/$threadId',
  component: ChatPage
});

const projectBrainstormingRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'project/$projectId/brainstorming',
  component: BrainstormingPage
});

const projectBrainstormPlanRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'project/$projectId/brainstorm/$id',
  component: BrainstormPlanPage
});

const agentsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'agents',
  component: AgentsListPage
});

const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'settings',
  component: SettingsPage
});

const accountRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'account',
  component: SettingsPage
});

const accountProfileRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'account/profile',
  component: SettingsPage
});

const accountPreferencesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'account/preferences',
  component: SettingsPage
});

const accountProvidersRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'account/providers',
  component: SettingsProvidersPage
});

const accountDesktopRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'account/desktop',
  component: LocalReposPage
});

const tenantRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'tenant',
  component: SettingsProvidersPage
});

const tenantUsersRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'tenant/users',
  component: SettingsUsersPage
});

const tenantProvidersRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'tenant/providers',
  component: SettingsProvidersPage
});

const tenantModelsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'tenant/models',
  component: ModelsPage
});

const tenantKnowledgeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'tenant/knowledge',
  component: SettingsKnowledgePage
});

const tenantPromptsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'tenant/prompts',
  component: SettingsPromptsPage
});

const tenantWorkersRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'tenant/workers',
  component: WorkersPage
});

const platformRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'platform',
  component: SecretsPage
});

const platformTenantsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'platform/tenants',
  component: SettingsProvidersPage
});

const platformSecretsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'platform/secrets',
  component: SecretsPage
});

const platformIntegrationsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'platform/integrations',
  component: McpPage
});

const platformRbacRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'platform/rbac',
  component: AdminRbacPage
});

const platformAuditRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'platform/audit',
  component: AdminRbacPage
});

const platformDatabaseRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'platform/database',
  component: DatabasePage
});

const platformStackRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'platform/stack',
  component: StackPage
});

const platformVersioningRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'platform/versioning',
  component: VersioningPage
});

const settingsProvidersRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'settings/providers',
  component: SettingsProvidersPage
});

const settingsProvidersDiscoveryRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'settings/providers/discovery',
  component: ProvidersPage
});

const settingsSkillsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'settings/skills',
  component: SkillsPage
});

const settingsAgentsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'settings/agents',
  component: AgentsListPage
});

const settingsAgentCreateRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'settings/agents/new',
  component: AgentCreatePage
});

const settingsAgentDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'settings/agents/$agentId',
  component: AgentDetailPage
});

const settingsRuntimeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'settings/runtime',
  component: RuntimePage
});

const settingsMcpRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'settings/mcp',
  component: McpPage
});

const settingsSecretsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'settings/secrets',
  component: SecretsPage
});

const settingsDatabaseRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'settings/database',
  component: DatabasePage
});

const settingsStackRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'settings/stack',
  component: StackPage
});

const settingsLocalReposRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'settings/local-repos',
  component: LocalReposPage
});

const settingsVersioningRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'settings/versioning',
  component: VersioningPage
});

const settingsAuditRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'settings/audit',
  component: AdminRbacPage
});

const settingsUsageRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'settings/usage',
  component: RuntimePage
});

const settingsTenantsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'settings/tenants',
  component: SettingsProvidersPage
});

const settingsUsersRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'settings/users',
  component: SettingsUsersPage
});

const settingsKnowledgeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'settings/knowledge',
  component: SettingsKnowledgePage
});

const settingsPromptsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'settings/prompts',
  component: SettingsPromptsPage
});

const settingsModelsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'settings/models',
  component: ModelsPage
});

const settingsPipelinesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'settings/pipelines',
  component: ProjectPipelinesPage
});

const settingsMachinesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'settings/machines',
  component: WorkersPage
});

const settingsWorkersRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'settings/workers',
  component: WorkersPage
});

const settingsIntegrationsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'settings/integrations',
  component: McpPage
});

const settingsRbacRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'settings/rbac',
  component: AdminRbacPage
});

const helpRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'help',
  component: HelpPage
});

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'login',
  component: LoginPage
});

const routeTree = rootRoute.addChildren([
  indexRoute,
  activityRoute,
  projectsRoute,
  projectsNewRoute,
  canonicalProjectDefaultRoute,
  canonicalProjectOverviewRoute,
  canonicalProjectSetupRoute,
  canonicalProjectWorkspaceRoute,
  canonicalProjectWorkspaceContextRoute,
  canonicalProjectAgentsRoute,
  canonicalProjectRunsRoute,
  canonicalProjectKnowledgeRoute,
  projectWorkspaceRoute,
  projectOnboardingRoute,
  projectTasksListRoute,
  projectPipelinesRoute,
  projectAgentsRoute,
  projectMonitoringRoute,
  projectSchemasRoute,
  projectObservabilityRoute,
  projectCodingRoute,
  projectContextRoute,
  projectRepositoriesRoute,
  projectRoadmapRoute,
  projectTaskRoute,
  projectRunRoute,
  projectMemoryRoute,
  projectKnowledgeRoute,
  projectRetrievalRoute,
  projectArtifactsRoute,
  projectApprovalsRoute,
  projectExperimentsRoute,
  projectRufloRoute,
  projectChatRoute,
  projectBrainstormingRoute,
  projectBrainstormPlanRoute,
  agentsRoute,
  accountRoute,
  accountProfileRoute,
  accountPreferencesRoute,
  accountProvidersRoute,
  accountDesktopRoute,
  tenantRoute,
  tenantUsersRoute,
  tenantProvidersRoute,
  tenantModelsRoute,
  tenantKnowledgeRoute,
  tenantPromptsRoute,
  tenantWorkersRoute,
  platformRoute,
  platformTenantsRoute,
  platformSecretsRoute,
  platformIntegrationsRoute,
  platformRbacRoute,
  platformAuditRoute,
  platformDatabaseRoute,
  platformStackRoute,
  platformVersioningRoute,
  settingsRoute,
  settingsProvidersRoute,
  settingsProvidersDiscoveryRoute,
  settingsSkillsRoute,
  settingsAgentsRoute,
  settingsAgentCreateRoute,
  settingsAgentDetailRoute,
  settingsRuntimeRoute,
  settingsMcpRoute,
  settingsSecretsRoute,
  settingsDatabaseRoute,
  settingsStackRoute,
  settingsLocalReposRoute,
  settingsVersioningRoute,
  settingsAuditRoute,
  settingsUsageRoute,
  settingsTenantsRoute,
  settingsUsersRoute,
  settingsKnowledgeRoute,
  settingsPromptsRoute,
  settingsModelsRoute,
  settingsPipelinesRoute,
  settingsMachinesRoute,
  settingsWorkersRoute,
  settingsIntegrationsRoute,
  settingsRbacRoute,
  helpRoute,
  loginRoute
]);

export const router = createRouter({ routeTree });

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
