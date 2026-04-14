import { createRootRoute, createRoute, createRouter } from '@tanstack/react-router';
import { AppShell } from '@/layout/AppShell';
import { DashboardPage } from '@/pages/DashboardPage';
import { ProjectsPage } from '@/pages/ProjectsPage';
import { ProjectDetailPage } from '@/pages/ProjectDetailPage';
import { RepositoriesPage } from '@/pages/RepositoriesPage';
import { RoadmapPage } from '@/pages/RoadmapPage';
import { TaskDetailPage } from '@/pages/TaskDetailPage';
import { RunDetailPage } from '@/pages/RunDetailPage';
import { MemoryPage } from '@/pages/MemoryPage';
import { RetrievalPage } from '@/pages/RetrievalPage';
import { ArtifactsPage } from '@/pages/ArtifactsPage';
import { ApprovalsPage } from '@/pages/ApprovalsPage';
import { ExperimentsPage } from '@/pages/ExperimentsPage';
import { ChatPage } from '@/pages/ChatPage';
import { ProvidersPage } from '@/pages/ProvidersPage';
import { LoginPage } from '@/pages/LoginPage';
import { AdminRbacPage } from '@/pages/AdminRbacPage';
import { SkillsPage } from '@/pages/SkillsPage';
import { AgentsListPage } from '@/pages/AgentsListPage';
import { AgentDetailPage } from '@/pages/AgentDetailPage';
import { AgentCreatePage } from '@/pages/AgentCreatePage';
import { RuntimePage } from '@/pages/RuntimePage';

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

const projectRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'projects/$projectId',
  component: ProjectDetailPage
});

const repositoriesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'projects/$projectId/repositories',
  component: RepositoriesPage
});

const roadmapRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'projects/$projectId/roadmap',
  component: RoadmapPage
});

const taskRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'tasks/$taskId',
  component: TaskDetailPage
});

const runRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'runs/$runId',
  component: RunDetailPage
});

const memoryRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'memory',
  component: MemoryPage
});

const retrievalRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'retrieval/$runId',
  component: RetrievalPage
});

const artifactsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'artifacts/$runId',
  component: ArtifactsPage
});

const approvalsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'approvals',
  component: ApprovalsPage
});

const experimentsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'experiments',
  component: ExperimentsPage
});

const chatRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'chat/$threadId',
  component: ChatPage
});

const providersRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'providers',
  component: ProvidersPage
});

const skillsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'skills',
  component: SkillsPage
});

const agentsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'agents',
  component: AgentsListPage
});

const agentCreateRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'agents/new',
  component: AgentCreatePage
});

const agentDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'agents/$agentId',
  component: AgentDetailPage
});

const runtimeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'runtime',
  component: RuntimePage
});

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'login',
  component: LoginPage
});

const adminRbacRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'admin/rbac',
  component: AdminRbacPage
});

const routeTree = rootRoute.addChildren([
  indexRoute,
  projectsRoute,
  projectRoute,
  repositoriesRoute,
  roadmapRoute,
  taskRoute,
  runRoute,
  memoryRoute,
  retrievalRoute,
  artifactsRoute,
  approvalsRoute,
  experimentsRoute,
  chatRoute,
  providersRoute,
  skillsRoute,
  agentsRoute,
  agentCreateRoute,
  agentDetailRoute,
  runtimeRoute,
  loginRoute,
  adminRbacRoute
]);

export const router = createRouter({ routeTree });

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
