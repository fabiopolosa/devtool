import { Panel, SectionHeading } from "@/components/common";
import { BrainstormingWorkbench } from "@/components/brainstorming/BrainstormingWorkbench";
import { usePathParam } from "./_utils";

export function BrainstormPlanPage() {
  const brainstormId = usePathParam(1);

  if (!brainstormId) {
    return (
      <Panel>
        <SectionHeading title="Brainstorming" subtitle="Route parameter missing" />
        <p className="text-sm text-[color:var(--muted)]">Brainstorm id non trovato nella route.</p>
      </Panel>
    );
  }

  return <BrainstormingWorkbench planId={brainstormId} />;
}
