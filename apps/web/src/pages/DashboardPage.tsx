import { Link } from '@tanstack/react-router';
import { useCallback, useEffect, useState } from 'react';
import type { AgentConfig, Machine } from '@cp/domain';
import { StatCard } from '@/components/common';
import { AgentRunTable, ExecutionTracePanel, LiveAgentGrid, PlannerOutputCard, ProjectCard, VerificationSummary } from '@/components/panels';
import { useAppStore } from '@/store/app-store';

export function DashboardPage() {
  const { state, authActions } = useAppStore();
  const activeProject = state.projects[0];
  const run = state.taskRuns[0];
  const verification = state.verificationResults[0];
  const verificationSteps = state.verificationSteps.filter((step) => step.runId === run?.id);
  const [agents, setAgents] = useState<AgentConfig[]>([]);
  const [machines, setMachines] = useState<Machine[]>([]);

  const loadLiveData = useCallback(async () => {
    try {
      const [agentsResponse, machinesResponse] = await Promise.all([
        authActions.apiFetch('/agents'),
        authActions.apiFetch('/machines')
      ]);

      const agentsBody = (await agentsResponse.json()) as { items?: AgentConfig[] };
      const machinesBody = (await machinesResponse.json()) as { items?: Machine[] };

      if (agentsResponse.ok) {
        setAgents(agentsBody.items ?? []);
      }
      if (machinesResponse.ok) {
        setMachines(machinesBody.items ?? []);
      }
    } catch {
      // keep dashboard resilient; live mesh can fall back to existing local state panels
    }
  }, [authActions]);

  useEffect(() => {
    void loadLiveData();
  }, [loadLiveData]);

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

      <LiveAgentGrid agents={agents} machines={machines} runs={state.taskRuns} />

      <AgentRunTable runs={state.taskRuns} />

      <div className="flex flex-wrap gap-2">
        <Link to="/projects" className="btn btn-primary">Open Projects</Link>
        <Link to="/approvals" className="btn btn-secondary">Review Approvals</Link>
        <Link to="/providers" className="btn btn-ghost">Provider Settings</Link>
      </div>
    </div>
  );
}
