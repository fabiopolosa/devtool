import type { AgentRuntimeAdapterType, AgentRuntimeProfile, HeartbeatPolicy } from "@cp/domain";
import { Panel, Pill } from "@/components/common";
import {
  describeHeartbeatPolicy,
  describeRuntimeProfile,
  resolveRuntimeProfileForAgent,
  runtimeHostLabels,
  runtimeKindLabels,
  runtimeVendorLabels,
  launchModeLabels
} from "./runtime-profile-utils";

type RuntimeProfileSummaryProps = {
  profile?: Partial<AgentRuntimeProfile> | null;
  adapterType?: AgentRuntimeAdapterType;
  heartbeatPolicy?: HeartbeatPolicy | null;
  title?: string;
  subtitle?: string;
  compact?: boolean;
};

export function RuntimeProfileSummary({
  profile,
  adapterType,
  heartbeatPolicy,
  title = "Runtime profile",
  subtitle,
  compact = false
}: RuntimeProfileSummaryProps) {
  const resolvedProfile = profile ?? (adapterType ? resolveRuntimeProfileForAgent({ adapterType }) : undefined);
  const runtimeKind = resolvedProfile?.runtimeKind ?? "mcp_bridge";
  const vendor = resolvedProfile?.vendor ?? "generic_cli";
  const host = resolvedProfile?.host ?? "local_worker";
  const launchMode = resolvedProfile?.launchMode ?? "queued";

  if (!resolvedProfile) {
    return (
      <Panel className={compact ? "p-3" : ""}>
        <div className="label">{subtitle ?? "Runtime"}</div>
        <div className="mt-1 text-sm text-slate-300">No runtime profile configured yet.</div>
      </Panel>
    );
  }

  return (
    <Panel className={compact ? "p-3" : ""}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="label">{subtitle ?? "Runtime"}</div>
          <h3 className="mt-1 text-lg font-semibold text-white">{title}</h3>
        </div>
        <Pill tone="accent">{runtimeKindLabels[runtimeKind] ?? runtimeKind}</Pill>
      </div>
      <p className="mt-3 text-sm text-slate-300">{describeRuntimeProfile(resolvedProfile)}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Pill tone="default">vendor {runtimeVendorLabels[vendor] ?? vendor}</Pill>
        <Pill tone="default">host {runtimeHostLabels[host] ?? host}</Pill>
        <Pill tone="default">mode {launchModeLabels[launchMode] ?? launchMode}</Pill>
      </div>
      {resolvedProfile.command ? <p className="mt-3 text-xs text-slate-400">command {resolvedProfile.command}</p> : null}
      {resolvedProfile.cwd ? <p className="mt-1 text-xs text-slate-400">cwd {resolvedProfile.cwd}</p> : null}
      {resolvedProfile.mcpServerRef ? <p className="mt-1 text-xs text-slate-400">mcp {resolvedProfile.mcpServerRef}</p> : null}
      {resolvedProfile.apiConfigRef ? <p className="mt-1 text-xs text-slate-400">api {resolvedProfile.apiConfigRef}</p> : null}
      {typeof resolvedProfile.workerPoolSize === "number" ? (
        <p className="mt-1 text-xs text-slate-400">worker pool {resolvedProfile.workerPoolSize}</p>
      ) : null}
      {heartbeatPolicy ? <p className="mt-3 text-xs text-cyan-100/80">Heartbeat {describeHeartbeatPolicy(heartbeatPolicy)}</p> : null}
    </Panel>
  );
}
