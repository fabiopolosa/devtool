import { useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  capabilityClasses,
  type AgentConfig,
  type AgentRuntimeProfile,
  type CapabilityClass,
  type HeartbeatPolicy,
  type Skill
} from "@cp/domain";
import { buildAgentArtifacts } from "@/components/agents/agent-profile";
import { Button, Input, Panel, Pill, ProgressBar, SectionHeading } from "@/components/common";
import { HeartbeatPolicyEditor } from "@/components/runtime-profile/HeartbeatPolicyEditor";
import {
  defaultRuntimeProfile,
  launchModeLabels,
  runtimeHostLabels,
  runtimeKindLabels,
  runtimeKindToCompatibilityAdapter,
  runtimeVendorLabels
} from "@/components/runtime-profile/runtime-profile-utils";
import { RuntimeProfilePicker } from "@/components/runtime-profile/RuntimeProfilePicker";
import { useAppStore } from "@/store/app-store";

const defaultRuntimeConfig = {
  commandPrefix: "devtools-agent",
  timeoutMs: 60000,
  maxRetries: 2
};

const defaultHeartbeatPolicy: HeartbeatPolicy = {
  interval: "manual",
  triggers: ["manual"],
  enabled: true,
  metadata: {}
};

const wizardSteps = [
  { id: "purpose", title: "Purpose", subtitle: "Define mission and identity" },
  { id: "work_mode", title: "Work mode", subtitle: "How this agent collaborates" },
  { id: "runtime", title: "Runtime host + provider", subtitle: "Where and with what it runs" },
  { id: "persona", title: "Persona + language", subtitle: "Voice, style and output defaults" },
  { id: "review", title: "Review", subtitle: "Confirm profile and create" }
] as const;

const parseRuntimeConfig = (raw: string): Record<string, unknown> => {
  const parsed = JSON.parse(raw) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Runtime config must be a JSON object");
  }
  return parsed as Record<string, unknown>;
};

const asRecord = (value: unknown): Record<string, unknown> | undefined => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  return value as Record<string, unknown>;
};

type SkillScope = "system" | "tenant" | "user";

const resolveSkillScope = (skill: Skill, userId?: string): SkillScope => {
  if (skill.categories.includes("scope:system")) return "system";
  if (skill.categories.includes("scope:user")) return "user";
  if (skill.categories.includes("scope:tenant")) return "tenant";
  if (skill.createdBy === "system" || skill.createdBy === "skills_service") return "system";
  if (userId && skill.createdBy === userId) return "user";
  if (skill.createdBy.startsWith("user:")) return "user";
  return "tenant";
};

export function AgentCreatePage() {
  const navigate = useNavigate();
  const { auth, authActions } = useAppStore();
  const mountedRef = useRef(false);
  const [availableManagers, setAvailableManagers] = useState<AgentConfig[]>([]);
  const [installedSkills, setInstalledSkills] = useState<Skill[]>([]);
  const [stepIndex, setStepIndex] = useState(0);
  const [name, setName] = useState("");
  const [role, setRole] = useState("project_coordinator");
  const [icon, setIcon] = useState("tool");
  const [description, setDescription] = useState("");
  const [purpose, setPurpose] = useState("Coordinate project delivery and keep implementation aligned with goals.");
  const [workMode, setWorkMode] = useState("coordinator");
  const [runtimeProfile, setRuntimeProfile] = useState<AgentRuntimeProfile>(defaultRuntimeProfile("mcp_bridge"));
  const [heartbeatPolicy, setHeartbeatPolicy] = useState<HeartbeatPolicy>(defaultHeartbeatPolicy);
  const [reportTo, setReportTo] = useState("");
  const [desiredSkills, setDesiredSkills] = useState<string[]>([]);
  const [skillScopeFilter, setSkillScopeFilter] = useState<"all" | SkillScope>("all");
  const [selectedCapabilities, setSelectedCapabilities] = useState<CapabilityClass[]>(["coding"]);
  const [persona, setPersona] = useState("Calm, collaborative and execution-focused.");
  const [language, setLanguage] = useState("en-US");
  const [tone, setTone] = useState("Clear, direct and pragmatic.");
  const [runtimeConfigRaw, setRuntimeConfigRaw] = useState(JSON.stringify(defaultRuntimeConfig, null, 2));
  const [error, setError] = useState<string | undefined>();
  const [saving, setSaving] = useState(false);
  const boundedStepIndex = Math.min(stepIndex, wizardSteps.length - 1);
  const currentStep = wizardSteps[boundedStepIndex]!;

  const loadSources = useCallback(async () => {
    if (!mountedRef.current) return;
    setError(undefined);
    try {
      const [agentsResponse, skillsResponse] = await Promise.all([
        authActions.apiFetch("/agents"),
        authActions.apiFetch("/skills/installed")
      ]);

      const agentsBody = (await agentsResponse.json()) as { items?: AgentConfig[]; message?: string };
      const skillsBody = (await skillsResponse.json()) as { items?: Skill[]; message?: string };

      if (!agentsResponse.ok) {
        throw new Error(agentsBody.message ?? `Unable to load agents (HTTP ${agentsResponse.status})`);
      }
      if (!skillsResponse.ok) {
        throw new Error(skillsBody.message ?? `Unable to load skills (HTTP ${skillsResponse.status})`);
      }

      if (!mountedRef.current) return;
      setAvailableManagers(agentsBody.items ?? []);
      setInstalledSkills(skillsBody.items ?? []);
    } catch (loadError) {
      if (!mountedRef.current) return;
      setError(loadError instanceof Error ? loadError.message : "Unable to load create-agent dependencies");
    }
  }, [authActions]);

  useEffect(() => {
    mountedRef.current = true;
    void loadSources();
    return () => {
      mountedRef.current = false;
    };
  }, [loadSources]);

  const toggleDesiredSkill = (skillName: string): void => {
    setDesiredSkills((current) =>
      current.includes(skillName)
        ? current.filter((item) => item !== skillName)
        : [...current, skillName]
    );
  };

  const toggleCapability = (capability: CapabilityClass): void => {
    setSelectedCapabilities((current) =>
      current.includes(capability)
        ? current.filter((item) => item !== capability)
        : [...current, capability]
    );
  };

  const managerOptions = useMemo(
    () => availableManagers.filter((agent) => agent.name !== name),
    [availableManagers, name]
  );

  const visibleSkills = useMemo(
    () =>
      installedSkills.filter((skill) => {
        if (skillScopeFilter === "all") return true;
        return resolveSkillScope(skill, auth.principal?.userId) === skillScopeFilter;
      }),
    [auth.principal?.userId, installedSkills, skillScopeFilter]
  );

  const generatedArtifacts = useMemo(
    () =>
      buildAgentArtifacts({
        name: name.trim() || "agent-draft",
        role: role.trim() || "project_coordinator",
        purpose: purpose.trim() || "Assist project delivery",
        description: description.trim() || "No mission description provided.",
        workMode,
        persona: persona.trim() || "Balanced collaborator",
        language: language.trim() || "en-US",
        tone: tone.trim(),
        capabilities: selectedCapabilities,
        desiredSkills,
        runtimeProfile
      }),
    [description, desiredSkills, language, name, persona, purpose, role, runtimeProfile, selectedCapabilities, tone, workMode]
  );

  const validateStep = useCallback(
    (targetStep: number): string | undefined => {
      if (targetStep === 0) {
        if (!name.trim()) return "Agent name is required.";
        if (!description.trim()) return "A short mission description is required.";
        if (!purpose.trim()) return "Purpose is required.";
      }
      if (targetStep === 1) {
        if (selectedCapabilities.length === 0) return "Select at least one capability.";
      }
      if (targetStep === 3) {
        if (!persona.trim()) return "Persona is required.";
        if (!language.trim()) return "Language is required.";
      }
      return undefined;
    },
    [description, language, name, persona, purpose, selectedCapabilities.length]
  );

  const goNext = (): void => {
    const validationIssue = validateStep(stepIndex);
    if (validationIssue) {
      setError(validationIssue);
      return;
    }
    setError(undefined);
    setStepIndex((current) => Math.min(current + 1, wizardSteps.length - 1));
  };

  const goBack = (): void => {
    setError(undefined);
    setStepIndex((current) => Math.max(current - 1, 0));
  };

  const submit = async (): Promise<void> => {
    for (let validationStep = 0; validationStep < wizardSteps.length - 1; validationStep += 1) {
      const validationIssue = validateStep(validationStep);
      if (validationIssue) {
        setError(validationIssue);
        setStepIndex(validationStep);
        return;
      }
    }

    setSaving(true);
    setError(undefined);
    try {
      const runtimeConfig = parseRuntimeConfig(runtimeConfigRaw);
      const existingProfile = asRecord(runtimeConfig.agentProfile) ?? {};
      const existingArtifacts = asRecord(existingProfile.artifacts) ?? {};
      const profile = {
        ...existingProfile,
        purpose: purpose.trim(),
        workMode,
        persona: persona.trim(),
        language: language.trim(),
        ...(tone.trim() ? { tone: tone.trim() } : {}),
        compatibility: Array.from(
          new Set([runtimeKindToCompatibilityAdapter(runtimeProfile.runtimeKind), runtimeProfile.runtimeKind])
        ),
        supportedProviders: [runtimeProfile.vendor],
        supportedModes: [runtimeProfile.runtimeKind, runtimeProfile.host, runtimeProfile.launchMode],
        artifacts: {
          ...existingArtifacts,
          ...(generatedArtifacts.agentMd ? { "agent.md": generatedArtifacts.agentMd } : {}),
          ...(generatedArtifacts.soulMd ? { "soul.md": generatedArtifacts.soulMd } : {})
        }
      };

      const response = await authActions.apiFetch("/agents", {
        method: "POST",
        body: JSON.stringify({
          name: name.trim(),
          role: role.trim(),
          icon: icon.trim(),
          description: description.trim(),
          adapterType: runtimeKindToCompatibilityAdapter(runtimeProfile.runtimeKind),
          desiredSkills,
          reportTo: reportTo.trim() || undefined,
          runtimeConfig: {
            ...runtimeConfig,
            language: language.trim(),
            agentProfile: profile
          },
          runtimeProfile,
          heartbeatPolicy,
          capabilities: selectedCapabilities,
          status: "active"
        })
      });
      const body = (await response.json()) as { item?: AgentConfig; message?: string };
      if (!response.ok || !body.item) {
        throw new Error(body.message ?? `Unable to create agent (HTTP ${response.status})`);
      }
      await navigate({ to: "/settings/agents/$agentId", params: { agentId: body.item.id } });
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Unable to create agent");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <Panel>
        <SectionHeading
          title="Agent creation wizard"
          subtitle="Intent-driven setup"
          action={
            <Button variant="secondary" onClick={() => void navigate({ to: "/settings/agents" })}>
              Back to Agents
            </Button>
          }
        />
        <p className="text-sm text-slate-300">
          Create an agent profile in five short steps. Technical runtime payload stays backward-compatible.
        </p>
        <div className="mt-4 space-y-3" data-testid="agent-create-wizard">
          <div className="grid gap-2 md:grid-cols-5">
            {wizardSteps.map((step, index) => {
              const active = index === stepIndex;
              const complete = index < stepIndex;
              return (
                <button
                  type="button"
                  key={step.id}
                  onClick={() => index <= stepIndex && setStepIndex(index)}
                  className={`rounded-xl border px-3 py-2 text-left ${
                    active
                      ? "border-cyan-400/40 bg-cyan-400/10 text-cyan-100"
                      : complete
                        ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-100"
                        : "border-white/10 bg-white/5 text-slate-300"
                  }`}
                >
                  <div className="text-xs uppercase tracking-[0.14em]">Step {index + 1}</div>
                  <div className="mt-1 text-sm font-semibold">{step.title}</div>
                </button>
              );
            })}
          </div>
          <ProgressBar value={((stepIndex + 1) / wizardSteps.length) * 100} />
          <p className="text-xs text-cyan-100/80">
            Step {stepIndex + 1} of {wizardSteps.length} · {currentStep.title} · {currentStep.subtitle}
          </p>
          {error ? <p className="text-sm text-rose-300">{error}</p> : null}
        </div>
      </Panel>

      {stepIndex === 0 ? (
        <Panel>
          <SectionHeading title="Purpose" subtitle="Identity and mission" />
          <div className="grid gap-2 md:grid-cols-2">
            <Input value={name} onChange={setName} placeholder="Agent name (e.g. codex-builder-primary)" />
            <Input value={role} onChange={setRole} placeholder="Role (e.g. project_coordinator)" />
            <Input value={icon} onChange={setIcon} placeholder="Icon label (e.g. tool, brain, search)" />
          </div>
          <div className="mt-3">
            <label className="label">Purpose</label>
            <textarea
              value={purpose}
              onChange={(event) => setPurpose(event.target.value)}
              placeholder="What outcomes should this agent own?"
              className="mt-2 min-h-20 w-full rounded-xl border border-white/10 bg-slate-950/40 px-3 py-2 text-sm text-white outline-none placeholder:text-slate-500 focus:border-cyan-400/40"
            />
          </div>
          <div className="mt-3">
            <label className="label">Mission context</label>
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Describe the scope and expected contribution in plain language."
              className="mt-2 min-h-24 w-full rounded-xl border border-white/10 bg-slate-950/40 px-3 py-2 text-sm text-white outline-none placeholder:text-slate-500 focus:border-cyan-400/40"
            />
          </div>
        </Panel>
      ) : null}

      {stepIndex === 1 ? (
        <Panel>
          <SectionHeading title="Work mode" subtitle="Collaboration and capabilities" />
          <div className="grid gap-2 md:grid-cols-2">
            <label className="space-y-1 text-sm text-slate-200">
              <span className="label">Work mode</span>
              <select
                value={workMode}
                onChange={(event) => setWorkMode(event.target.value)}
                className="w-full rounded-xl border border-white/10 bg-slate-950/40 px-3 py-2 text-sm text-white outline-none focus:border-cyan-400/40"
              >
                <option value="coordinator">Coordinator</option>
                <option value="builder">Builder</option>
                <option value="validator">Validator</option>
                <option value="specialist">Specialist</option>
              </select>
            </label>
            <label className="space-y-1 text-sm text-slate-200">
              <span className="label">Reports to</span>
              <select
                value={reportTo}
                onChange={(event) => setReportTo(event.target.value)}
                className="w-full rounded-xl border border-white/10 bg-slate-950/40 px-3 py-2 text-sm text-white outline-none focus:border-cyan-400/40"
              >
                <option value="">No manager</option>
                {managerOptions.map((agent) => (
                  <option key={agent.id} value={agent.name}>
                    {agent.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="mt-4">
            <div className="label">Capabilities</div>
            <div className="mt-2 flex flex-wrap gap-2">
              {capabilityClasses.map((capability) => {
                const selected = selectedCapabilities.includes(capability);
                return (
                  <button
                    type="button"
                    key={capability}
                    onClick={() => toggleCapability(capability)}
                    className={`rounded-xl border px-3 py-2 text-sm transition ${
                      selected
                        ? "border-cyan-400/30 bg-cyan-400/10 text-cyan-100"
                        : "border-white/10 bg-white/5 text-slate-200 hover:bg-white/10"
                    }`}
                  >
                    {capability}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="mt-4">
            <div className="flex flex-wrap items-center gap-2">
              <div className="label">Desired skills</div>
              <select
                value={skillScopeFilter}
                onChange={(event) => setSkillScopeFilter(event.target.value as "all" | SkillScope)}
                className="rounded-xl border border-white/10 bg-slate-950/40 px-3 py-2 text-sm text-white outline-none focus:border-cyan-400/40"
              >
                <option value="all">All scopes</option>
                <option value="system">System skills</option>
                <option value="tenant">Tenant skills</option>
                <option value="user">User skills</option>
              </select>
            </div>
            <div className="mt-2 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
              {visibleSkills.map((skill) => {
                const selected = desiredSkills.includes(skill.name);
                return (
                  <div
                    key={skill.id}
                    className={`rounded-xl border p-3 text-left text-sm ${
                      selected
                        ? "border-cyan-400/30 bg-cyan-400/10 text-cyan-100"
                        : "border-white/10 bg-white/5 text-slate-200"
                    }`}
                  >
                    <div className="font-medium">{skill.name}</div>
                    <div className="mt-1 text-xs text-slate-400">{skill.repositoryUrl}</div>
                    <div className="mt-1 text-xs text-cyan-100/80">
                      scope: {resolveSkillScope(skill, auth.principal?.userId)}
                    </div>
                    <div className="mt-3">
                      <Button variant={selected ? "secondary" : "primary"} onClick={() => toggleDesiredSkill(skill.name)}>
                        {selected ? "Unassign" : "Assign"}
                      </Button>
                    </div>
                  </div>
                );
              })}
              {visibleSkills.length === 0 ? (
                <p className="text-sm text-slate-400">No installed skills found. Install from the Skills page first.</p>
              ) : null}
            </div>
          </div>
        </Panel>
      ) : null}

      {stepIndex === 2 ? (
        <Panel>
          <SectionHeading title="Runtime host + provider" subtitle="Execution profile and heartbeat policy" />
          <RuntimeProfilePicker
            value={runtimeProfile}
            onChange={setRuntimeProfile}
            title="Runtime profile"
            subtitle="Choose runtime family, provider/runtime implementation and execution host."
          />
          <details className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-4">
            <summary className="cursor-pointer list-none text-sm font-semibold text-slate-100">
              Advanced heartbeat policy
            </summary>
            <div className="mt-4">
              <HeartbeatPolicyEditor
                value={heartbeatPolicy}
                onChange={setHeartbeatPolicy}
                title="Agent heartbeat policy"
                subtitle="Schedule and trigger policy for this agent"
              />
            </div>
          </details>
        </Panel>
      ) : null}

      {stepIndex === 3 ? (
        <Panel>
          <SectionHeading title="Persona + language" subtitle="Voice and output defaults" />
          <div className="grid gap-2 md:grid-cols-2">
            <Input value={language} onChange={setLanguage} placeholder="Language (e.g. en-US)" />
            <Input value={tone} onChange={setTone} placeholder="Tone (e.g. clear, direct, pragmatic)" />
          </div>
          <div className="mt-3">
            <label className="label">Persona</label>
            <textarea
              value={persona}
              onChange={(event) => setPersona(event.target.value)}
              placeholder="Describe how the agent should reason, communicate and escalate."
              className="mt-2 min-h-24 w-full rounded-xl border border-white/10 bg-slate-950/40 px-3 py-2 text-sm text-white outline-none placeholder:text-slate-500 focus:border-cyan-400/40"
            />
          </div>
          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            <div className="rounded-xl border border-white/10 bg-slate-950/30 p-3">
              <div className="label">Generated agent.md preview</div>
              <pre className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap text-xs text-slate-200">
                {generatedArtifacts.agentMd}
              </pre>
            </div>
            <div className="rounded-xl border border-white/10 bg-slate-950/30 p-3">
              <div className="label">Generated soul.md preview</div>
              <pre className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap text-xs text-slate-200">
                {generatedArtifacts.soulMd}
              </pre>
            </div>
          </div>
        </Panel>
      ) : null}

      {stepIndex === 4 ? (
        <Panel>
          <SectionHeading title="Review" subtitle="Final payload before creation" />
          <div className="grid gap-3 lg:grid-cols-2">
            <div className="rounded-xl border border-white/10 bg-white/5 p-3 text-sm text-slate-200">
              <div className="label">Identity</div>
              <p className="mt-2">
                {icon} <span className="font-semibold text-white">{name || "Unnamed agent"}</span>
              </p>
              <p className="mt-1 text-xs text-slate-400">role: {role || "project_coordinator"}</p>
              <p className="mt-1 text-xs text-slate-400">work mode: {workMode}</p>
              <p className="mt-1 text-xs text-slate-400">language: {language || "en-US"}</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/5 p-3 text-sm text-slate-200">
              <div className="label">Runtime compatibility</div>
              <p className="mt-2 text-xs text-slate-400">family: {runtimeKindLabels[runtimeProfile.runtimeKind]}</p>
              <p className="mt-1 text-xs text-slate-400">vendor: {runtimeVendorLabels[runtimeProfile.vendor]}</p>
              <p className="mt-1 text-xs text-slate-400">host: {runtimeHostLabels[runtimeProfile.host]}</p>
              <p className="mt-1 text-xs text-slate-400">launch: {launchModeLabels[runtimeProfile.launchMode]}</p>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Pill tone="default">capabilities {selectedCapabilities.length}</Pill>
            <Pill tone="default">skills {desiredSkills.length}</Pill>
            <Pill tone="accent">adapter {runtimeKindToCompatibilityAdapter(runtimeProfile.runtimeKind)}</Pill>
          </div>
          <details className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-4">
            <summary className="cursor-pointer list-none text-sm font-semibold text-slate-100">
              Raw runtime config
            </summary>
            <div className="mt-4">
              <textarea
                value={runtimeConfigRaw}
                onChange={(event) => setRuntimeConfigRaw(event.target.value)}
                className="min-h-40 w-full rounded-xl border border-white/10 bg-slate-950/40 px-3 py-2 font-mono text-xs text-white outline-none focus:border-cyan-400/40"
              />
            </div>
          </details>
        </Panel>
      ) : null}

      <Panel>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" onClick={goBack} disabled={stepIndex === 0 || saving}>
            Previous
          </Button>
          {stepIndex < wizardSteps.length - 1 ? (
            <Button variant="primary" onClick={goNext} disabled={saving}>
              Continue
            </Button>
          ) : (
            <Button variant="primary" onClick={() => void submit()} disabled={saving}>
              {saving ? "Creating..." : "Create agent"}
            </Button>
          )}
        </div>
      </Panel>
    </div>
  );
}
