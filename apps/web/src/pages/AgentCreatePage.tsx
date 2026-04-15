import { useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { capabilityClasses, type AgentConfig, type CapabilityClass, type Skill } from "@cp/domain";
import { Button, Input, Panel, Pill, SectionHeading } from "@/components/common";
import { useAppStore } from "@/store/app-store";

const defaultRuntimeConfig = {
  commandPrefix: "paperclipai",
  timeoutMs: 60000,
  maxRetries: 2
};

const parseRuntimeConfig = (raw: string): Record<string, unknown> => {
  const parsed = JSON.parse(raw) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Runtime config must be a JSON object");
  }
  return parsed as Record<string, unknown>;
};

export function AgentCreatePage() {
  const navigate = useNavigate();
  const { authActions } = useAppStore();
  const [availableManagers, setAvailableManagers] = useState<AgentConfig[]>([]);
  const [installedSkills, setInstalledSkills] = useState<Skill[]>([]);
  const [name, setName] = useState("");
  const [role, setRole] = useState("codex_builder");
  const [icon, setIcon] = useState("tool");
  const [description, setDescription] = useState("");
  const [adapterType, setAdapterType] = useState<"paperclip_cli" | "custom_cli" | "mcp_runtime">("paperclip_cli");
  const [reportTo, setReportTo] = useState("");
  const [desiredSkills, setDesiredSkills] = useState<string[]>([]);
  const [selectedCapabilities, setSelectedCapabilities] = useState<CapabilityClass[]>(["coding"]);
  const [runtimeConfigRaw, setRuntimeConfigRaw] = useState(JSON.stringify(defaultRuntimeConfig, null, 2));
  const [error, setError] = useState<string | undefined>();
  const [saving, setSaving] = useState(false);

  const loadSources = useCallback(async () => {
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

      setAvailableManagers(agentsBody.items ?? []);
      setInstalledSkills(skillsBody.items ?? []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load create-agent dependencies");
    }
  }, [authActions]);

  useEffect(() => {
    void loadSources();
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
          adapterType,
          desiredSkills,
          reportTo: reportTo.trim() || undefined,
          runtimeConfig,
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
          subtitle="Paperclip-style creation workflow"
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
          <select
            value={adapterType}
            onChange={(event) => setAdapterType(event.target.value as "paperclip_cli" | "custom_cli" | "mcp_runtime")}
            className="rounded-xl border border-white/10 bg-slate-950/40 px-3 py-2 text-sm text-white outline-none focus:border-cyan-400/40"
          >
            <option value="paperclip_cli">paperclip_cli</option>
            <option value="custom_cli">custom_cli</option>
            <option value="mcp_runtime">mcp_runtime</option>
          </select>
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
          <select
            value={reportTo}
            onChange={(event) => setReportTo(event.target.value)}
            className="rounded-xl border border-white/10 bg-slate-950/40 px-3 py-2 text-sm text-white outline-none focus:border-cyan-400/40"
          >
            <option value="">No manager</option>
            {managerOptions.map((agent) => (
              <option key={agent.id} value={agent.name}>
                {agent.name}
              </option>
            ))}
          </select>
          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {installedSkills.map((skill) => {
              const selected = desiredSkills.includes(skill.name);
              return (
                <button
                  type="button"
                  key={skill.id}
                  onClick={() => toggleDesiredSkill(skill.name)}
                  className={`rounded-xl border p-3 text-left text-sm transition ${
                    selected
                      ? "border-cyan-400/30 bg-cyan-400/10 text-cyan-100"
                      : "border-white/10 bg-white/5 text-slate-200 hover:bg-white/10"
                  }`}
                >
                  <div className="font-medium">{skill.name}</div>
                  <div className="mt-1 text-xs text-slate-400">{skill.repositoryUrl}</div>
                </button>
              );
            })}
            {installedSkills.length === 0 ? (
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
        <textarea
          value={runtimeConfigRaw}
          onChange={(event) => setRuntimeConfigRaw(event.target.value)}
          className="mt-3 min-h-48 w-full rounded-xl border border-white/10 bg-slate-950/40 px-3 py-2 font-mono text-xs text-white outline-none focus:border-cyan-400/40"
        />
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
