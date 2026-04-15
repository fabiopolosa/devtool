import { ApprovalBar, ExecutionTracePanel } from '@/components/panels';
import { useRouterState } from '@tanstack/react-router';
import { useAppStore } from '@/store/app-store';

export function ApprovalsPage() {
  const { state, dispatch } = useAppStore();
  const pathname = useRouterState({ select: (routerState) => routerState.location.pathname });
  const projectScopedMatch = pathname.match(/^\/project\/([^/]+)\/approvals$/);
  const scopedProjectId = projectScopedMatch?.[1];

  const scopedApprovals = (() => {
    if (!scopedProjectId) return state.approvals;
    const roadmapIds = new Set(
      state.roadmapItems.filter((roadmap) => roadmap.projectId === scopedProjectId).map((roadmap) => roadmap.id)
    );
    return state.approvals.filter((approval) => roadmapIds.has(approval.subjectId));
  })();

  return (
    <div className="space-y-5">
      <ApprovalBar
        approvals={scopedApprovals}
        onApprove={(roadmapItemId) => dispatch({ type: 'approveRoadmap', roadmapItemId })}
        onReject={(roadmapItemId) => dispatch({ type: 'rejectRoadmap', roadmapItemId })}
      />
      <ExecutionTracePanel
        title="Approval trace"
        rows={scopedApprovals.map((approval) => ({
          label: `${approval.subjectType}:${approval.subjectId}`,
          value: `${approval.status} · requested by ${approval.requestedBy}`
        }))}
      />
    </div>
  );
}
