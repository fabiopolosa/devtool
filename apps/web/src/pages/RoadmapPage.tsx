import { Link } from '@tanstack/react-router';
import { Panel, SectionHeading } from '@/components/common';
import { RoadmapBoard } from '@/components/panels';
import { usePathParam } from './_utils';
import { useAppStore } from '@/store/app-store';

export function RoadmapPage() {
  const { state, dispatch } = useAppStore();
  const projectId = usePathParam(2);
  const project = state.projects.find((item) => item.id === projectId) ?? state.projects[0];

  if (!project) return <Panel>No project selected.</Panel>;

  const items = state.roadmapItems
    .filter((item) => item.projectId === project.id)
    .sort((left, right) => left.orderIndex - right.orderIndex);

  return (
    <div className="space-y-5">
      <Panel>
        <SectionHeading title="Roadmap board" subtitle={project.name} />
        <p className="text-sm text-slate-300">Approve, reject, reorder, split, and convert roadmap items into execution tasks.</p>
      </Panel>

      <RoadmapBoard
        items={items}
        onApprove={(roadmapItemId) => dispatch({ type: 'approveRoadmap', roadmapItemId })}
        onReject={(roadmapItemId) => dispatch({ type: 'rejectRoadmap', roadmapItemId })}
        onMoveUp={(roadmapItemId) => dispatch({ type: 'reorderRoadmap', roadmapItemId, direction: 'up' })}
        onMoveDown={(roadmapItemId) => dispatch({ type: 'reorderRoadmap', roadmapItemId, direction: 'down' })}
        onSplit={(roadmapItemId) => dispatch({ type: 'splitRoadmap', roadmapItemId })}
      />

      <Panel>
        <SectionHeading title="Roadmap table" subtitle="Conversion" />
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="text-slate-400">
              <tr>
                <th className="py-2 pr-3">Order</th>
                <th className="py-2 pr-3">Title</th>
                <th className="py-2 pr-3">State</th>
                <th className="py-2 pr-3">Priority</th>
                <th className="py-2 pr-3">Action</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className="border-t border-white/10">
                  <td className="py-2 pr-3 text-slate-300">{item.orderIndex}</td>
                  <td className="py-2 pr-3 text-white">{item.title}</td>
                  <td className="py-2 pr-3 text-slate-300">{item.state}</td>
                  <td className="py-2 pr-3 text-slate-300">{item.priority}</td>
                  <td className="py-2 pr-3">
                    <button
                      onClick={() => dispatch({ type: 'convertRoadmapToTask', roadmapItemId: item.id })}
                      className="rounded-lg border border-cyan-400/30 bg-cyan-500/20 px-2 py-1 text-xs text-cyan-100"
                    >
                      Convert to task
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-3 text-xs text-slate-400">Converted tasks can be inspected in task detail pages.</div>
        {state.tasks[0] ? (
          <div className="mt-3">
            <Link to="/tasks/$taskId" params={{ taskId: state.tasks[0].id }} className="pill border border-white/10">
              Open task {state.tasks[0].id}
            </Link>
          </div>
        ) : null}
      </Panel>
    </div>
  );
}
