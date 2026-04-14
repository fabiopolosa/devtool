import { Link } from '@tanstack/react-router';
import { StatCard } from '@/components/common';
import { AgentRunTable, ExecutionTracePanel, PlannerOutputCard, ProjectCard, VerificationSummary } from '@/components/panels';
import { useAppStore } from '@/store/app-store';

export function DashboardPage() {
  const { state } = useAppStore();
  const activeProject = state.projects[0];
  const run = state.taskRuns[0];
  const verification = state.verificationResults[0];
  const verificationSteps = state.verificationSteps.filter((step) => step.runId === run?.id);

  return (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Projects" value={state.projects.length} hint="multi-project control" />
        <StatCard label="Tasks" value={state.tasks.length} hint="queued + running + completed" />
        <StatCard label="Runs" value={state.taskRuns.length} hint="execution timeline" />
        <StatCard label="Approvals pending" value={state.approvals.filter((item) => item.status === 'pending').length} hint="human gate" />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        {activeProject ? (
          <ProjectCard
            project={activeProject}
            repoCount={state.projectRepositoryLinks.filter((link) => link.projectId === activeProject.id).length}
            roadmapCount={state.roadmapItems.filter((item) => item.projectId === activeProject.id).length}
            taskCount={state.tasks.filter((item) => item.projectId === activeProject.id).length}
          />
        ) : null}
        <PlannerOutputCard
          title="Planner proposed roadmap-to-task sequence"
          summary="Provider routing and memory retrieval are active tracks. Dashboard polish is pending approval before conversion into executable tasks."
        />
      </div>

      {verification && run ? (
        <div className="grid gap-4 xl:grid-cols-2">
          <VerificationSummary result={verification} steps={verificationSteps} />
          <ExecutionTracePanel
            title="Execution trace"
            rows={[
              { label: 'Run', value: run.id },
              { label: 'Workflow', value: run.workflowId },
              { label: 'Status', value: run.status },
              { label: 'Repos touched', value: run.reposTouched.join(', ') }
            ]}
          />
        </div>
      ) : null}

      <AgentRunTable runs={state.taskRuns} />

      <div className="flex flex-wrap gap-2">
        <Link to="/projects" className="pill border border-cyan-400/30 bg-cyan-400/10 text-cyan-100">Open Projects</Link>
        <Link to="/approvals" className="pill border border-amber-400/30 bg-amber-400/10 text-amber-100">Review Approvals</Link>
        <Link to="/providers" className="pill border border-slate-500/30 bg-slate-700/20 text-slate-100">Provider Settings</Link>
      </div>
    </div>
  );
}
