import { useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { capabilityClasses, type AgentConfig, type AgentRuntimeProfile, type CapabilityClass, type HeartbeatPolicy, type Skill } from "@cp/domain";
import { Button, Input, Panel, Pill, SectionHeading } from "@/components/common";
import { HeartbeatPolicyEditor } from "@/components/runtime-profile/HeartbeatPolicyEditor";
import { RuntimeProfilePicker } from "@/components/runtime-profile/RuntimeProfilePicker";
import { defaultRuntimeProfile, runtimeKindToCompatibilityAdapter } from "@/components/runtime-profile/runtime-profile-utils";
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

const parseRuntimeConfig = (raw: string): Record<string, unknown> => {
  const parsed = JSON.parse(raw) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Runtime config must be a JSON object");
  }
  return parsed as Record<string, unknown>;
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
  const [name, setName] = useState("");
  const [role, setRole] = useState("codex_builder");
  const [icon, setIcon] = useState("tool");
  const [description, setDescription] = useState("");
  const [runtimeProfile, setRuntimeProfile] = useState<AgentRuntimeProfile>(defaultRuntimeProfile("mcp_bridge"));
  const [heartbeatPolicy, setHeartbeatPolicy] = useState<HeartbeatPolicy>(defaultHeartbeatPolicy);
  const [reportTo, setReportTo] = useState("");
  const [desiredSkills, setDesiredSkills] = useState<string[]>([]);
  const [skillScopeFilter, setSkillScopeFilter] = useState<"all" | SkillScope>("all");
  const [selectedCapabilities, setSelectedCapabilities] = useState<CapabilityClass[]>(["coding"]);
  const [runtimeConfigRaw, setRuntimeConfigRaw] = useState(JSON.stringify(defaultRuntimeConfig, null, 2));
  const [error, setError] = useState<string | undefined>();
  const [saving, setSaving] = useState(false);

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

  const submit = async (): Promise<void> => {
    if (!name.trim()) {
      setError("Name is required.");
      return;
    }
    if (!description.trim()) {
      setError("Description is required.");
      return;
    }
    if (selectedCapabilities.length === 0) {
      setError("Select at least one capability.");
      return;
    }

    setSaving(true);
    setError(undefined);
    try {
      const runtimeConfig = parseRuntimeConfig(runtimeConfigRaw);
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
          runtimeConfig,
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
          title="Create Agent"
          subtitle="Role-based creation workflow"
          action={
            <Button variant="secondary" onClick={() => void navigate({ to: "/settings/agents" })}>
              Back to Agents
            </Button>
          }
        />
        <p className="text-sm text-slate-300">
          Define identity, reporting line, capabilities, skills and runtime options in one guided flow.
        </p>
        {error ? <p className="mt-3 text-sm text-rose-300">{error}</p> : null}
      </Panel>

      <Panel>
        <SectionHeading title="Identity" subtitle="Name, role, icon, purpose" />
        <div className="grid gap-2 md:grid-cols-2">
          <Input value={name} onChange={setName} placeholder="Agent name (e.g. codex-builder-primary)" />
          <Input value={role} onChange={setRole} placeholder="Role (e.g. codex_builder)" />
          <Input value={icon} onChange={setIcon} placeholder="Icon label (e.g. tool, brain, search)" />
        </div>
        <div className="mt-2">
          <textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Describe what this agent is expected to do and in which scope."
            className="min-h-24 w-full rounded-xl border border-white/10 bg-slate-950/40 px-3 py-2 text-sm text-white outline-none placeholder:text-slate-500 focus:border-cyan-400/40"
          />
        </div>
      </Panel>

      <Panel>
        <SectionHeading title="Manager + Skills" subtitle="Reporting line and desired skills" />
        <div className="grid gap-3 lg:grid-cols-[240px_minmax(0,1fr)]">
          <div className="space-y-2">
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
            <select
              value={skillScopeFilter}
              onChange={(event) => setSkillScopeFilter(event.target.value as "all" | SkillScope)}
              className="w-full rounded-xl border border-white/10 bg-slate-950/40 px-3 py-2 text-sm text-white outline-none focus:border-cyan-400/40"
            >
              <option value="all">All scopes</option>
              <option value="system">System skills</option>
              <option value="tenant">Tenant skills</option>
              <option value="user">User skills</option>
            </select>
          </div>
          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
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
                  <div className="mt-1 text-xs text-cyan-100/80">scope: {resolveSkillScope(skill, auth.principal?.userId)}</div>
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

      <Panel>
        <SectionHeading title="Capabilities + Runtime" subtitle="Execution profile" />
        <div className="flex flex-wrap gap-2">
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
        <div className="mt-4">
          <RuntimeProfilePicker
            value={runtimeProfile}
            onChange={setRuntimeProfile}
            title="Runtime profile"
            subtitle="Select the runtime family, vendor implementation, host and launch mode"
          />
        </div>
        <div className="mt-4">
          <HeartbeatPolicyEditor
            value={heartbeatPolicy}
            onChange={setHeartbeatPolicy}
            title="Agent heartbeat policy"
            subtitle="Schedule and trigger policy for this agent"
          />
        </div>
        <div className="mt-4">
          <div className="label">Advanced runtime config</div>
          <textarea
            value={runtimeConfigRaw}
            onChange={(event) => setRuntimeConfigRaw(event.target.value)}
            className="mt-2 min-h-48 w-full rounded-xl border border-white/10 bg-slate-950/40 px-3 py-2 font-mono text-xs text-white outline-none focus:border-cyan-400/40"
          />
        </div>
        <div className="mt-3 flex items-center gap-2">
          <Button variant="primary" onClick={() => void submit()}>
            {saving ? "Creating..." : "Create agent"}
          </Button>
          <Pill tone="default">desiredSkills: {desiredSkills.length}</Pill>
          <Pill tone="default">capabilities: {selectedCapabilities.length}</Pill>
        </div>
      </Panel>
    </div>
  );
}
