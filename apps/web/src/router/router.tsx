import { createRootRoute, createRoute, createRouter } from '@tanstack/react-router';
import { AppShell } from '@/layout/AppShell';
import { DashboardPage } from '@/pages/DashboardPage';
import { ActivityPage } from '@/pages/ActivityPage';
import { ProjectsPage } from '@/pages/ProjectsPage';
import { ProjectDetailPage } from '@/pages/ProjectDetailPage';
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

const settingsProvidersRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'settings/providers',
  component: SettingsProvidersPage
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
  component: ProvidersPage
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
  projectWorkspaceRoute,
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
  settingsRoute,
  settingsProvidersRoute,
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
