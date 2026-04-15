import { Link } from "@tanstack/react-router";
import { Panel, Pill, SectionHeading } from "@/components/common";
import { useAppStore } from "@/store/app-store";
import { usePathParam } from "./_utils";

export function ProjectTasksPage() {
  const { state } = useAppStore();
  const projectId = usePathParam(2);
  const project = state.projects.find((item) => item.id === projectId) ?? state.projects[0];

  if (!project) {
    return (
      <Panel>
        <p className="text-sm text-[color:var(--muted)]">Project not found.</p>
      </Panel>
    );
  }

  const tasks = state.tasks
    .filter((task) => task.projectId === project.id)
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt));

  return (
    <div className="space-y-4">
      <Panel>
        <SectionHeading
          title="Development Tasks"
          subtitle="Feature, bugfix and refactor tasks tracked separately from operational pipelines"
        />
      </Panel>

      <div className="grid gap-3">
        {tasks.map((task) => (
          <Panel key={task.id}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm font-semibold">{task.title}</div>
                <div className="mt-1 text-xs text-[color:var(--muted)]">{task.goal}</div>
                <div className="mt-2 text-xs uppercase tracking-[0.08em] text-[color:var(--muted)]">
                  {task.type} · {task.state}
                </div>
              </div>
              <Pill tone={task.state === "completed" ? "good" : task.state === "verification_failed" ? "bad" : "default"}>
                {task.state}
              </Pill>
            </div>
            <div className="mt-3">
              <Link
                to="/project/$projectId/tasks/$taskId"
                params={{ projectId: project.id, taskId: task.id }}
                className="text-xs uppercase tracking-[0.08em] text-[color:var(--accent)]"
              >
                Open task
              </Link>
            </div>
          </Panel>
        ))}
        {tasks.length === 0 ? (
          <Panel>
            <p className="text-sm text-[color:var(--muted)]">No development tasks for this project.</p>
          </Panel>
        ) : null}
      </div>
    </div>
  );
}
