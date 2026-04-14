import { Panel, SectionHeading } from '@/components/common';
import { ArtifactPanel } from '@/components/panels';
import { usePathParam } from './_utils';
import { useAppStore } from '@/store/app-store';

export function ArtifactsPage() {
  const { state } = useAppStore();
  const runId = usePathParam(1);
  const artifacts = state.artifacts.filter((item) => item.runId === runId);

  return (
    <div className="space-y-5">
      <Panel>
        <SectionHeading title="Artifacts and logs" subtitle={runId ?? 'run'} />
      </Panel>
      <ArtifactPanel artifacts={artifacts.length ? artifacts : state.artifacts} />
    </div>
  );
}
