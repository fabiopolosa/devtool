import { Panel } from '@/components/common';
import { RetrievalContextCard } from '@/components/panels';
import { usePathParam } from './_utils';
import { useAppStore } from '@/store/app-store';

export function RetrievalPage() {
  const { state } = useAppStore();
  const runId = usePathParam(1);
  const run = state.taskRuns.find((item) => item.id === runId) ?? state.taskRuns[0];
  const log = state.retrievalLogs.find((item) => item.taskRunId === run?.id) ?? state.retrievalLogs[0];

  if (!log) return <Panel>No retrieval logs available.</Panel>;

  const chunks = state.memoryChunks.filter((chunk) => log.returnedChunkIds.includes(chunk.id));

  return (
    <div className="space-y-5">
      <RetrievalContextCard log={log} chunks={chunks} />
    </div>
  );
}
