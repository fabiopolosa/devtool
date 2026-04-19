import type { HeartbeatPolicy } from "@cp/domain";
import { Button, Pill, SectionHeading } from "@/components/common";
import {
  heartbeatIntervalOptions,
  heartbeatIntervalLabels,
  heartbeatTriggerOptions,
  heartbeatTriggerLabels
} from "./runtime-profile-utils";

type HeartbeatPolicyEditorProps = {
  value: HeartbeatPolicy;
  onChange: (value: HeartbeatPolicy) => void;
  title?: string;
  subtitle?: string;
  showEnabledToggle?: boolean;
  showSummary?: boolean;
};

const toggleTrigger = (triggers: HeartbeatPolicy["triggers"], trigger: HeartbeatPolicy["triggers"][number]): HeartbeatPolicy["triggers"] => {
  if (triggers.includes(trigger)) {
    const next = triggers.filter((entry) => entry !== trigger);
    return next.length > 0 ? next : ["manual"];
  }
  return [...triggers, trigger];
};

export function HeartbeatPolicyEditor({
  value,
  onChange,
  title = "Heartbeat policy",
  subtitle = "Schedule and triggers",
  showEnabledToggle = true,
  showSummary = true
}: HeartbeatPolicyEditorProps) {
  return (
    <div className="space-y-4">
      <SectionHeading title={title} subtitle={subtitle} />

      <div className={`grid gap-3 ${showEnabledToggle ? "md:grid-cols-2" : ""}`}>
        <label className="space-y-1">
          <div className="label">Interval</div>
          <select
            value={value.interval}
            onChange={(event) =>
              onChange({
                ...value,
                interval: event.target.value as HeartbeatPolicy["interval"]
              })
            }
            className="cp-input"
          >
            {heartbeatIntervalOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        {showEnabledToggle ? (
          <label className="space-y-1">
            <div className="label">Enabled</div>
            <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2">
              <input
                checked={value.enabled}
                onChange={(event) =>
                  onChange({
                    ...value,
                    enabled: event.target.checked
                  })
                }
                type="checkbox"
                className="h-4 w-4 rounded border-white/20 bg-transparent text-cyan-400 focus:ring-cyan-400"
              />
              <span className="text-sm text-slate-200">Heartbeat is active</span>
            </div>
          </label>
        ) : null}
      </div>

      <div className="space-y-2">
        <div className="label">Triggers</div>
        <div className="flex flex-wrap gap-2">
          {heartbeatTriggerOptions.map((option) => {
            const selected = value.triggers.includes(option.value);
            return (
              <button
                key={option.value}
                type="button"
                onClick={() =>
                  onChange({
                    ...value,
                    triggers: toggleTrigger(value.triggers, option.value)
                  })
                }
                className={`rounded-xl border px-3 py-2 text-sm transition ${
                  selected
                    ? "border-cyan-400/30 bg-cyan-400/10 text-cyan-100"
                    : "border-white/10 bg-white/5 text-slate-200 hover:bg-white/10"
                }`}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      </div>

      {showSummary ? (
        <div className="flex flex-wrap gap-2">
          <Pill tone="default">interval {heartbeatIntervalLabels[value.interval]}</Pill>
          {value.triggers.map((trigger) => (
            <Pill key={trigger} tone={trigger === "manual" ? "accent" : "default"}>
              {heartbeatTriggerLabels[trigger]}
            </Pill>
          ))}
        </div>
      ) : null}

      <Button
        variant="secondary"
        onClick={() =>
          onChange({
            ...value,
            interval: "manual",
            triggers: ["manual"],
            enabled: true
          })
        }
      >
        Reset heartbeat policy
      </Button>
    </div>
  );
}
