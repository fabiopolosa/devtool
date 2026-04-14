import { Link } from '@tanstack/react-router';
import { Panel, SectionHeading } from '@/components/common';
import { ApprovalBar, PlannerOutputCard, TaskTimeline } from '@/components/panels';
import { usePathParam } from './_utils';
import { useAppStore } from '@/store/app-store';

export function ProjectDetailPage() {
  const { state, dispatch } = useAppStore();
  const projectId = usePathParam(1);
  const project = state.projects.find((item) => item.id === projectId) ?? state.projects[0];

  if (!project) return <Panel>No project found.</Panel>;

  const tasks = state.tasks.filter((item) => item.projectId === project.id);
  const roadmap = state.roadmapItems.filter((item) => item.projectId === project.id);
  const approvals = state.approvals.filter((item) => roadmap.some((r) => r.id === item.subjectId));
  const firstTask = tasks[0];
  const firstTaskRun = firstTask ? state.taskRuns.find((run) => run.taskId === firstTask.id) : undefined;

  return (
    <div className="space-y-5">
      <Panel>
        <SectionHeading title={project.name} subtitle={project.key} />
        <p className="text-sm text-slate-300">{project.description}</p>
        <div className="mt-4 flex flex-wrap gap-2 text-xs text-slate-400">
          <span className="pill">Status {project.status}</span>
          <span className="pill">Roadmap {roadmap.length}</span>
          <span className="pill">Tasks {tasks.length}</span>
        </div>
        <div className="mt-4 flex gap-2">
          <Link to="/projects/$projectId/repositories" params={{ projectId: project.id }} className="pill border border-white/10">Repositories</Link>
          <Link to="/projects/$projectId/roadmap" params={{ projectId: project.id }} className="pill border border-white/10">Roadmap</Link>
        </div>
      </Panel>

      <div className="grid gap-4 xl:grid-cols-2">
        <PlannerOutputCard
          title="Execution basis"
          summary="Approved roadmap items become task specs. Tasks require deterministic verification before completion."
        />
        <ApprovalBar
          approvals={approvals}
          onApprove={(roadmapItemId) => dispatch({ type: 'approveRoadmap', roadmapItemId })}
          onReject={(roadmapItemId) => dispatch({ type: 'rejectRoadmap', roadmapItemId })}
        />
      </div>

      {firstTask ? <TaskTimeline task={firstTask} run={firstTaskRun} /> : null}
    </div>
  );
}
