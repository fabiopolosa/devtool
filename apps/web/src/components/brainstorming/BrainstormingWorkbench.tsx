import { useCallback, useEffect, useMemo, useState } from "react";
import { getBrainstormPlanPayload } from "@cp/domain";
import type { BrainstormPlan, BrainstormSession, Subprompt } from "@cp/domain";
import { Button, Panel, Pill, SectionHeading } from "@/components/common";
import { useAppStore } from "@/store/app-store";

type BrainstormStartItem = {
  session: BrainstormSession;
  plan?: BrainstormPlan;
};

type CreateProjectResult = {
  session: { id: string; status: "collecting" | "planned" | "approved" | "applied" | "archived" };
  project: { id: string; name: string };
  roadmapItems: Array<{ id: string; title: string }>;
  tasks: Array<{ id: string; title: string }>;
  providerBindings: Array<{ id: string; capabilityClass: string }>;
  skillInstallResults: Array<{ name: string; installed: boolean; warning?: string }>;
};

export function BrainstormingWorkbench({ embedded = false }: { embedded?: boolean }) {
  const { authActions } = useAppStore();
  const [projectIntent, setProjectIntent] = useState("");
  const [projectName, setProjectName] = useState("");
  const [subprompts, setSubprompts] = useState<Subprompt[]>([]);
  const [selectedSubpromptIds, setSelectedSubpromptIds] = useState<string[]>([]);
  const [guidedAnswers, setGuidedAnswers] = useState<Record<string, string>>({});
  const [session, setSession] = useState<BrainstormSession | undefined>();
  const [plan, setPlan] = useState<BrainstormPlan | undefined>();
  const [createResult, setCreateResult] = useState<CreateProjectResult | undefined>();
  const [loadingCatalog, setLoadingCatalog] = useState(false);
  const [running, setRunning] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const refreshSubprompts = useCallback(async (): Promise<void> => {
    setLoadingCatalog(true);
    setError(undefined);
    try {
      const response = await authActions.apiFetch("/subprompts?enabled=true&refresh=1&includeContent=1");
      const body = (await response.json()) as { items?: Subprompt[]; message?: string };
      if (!response.ok) {
        throw new Error(body.message ?? `Unable to load subprompts (HTTP ${response.status})`);
      }
      const items = body.items ?? [];
      setSubprompts(items);
      if (selectedSubpromptIds.length === 0 && items.length > 0) {
        const preferred = items
          .filter((item) => item.category === "stack" || item.category === "architecture")
          .map((item) => item.id);
        setSelectedSubpromptIds(preferred.length > 0 ? preferred : items.slice(0, 4).map((item) => item.id));
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load subprompt library");
    } finally {
      setLoadingCatalog(false);
    }
  }, [authActions, selectedSubpromptIds.length]);

  useEffect(() => {
    void refreshSubprompts();
  }, [refreshSubprompts]);

  const selectedSubprompts = useMemo(
    () => subprompts.filter((item) => selectedSubpromptIds.includes(item.id)),
    [subprompts, selectedSubpromptIds]
  );
  const planPayload = useMemo(
    () => (plan ? getBrainstormPlanPayload(plan, { warnOnLegacyFallback: true }) : undefined),
    [plan]
  );

  const generatePlan = async (): Promise<void> => {
    if (!projectIntent.trim()) {
      setError("Project intent is required.");
      return;
    }
    setRunning(true);
    setError(undefined);
    setCreateResult(undefined);
    try {
      const response = await authActions.apiFetch("/brainstorm", {
        method: "POST",
        body: JSON.stringify({
          projectIntent: projectIntent.trim(),
          selectedSubpromptIds,
          guidedAnswers,
          generatePlan: true
        })
      });
      const body = (await response.json()) as { item?: BrainstormStartItem; message?: string };
      if (!response.ok || !body.item?.session) {
        throw new Error(body.message ?? `Unable to generate brainstorm plan (HTTP ${response.status})`);
      }
      setSession(body.item.session);
      setPlan(body.item.plan);
      if (!projectName.trim()) {
        setProjectName(body.item.plan?.title ?? "AI Control Plane Project");
      }
    } catch (runError) {
      setError(runError instanceof Error ? runError.message : "Unable to generate brainstorm plan");
    } finally {
      setRunning(false);
    }
  };

  const createProjectFromPlan = async (): Promise<void> => {
    if (!plan) {
      setError("Generate a brainstorm plan first.");
      return;
    }
    setCreating(true);
    setError(undefined);
    try {
      await authActions.apiFetch(`/brainstorm/plan/${plan.id}/approve`, {
        method: "POST",
        body: JSON.stringify({})
      });
      setSession((current) => (current ? { ...current, status: "approved" } : current));

      const response = await authActions.apiFetch(`/brainstorm/plan/${plan.id}/create-project`, {
        method: "POST",
        body: JSON.stringify({
          projectName: projectName.trim() || plan.title
        })
      });
      const body = (await response.json()) as { item?: CreateProjectResult; message?: string };
      if (!response.ok || !body.item) {
        throw new Error(body.message ?? `Unable to create project from brainstorm plan (HTTP ${response.status})`);
      }
      const createdItem = body.item;
      setCreateResult(createdItem);
      setSession((current) =>
        current
          ? {
              ...current,
              status: createdItem.session?.status ?? "applied",
              projectId: createdItem.project.id
            }
          : current
      );
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Unable to create project from plan");
    } finally {
      setCreating(false);
    }
  };

  const toggleSubprompt = (subpromptId: string): void => {
    setSelectedSubpromptIds((current) =>
      current.includes(subpromptId)
        ? current.filter((id) => id !== subpromptId)
        : [...current, subpromptId]
    );
  };

  return (
    <div className="space-y-4">
      {!embedded ? (
        <Panel>
          <SectionHeading
            title="Brainstorming"
            subtitle="Guided planning workspace"
            action={
              <Button variant="secondary" onClick={() => void refreshSubprompts()}>
                {loadingCatalog ? "Refreshing..." : "Refresh subprompts"}
              </Button>
            }
          />
          <p className="text-sm text-[color:var(--muted)]">
            Guided mode: gather requirements, compose reusable subprompts, and generate a structured
            `BrainstormPlan` with roadmap dependencies.
          </p>
        </Panel>
      ) : null}

      {error ? (
        <Panel className="border border-rose-400/40 bg-rose-500/10">
          <p className="text-sm text-rose-200">{error}</p>
        </Panel>
      ) : null}

      <Panel>
        <SectionHeading title="Session Input" subtitle="Project intent + guided answers" />
        <div className="grid gap-3">
          <label className="text-xs uppercase tracking-wide text-[color:var(--muted)]">
            Project intent
            <textarea
              value={projectIntent}
              onChange={(event) => setProjectIntent(event.target.value)}
              rows={4}
              placeholder="Describe the project objective, constraints, and expected outcomes..."
              className="mt-1 w-full rounded-none border border-[color:var(--line)] bg-black/20 px-3 py-2 text-sm text-[color:var(--text)] outline-none focus:border-[color:var(--accent)]"
            />
          </label>

          <label className="text-xs uppercase tracking-wide text-[color:var(--muted)]">
            Project name (for Create Project)
            <input
              value={projectName}
              onChange={(event) => setProjectName(event.target.value)}
              className="mt-1 w-full rounded-none border border-[color:var(--line)] bg-black/20 px-3 py-2 text-sm text-[color:var(--text)] outline-none focus:border-[color:var(--accent)]"
            />
          </label>

          <div className="grid gap-2 md:grid-cols-2">
            {session?.questions.map((question) => (
              <label key={question.id} className="text-xs uppercase tracking-wide text-[color:var(--muted)]">
                {question.question}
                <textarea
                  rows={2}
                  value={guidedAnswers[question.id] ?? ""}
                  onChange={(event) =>
                    setGuidedAnswers((current) => ({
                      ...current,
                      [question.id]: event.target.value
                    }))
                  }
                  className="mt-1 w-full rounded-none border border-[color:var(--line)] bg-black/20 px-3 py-2 text-sm text-[color:var(--text)] outline-none focus:border-[color:var(--accent)]"
                />
              </label>
            ))}
          </div>

          <div className="flex flex-wrap gap-2">
            <Button variant="primary" onClick={() => void generatePlan()}>
              {running ? "Generating..." : "Generate Plan"}
            </Button>
            <Button variant="secondary" onClick={() => setGuidedAnswers({})}>
              Clear Answers
            </Button>
          </div>
        </div>
      </Panel>

      <Panel>
        <SectionHeading title="Subprompt Library" subtitle={`${selectedSubpromptIds.length} selected`} />
        <div className="grid gap-2 md:grid-cols-2">
          {subprompts.map((item) => (
            <label
              key={item.id}
              className="flex gap-2 border border-[color:var(--line)] bg-black/20 p-3 text-sm"
            >
              <input
                type="checkbox"
                checked={selectedSubpromptIds.includes(item.id)}
                onChange={() => toggleSubprompt(item.id)}
              />
              <span>
                <span className="font-semibold text-[color:var(--text)]">{item.title}</span>
                <span className="ml-2 text-xs text-[color:var(--muted)]">[{item.category}]</span>
                <span className="mt-1 block text-xs text-[color:var(--muted)]">{item.summary}</span>
              </span>
            </label>
          ))}
        </div>
      </Panel>

      {plan && planPayload ? (
        <Panel>
          <SectionHeading
            title={plan.title}
            subtitle={`Brainstorm plan ${plan.id}`}
            action={
              <div className="flex items-center gap-2">
                <Pill tone={session?.status === "applied" ? "good" : session?.status === "approved" ? "accent" : "warn"}>
                  {session?.status ?? "planned"}
                </Pill>
                <Button variant="primary" onClick={() => void createProjectFromPlan()}>
                  {creating ? "Creating..." : "Crea progetto"}
                </Button>
              </div>
            }
          />
          <p className="text-sm text-[color:var(--muted)]">{plan.executiveSummary}</p>

          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            <div className="border border-[color:var(--line)] bg-black/20 p-3">
              <div className="label">Recommended stack</div>
              <div className="mt-2 text-sm text-[color:var(--text)]">
                DB: {planPayload.recommendedStack.database}
              </div>
              <div className="text-sm text-[color:var(--text)]">
                Backend: {planPayload.recommendedStack.backend}
              </div>
              <div className="text-sm text-[color:var(--text)]">
                Frontend: {planPayload.recommendedStack.frontend}
              </div>
              <div className="text-sm text-[color:var(--muted)]">
                Providers: {planPayload.recommendedStack.llmProviders.join(", ")}
              </div>
            </div>
            <div className="border border-[color:var(--line)] bg-black/20 p-3">
              <div className="label">Architecture</div>
              <div className="mt-2 text-sm text-[color:var(--text)]">
                Strategy: {planPayload.architecture.repositoryStrategy}
              </div>
              <div className="text-sm text-[color:var(--muted)]">
                {planPayload.architecture.packageLayout.join(" · ")}
              </div>
              <div className="mt-1 text-sm text-[color:var(--text)]">
                {planPayload.architecture.rationale}
              </div>
            </div>
          </div>

          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            <div className="border border-[color:var(--line)] bg-black/20 p-3">
              <div className="label">Roadmap</div>
              <div className="mt-2 space-y-2">
                {planPayload.roadmap.map((item, index) => (
                  <div key={item.id} className="border border-[color:var(--line)] bg-black/30 p-2 text-sm">
                    <div className="font-semibold text-[color:var(--text)]">
                      {index + 1}. {item.title}
                    </div>
                    <div className="text-xs text-[color:var(--muted)]">{item.description}</div>
                    <div className="mt-1 text-[11px] text-[color:var(--muted)]">
                      deps: {item.dependencies.join(", ") || "none"} · agent: {item.suggestedAgentRole}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="border border-[color:var(--line)] bg-black/20 p-3">
              <div className="label">Selected subprompts</div>
              <div className="mt-2 space-y-1 text-xs text-[color:var(--muted)]">
                {planPayload.selectedSubprompts.map((item) => (
                  <div key={item.id}>
                    [{item.category}] {item.title}
                  </div>
                ))}
              </div>
              <div className="mt-3 label">Composed prompt</div>
              <pre className="mt-1 max-h-44 overflow-auto border border-[color:var(--line)] bg-black/40 p-2 text-xs text-[color:var(--text)] whitespace-pre-wrap">
                {planPayload.composedPrompt}
              </pre>
            </div>
          </div>
        </Panel>
      ) : null}

      {createResult ? (
        <Panel>
          <SectionHeading title="Project created" subtitle={createResult.project.id} />
          <p className="text-sm text-[color:var(--text)]">
            {createResult.project.name} created with {createResult.tasks.length} task(s),{" "}
            {createResult.roadmapItems.length} roadmap item(s), and{" "}
            {createResult.providerBindings.length} provider binding(s).
          </p>
          <div className="mt-2 text-xs text-[color:var(--muted)]">
            Skills install:{" "}
            {createResult.skillInstallResults
              .map((item) => `${item.name}=${item.installed ? "installed" : "not_installed"}`)
              .join(", ")}
          </div>
        </Panel>
      ) : null}

      {selectedSubprompts.length === 0 && subprompts.length > 0 ? (
        <Panel>
          <p className="text-sm text-[color:var(--muted)]">
            Select at least one subprompt before generating the plan.
          </p>
        </Panel>
      ) : null}
    </div>
  );
}
