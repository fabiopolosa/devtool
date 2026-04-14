import { ApprovalBar, ExecutionTracePanel } from '@/components/panels';
import { useAppStore } from '@/store/app-store';

export function ApprovalsPage() {
  const { state, dispatch } = useAppStore();

  return (
    <div className="space-y-5">
      <ApprovalBar
        approvals={state.approvals}
        onApprove={(roadmapItemId) => dispatch({ type: 'approveRoadmap', roadmapItemId })}
        onReject={(roadmapItemId) => dispatch({ type: 'rejectRoadmap', roadmapItemId })}
      />
      <ExecutionTracePanel
        title="Approval trace"
        rows={state.approvals.map((approval) => ({
          label: `${approval.subjectType}:${approval.subjectId}`,
          value: `${approval.status} · requested by ${approval.requestedBy}`
        }))}
      />
    </div>
  );
}
