import { Panel, SectionHeading } from "@/components/common";

export function HelpPage() {
  return (
    <div className="space-y-4">
      <Panel>
        <SectionHeading title="Help" subtitle="Context map for global, project and platform operations" />
        <div className="space-y-2 text-sm text-[color:var(--muted)]">
          <p>
            <strong className="text-[color:var(--text)]">Global</strong>: overview and cross-project awareness.
          </p>
          <p>
            <strong className="text-[color:var(--text)]">Project</strong>: tasks, pipelines, approvals and execution details for a single workspace.
          </p>
          <p>
            <strong className="text-[color:var(--text)]">Platform</strong>: owner/admin controls for providers, secrets, tenants, knowledge and integrations.
          </p>
        </div>
      </Panel>
    </div>
  );
}
