import { useMemo } from "react";
import type { AgentRuntimeProfile } from "@cp/domain";
import { Button, Input, Pill, SectionHeading } from "@/components/common";
import {
  defaultRuntimeProfile,
  launchModeOptions,
  launchModeLabels,
  normalizeRuntimeKindSelection,
  runtimeHostLabels,
  runtimeHostOptions,
  runtimeKindLabels,
  runtimeKindOptions,
  runtimeVendorLabels,
  runtimeVendorOptions
} from "./runtime-profile-utils";

type RuntimeProfilePickerProps = {
  value: AgentRuntimeProfile;
  onChange: (value: AgentRuntimeProfile) => void;
  title?: string;
  subtitle?: string;
  showSummary?: boolean;
  showRuntimeKindPicker?: boolean;
};

const parseArgList = (raw: string): string[] =>
  raw
    .split(/[\n,]/)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);

const stringifyArgList = (args: string[]): string => args.join("\n");

const parseOptionalNumber = (raw: string): number | undefined => {
  const normalized = raw.trim();
  if (!normalized) return undefined;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : undefined;
};

export function RuntimeProfilePicker({
  value,
  onChange,
  title = "Runtime profile",
  subtitle = "Family, vendor, host and launch mode",
  showSummary = true,
  showRuntimeKindPicker = true
}: RuntimeProfilePickerProps) {
  const kindOptions = runtimeKindOptions;
  const vendorOptions = runtimeVendorOptions[value.runtimeKind];
  const hostOptions = runtimeHostOptions[value.runtimeKind];
  const defaultProfile = useMemo(() => defaultRuntimeProfile(value.runtimeKind), [value.runtimeKind]);

  const update = (patch: Record<string, unknown>): void => {
    const nextArgs = Array.isArray(patch.args) ? (patch.args as string[]) : value.args;
    const nextMetadata =
      patch.metadata && typeof patch.metadata === "object" ? (patch.metadata as Record<string, unknown>) : value.metadata;
    onChange({
      ...value,
      ...patch,
      args: [...nextArgs],
      metadata: { ...nextMetadata }
    });
  };

  const setRuntimeKind = (runtimeKind: AgentRuntimeProfile["runtimeKind"]): void => {
    const defaults = normalizeRuntimeKindSelection(runtimeKind);
    const nextProfile: AgentRuntimeProfile = {
      ...defaults,
      metadata: value.metadata ?? {}
    };
    if (value.command !== undefined) nextProfile.command = value.command;
    if (value.args !== undefined) nextProfile.args = [...value.args];
    if (value.cwd !== undefined) nextProfile.cwd = value.cwd;
    if (value.mcpServerRef !== undefined) nextProfile.mcpServerRef = value.mcpServerRef;
    if (value.apiConfigRef !== undefined) nextProfile.apiConfigRef = value.apiConfigRef;
    if (value.workerPoolSize !== undefined) nextProfile.workerPoolSize = value.workerPoolSize;
    onChange(nextProfile);
  };

  return (
    <div className="space-y-4">
      <SectionHeading title={title} subtitle={subtitle} />

      {showSummary ? (
        <div className="flex flex-wrap gap-2">
          <Pill tone="default">family {runtimeKindLabels[value.runtimeKind]}</Pill>
          <Pill tone="default">vendor {runtimeVendorLabels[value.vendor]}</Pill>
          <Pill tone="default">host {runtimeHostLabels[value.host]}</Pill>
          <Pill tone="default">mode {launchModeLabels[value.launchMode]}</Pill>
        </div>
      ) : null}

      {showRuntimeKindPicker ? (
        <div className="grid gap-3 xl:grid-cols-5">
          {kindOptions.map((option) => {
            const selected = option.value === value.runtimeKind;
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => setRuntimeKind(option.value)}
                className={`rounded-2xl border p-3 text-left transition ${
                  selected
                    ? "border-cyan-400/40 bg-cyan-400/10 text-cyan-50"
                    : "border-white/10 bg-white/5 text-slate-200 hover:border-cyan-400/20 hover:bg-white/10"
                }`}
              >
                <div className="text-sm font-semibold">{option.label}</div>
                <div className="mt-1 text-xs text-slate-400">{option.description}</div>
              </button>
            );
          })}
        </div>
      ) : null}

      <div className="grid gap-3 md:grid-cols-3">
        <label className="space-y-1">
          <div className="label">Vendor</div>
          <select
            value={value.vendor}
            onChange={(event) => update({ vendor: event.target.value as AgentRuntimeProfile["vendor"] })}
            className="cp-input"
          >
            {vendorOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1">
          <div className="label">Execution host</div>
          <select
            value={value.host}
            onChange={(event) => update({ host: event.target.value as AgentRuntimeProfile["host"] })}
            className="cp-input"
          >
            {hostOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1">
          <div className="label">Launch mode</div>
          <select
            value={value.launchMode}
            onChange={(event) => update({ launchMode: event.target.value as AgentRuntimeProfile["launchMode"] })}
            className="cp-input"
          >
            {launchModeOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {value.runtimeKind === "server_api" ? (
        <div className="grid gap-3 md:grid-cols-2">
          <Input
            value={value.apiConfigRef ?? ""}
            onChange={(apiConfigRef) => update(apiConfigRef.trim() ? { apiConfigRef: apiConfigRef.trim() } : {})}
            placeholder="API config ref (optional)"
          />
          <Input
            value={String(value.workerPoolSize ?? "")}
            onChange={(raw) => {
              const workerPoolSize = parseOptionalNumber(raw);
              update(workerPoolSize === undefined ? {} : { workerPoolSize });
            }}
            placeholder="Worker pool size (optional)"
          />
        </div>
      ) : null}

      {value.runtimeKind !== "server_api" ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <Input
            value={value.command ?? ""}
            onChange={(command) => update(command.trim() ? { command: command.trim() } : {})}
            placeholder="Command"
          />
          <Input
            value={stringifyArgList(value.args)}
            onChange={(raw) => update({ args: parseArgList(raw) })}
            placeholder="Arguments, one per line or comma-separated"
          />
          <Input
            value={value.cwd ?? ""}
            onChange={(cwd) => update(cwd.trim() ? { cwd: cwd.trim() } : {})}
            placeholder="Working directory"
          />
        </div>
      ) : null}

      {value.runtimeKind === "mcp_bridge" || value.runtimeKind === "custom_command" || value.runtimeKind === "legacy_command" ? (
        <div className="grid gap-3 md:grid-cols-2">
          <Input
            value={value.mcpServerRef ?? ""}
            onChange={(mcpServerRef) => update(mcpServerRef.trim() ? { mcpServerRef: mcpServerRef.trim() } : {})}
            placeholder="MCP server ref (optional)"
          />
          <Input
            value={String(value.workerPoolSize ?? "")}
            onChange={(raw) => {
              const workerPoolSize = parseOptionalNumber(raw);
              update(workerPoolSize === undefined ? {} : { workerPoolSize });
            }}
            placeholder="Worker pool size (optional)"
          />
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Pill tone="default">defaults {runtimeVendorLabels[defaultProfile.vendor]}</Pill>
        <Pill tone="default">compatibility preserved under the hood</Pill>
      </div>

      <Button variant="secondary" onClick={() => onChange(defaultRuntimeProfile(value.runtimeKind))}>
        Reset to defaults
      </Button>
    </div>
  );
}
