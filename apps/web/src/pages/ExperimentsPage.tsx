import { ExperimentTable, PromptVersionPanel } from '@/components/panels';
import { useAppStore } from '@/store/app-store';

export function ExperimentsPage() {
  const { state } = useAppStore();

  return (
    <div className="space-y-5">
      <ExperimentTable experiments={state.experiments} runs={state.experimentRuns} />
      <PromptVersionPanel versions={state.promptVersions} />
    </div>
  );
}
