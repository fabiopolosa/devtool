import { useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { capabilityClasses, type AgentConfig, type AgentRuntimeProfile, type CapabilityClass, type HeartbeatPolicy, type Skill } from "@cp/domain";
import { Button, Input, Panel, Pill, SectionHeading } from "@/components/common";
import { HeartbeatPolicyEditor } from "@/components/runtime-profile/HeartbeatPolicyEditor";
import { RuntimeProfilePicker } from "@/components/runtime-profile/RuntimeProfilePicker";
import {
  defaultRuntimeProfile,
  runtimeKindFromAdapterType,
  runtimeKindToCompatibilityAdapter
} from "@/components/runtime-profile/runtime-profile-utils";
import { useAppStore } from "@/store/app-store";
import { usePathParam } from "./_utils";

type AgentRuntimeJobReference = {
  jobId: string;
  operation: "heartbeat" | "diagnose";
};

type AgentRuntimeJobSnapshot = {
  jobId: string;
  state: string;
  progress: number;
  logs: string[];
  failedReason?: string;
};

const parseRuntimeConfig = (raw: string): Record<string, unknown> => {
  const parsed = JSON.parse(raw) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Runtime config must be a JSON object");
  }
  return parsed as Record<string, unknown>;
};

const defaultHeartbeatPolicy: HeartbeatPolicy = {
  interval: "manual",
  triggers: ["manual"],
  enabled: true,
  metadata: {}
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

const isTerminalRuntimeJobState = (state: string | undefined): boolean =>
  state === "completed" || state === "failed" || state === "error";

const resolveRuntimeJobPollDelay = (input: {
  state?: string;
  consecutiveFailures: number;
}): number => {
  if (input.consecutiveFailures > 0) {
    return Math.min(1000 * 2 ** input.consecutiveFailures, 10000);
  }
  if (input.state === "active" || input.state === "running") {
    return 1000;
  }
  return 2000;
};

export function AgentDetailPage() {
  const navigate = useNavigate();
  const { auth, authActions } = useAppStore();
  const agentId = usePathParam(1);
  const [agent, setAgent] = useState<AgentConfig | undefined>();
  const [allAgents, setAllAgents] = useState<AgentConfig[]>([]);
  const [installedSkills, setInstalledSkills] = useState<Skill[]>([]);
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [icon, setIcon] = useState("");
  const [description, setDescription] = useState("");
  const [runtimeProfile, setRuntimeProfile] = useState<AgentRuntimeProfile>(defaultRuntimeProfile("mcp_bridge"));
  const [heartbeatPolicy, setHeartbeatPolicy] = useState<HeartbeatPolicy>(defaultHeartbeatPolicy);
  const [reportTo, setReportTo] = useState("");
  const [status, setStatus] = useState<"active" | "paused" | "degraded" | "error">("active");
  const [desiredSkills, setDesiredSkills] = useState<string[]>([]);
  const [skillScopeFilter, setSkillScopeFilter] = useState<"all" | SkillScope>("all");
  const [selectedCapabilities, setSelectedCapabilities] = useState<CapabilityClass[]>([]);
  const [runtimeConfigRaw, setRuntimeConfigRaw] = useState("{}");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [jobRef, setJobRef] = useState<AgentRuntimeJobReference | undefined>();
  const [jobSnapshot, setJobSnapshot] = useState<AgentRuntimeJobSnapshot | undefined>();
  const jobPollFailureCountRef = useRef(0);

  const loadAll = useCallback(async () => {
    if (!agentId) return;
    setError(undefined);
    try {
      const [agentResponse, agentsResponse, skillsResponse] = await Promise.all([
        authActions.apiFetch(`/agents/${agentId}`),
        authActions.apiFetch("/agents"),
        authActions.apiFetch("/skills/installed")
      ]);

      const agentBody = (await agentResponse.json()) as { item?: AgentConfig; message?: string };
      const agentsBody = (await agentsResponse.json()) as { items?: AgentConfig[]; message?: string };
      const skillsBody = (await skillsResponse.json()) as { items?: Skill[]; message?: string };

      if (!agentResponse.ok || !agentBody.item) {
        throw new Error(agentBody.message ?? `Unable to load agent (HTTP ${agentResponse.status})`);
      }
      if (!agentsResponse.ok) {
        throw new Error(agentsBody.message ?? `Unable to load agents (HTTP ${agentsResponse.status})`);
      }
      if (!skillsResponse.ok) {
        throw new Error(skillsBody.message ?? `Unable to load skills (HTTP ${skillsResponse.status})`);
      }

      const loadedAgent = agentBody.item;
      setAgent(loadedAgent);
      setAllAgents(agentsBody.items ?? []);
      setInstalledSkills(skillsBody.items ?? []);

      setName(loadedAgent.name);
      setRole(loadedAgent.role);
      setIcon(loadedAgent.icon);
      setDescription(loadedAgent.description);
      setRuntimeProfile(
        loadedAgent.runtimeProfile ?? defaultRuntimeProfile(runtimeKindFromAdapterType(loadedAgent.adapterType))
      );
      setHeartbeatPolicy(loadedAgent.heartbeatPolicy ?? defaultHeartbeatPolicy);
      setReportTo(loadedAgent.reportTo ?? "");
      setStatus(loadedAgent.status);
      setDesiredSkills(loadedAgent.desiredSkills);
      setSelectedCapabilities(loadedAgent.capabilities);
      setRuntimeConfigRaw(JSON.stringify(loadedAgent.runtimeConfig, null, 2));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load agent detail");
    }
  }, [agentId, authActions]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  useEffect(() => {
    if (!agentId || !jobRef?.jobId) return;
    let stopped = false;
    let timer: number | undefined;

    const schedule = (delayMs: number): void => {
      if (stopped) return;
      timer = window.setTimeout(() => {
        void tick();
      }, delayMs);
    };

    const tick = async (): Promise<void> => {
      try {
        const { response, body } = await authActions.apiFetchJson<{ item?: AgentRuntimeJobSnapshot; message?: string }>(
          `/agents/${agentId}/jobs/${jobRef.jobId}`
        );
        if (!response.ok || !body.item) {
          throw new Error(body.message ?? `Unable to load runtime job (HTTP ${response.status})`);
        }
        if (stopped) return;
        jobPollFailureCountRef.current = 0;
        setJobSnapshot(body.item);
        if (isTerminalRuntimeJobState(body.item.state)) {
          return;
        }
        schedule(
          resolveRuntimeJobPollDelay({
            state: body.item.state,
            consecutiveFailures: jobPollFailureCountRef.current
          })
        );
      } catch {
        jobPollFailureCountRef.current += 1;
        if (stopped) return;
        schedule(
          resolveRuntimeJobPollDelay({
            consecutiveFailures: jobPollFailureCountRef.current
          })
        );
      }
    };

    schedule(0);

    return () => {
      stopped = true;
      if (timer !== undefined) {
        window.clearTimeout(timer);
      }
    };
  }, [agentId, authActions, jobRef?.jobId]);

  const managerOptions = useMemo(
    () => allAgents.filter((item) => item.id !== agent?.id),
    [allAgents, agent?.id]
  );

  const visibleSkills = useMemo(
    () =>
      installedSkills.filter((skill) => {
        if (skillScopeFilter === "all") return true;
        return resolveSkillScope(skill, auth.principal?.userId) === skillScopeFilter;
      }),
    [auth.principal?.userId, installedSkills, skillScopeFilter]
  );

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

  const save = async (): Promise<void> => {
    if (!agentId) return;
    if (!name.trim() || !description.trim() || !role.trim()) {
      setError("Name, role and description are required.");
      return;
    }
    setSaving(true);
    setError(undefined);
    try {
      const runtimeConfig = parseRuntimeConfig(runtimeConfigRaw);
      const response = await authActions.apiFetch(`/agents/${agentId}`, {
        method: "PUT",
        body: JSON.stringify({
          name: name.trim(),
          role: role.trim(),
          icon: icon.trim(),
          description: description.trim(),
          adapterType: runtimeKindToCompatibilityAdapter(runtimeProfile.runtimeKind),
          reportTo: reportTo.trim() || undefined,
          desiredSkills,
          runtimeConfig,
          runtimeProfile,
          heartbeatPolicy,
          capabilities: selectedCapabilities,
          status
        })
      });
      const body = (await response.json()) as { item?: AgentConfig; message?: string };
      if (!response.ok || !body.item) {
        throw new Error(body.message ?? `Unable to save agent (HTTP ${response.status})`);
      }
      setAgent(body.item);
      setRuntimeConfigRaw(JSON.stringify(body.item.runtimeConfig, null, 2));
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to save agent");
    } finally {
      setSaving(false);
    }
  };

  const runOperation = async (operation: "heartbeat" | "diagnose"): Promise<void> => {
    if (!agentId) return;
    setError(undefined);
    try {
      const response = await authActions.apiFetch(`/agents/${agentId}/${operation}`, {
        method: "POST",
        body: JSON.stringify({ reason: "manual_ui" })
      });
      const body = (await response.json()) as { item?: AgentRuntimeJobReference; message?: string };
      if (!response.ok || !body.item) {
        throw new Error(body.message ?? `Unable to run ${operation} (HTTP ${response.status})`);
      }
      setJobRef(body.item);
      setJobSnapshot(undefined);
    } catch (runError) {
      setError(runError instanceof Error ? runError.message : `Unable to run ${operation}`);
    }
  };

  const remove = async (): Promise<void> => {
    if (!agentId) return;
    setSaving(true);
    setError(undefined);
    try {
      const response = await authActions.apiFetch(`/agents/${agentId}`, { method: "DELETE" });
      if (!response.ok) {
        const body = (await response.json()) as { message?: string };
        throw new Error(body.message ?? `Unable to delete agent (HTTP ${response.status})`);
      }
      await navigate({ to: "/settings/agents" });
    } catch (removeError) {
      setError(removeError instanceof Error ? removeError.message : "Unable to delete agent");
    } finally {
      setSaving(false);
    }
  };

  if (!agentId) {
    return <Panel>No agent id provided.</Panel>;
  }

  return (
    <div className="space-y-5">
      <Panel>
        <SectionHeading
          title={agent ? `Agent · ${agent.name}` : "Agent detail"}
          subtitle={agentId}
          action={
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => void navigate({ to: "/settings/agents" })}>
                Back
              </Button>
              <Button onClick={() => void runOperation("heartbeat")}>Heartbeat</Button>
              <Button onClick={() => void runOperation("diagnose")}>Diagnose</Button>
            </div>
          }
        />
        {error ? <p className="text-sm text-rose-300">{error}</p> : null}
      </Panel>

      <Panel>
        <SectionHeading title="Configuration" subtitle="Identity and runtime" />
        <div className="grid gap-2 md:grid-cols-2">
          <Input value={name} onChange={setName} placeholder="Agent name" />
          <Input value={role} onChange={setRole} placeholder="Role" />
          <Input value={icon} onChange={setIcon} placeholder="Icon label" />
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value as "active" | "paused" | "degraded" | "error")}
            className="rounded-xl border border-white/10 bg-slate-950/40 px-3 py-2 text-sm text-white outline-none focus:border-cyan-400/40"
          >
            <option value="active">active</option>
            <option value="paused">paused</option>
            <option value="degraded">degraded</option>
            <option value="error">error</option>
          </select>
          <select
            value={reportTo}
            onChange={(event) => setReportTo(event.target.value)}
            className="rounded-xl border border-white/10 bg-slate-950/40 px-3 py-2 text-sm text-white outline-none focus:border-cyan-400/40"
          >
            <option value="">No manager</option>
            {managerOptions.map((item) => (
              <option key={item.id} value={item.name}>
                {item.name}
              </option>
            ))}
          </select>
        </div>
        <textarea
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          className="mt-2 min-h-20 w-full rounded-xl border border-white/10 bg-slate-950/40 px-3 py-2 text-sm text-white outline-none placeholder:text-slate-500 focus:border-cyan-400/40"
          placeholder="Describe the agent responsibilities."
        />
        <div className="mt-4">
          <RuntimeProfilePicker
            value={runtimeProfile}
            onChange={setRuntimeProfile}
            title="Runtime profile"
            subtitle="Family, vendor, host and launch mode"
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
            className="mt-2 min-h-40 w-full rounded-xl border border-white/10 bg-slate-950/40 px-3 py-2 font-mono text-xs text-white outline-none focus:border-cyan-400/40"
          />
        </div>
      </Panel>

      <Panel>
        <SectionHeading title="Capabilities and skills" subtitle="Runtime context inputs" />
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
        <div className="mt-3">
          <select
            value={skillScopeFilter}
            onChange={(event) => setSkillScopeFilter(event.target.value as "all" | SkillScope)}
            className="w-full rounded-xl border border-white/10 bg-slate-950/40 px-3 py-2 text-sm text-white outline-none focus:border-cyan-400/40 md:w-72"
          >
            <option value="all">All scopes</option>
            <option value="system">System skills</option>
            <option value="tenant">Tenant skills</option>
            <option value="user">User skills</option>
          </select>
        </div>
        <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
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
            <p className="text-sm text-slate-400">No installed skills found for this scope.</p>
          ) : null}
        </div>
      </Panel>

      <Panel>
        <SectionHeading title="Persist and lifecycle" subtitle="Save or remove agent" />
        <div className="flex flex-wrap gap-2">
          <Button variant="primary" onClick={() => void save()}>
            {saving ? "Saving..." : "Save changes"}
          </Button>
          <Button onClick={() => void remove()}>Delete agent</Button>
          <Pill tone="default">skills: {desiredSkills.length}</Pill>
          <Pill tone="default">capabilities: {selectedCapabilities.length}</Pill>
        </div>
        {jobRef ? (
          <div className="mt-4 rounded-xl border border-white/10 bg-white/5 p-3 text-sm">
            <div className="flex items-center justify-between gap-3">
              <span className="text-white">
                runtime job {jobRef.jobId} · {jobRef.operation}
              </span>
              <span className="text-slate-400">{jobSnapshot?.state ?? "queued"}</span>
            </div>
            <div className="mt-2 space-y-1 text-xs text-slate-300">
              {(jobSnapshot?.logs ?? ["Waiting for logs..."]).slice(-6).map((line, index) => (
                <div key={`${jobRef.jobId}:${index}`}>{line}</div>
              ))}
            </div>
          </div>
        ) : null}
      </Panel>
    </div>
  );
}
