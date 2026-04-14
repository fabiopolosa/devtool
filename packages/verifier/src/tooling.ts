import type { OptionalHookConfig, OptionalHookType } from "./pipeline.js";

export interface DashboardHookOptions {
  cwd?: string;
  includeSmoke?: boolean;
  includeVisual?: boolean;
  includePerformance?: boolean;
  visualRequired?: boolean;
  performanceRequired?: boolean;
}

export const buildDashboardHookConfig = (
  options: DashboardHookOptions = {}
): Partial<Record<OptionalHookType, OptionalHookConfig>> => {
  const cwd = options.cwd ?? process.cwd();

  const hooks: Partial<Record<OptionalHookType, OptionalHookConfig>> = {};

  if (options.includeSmoke ?? true) {
    hooks.smoke = {
      enabled: true,
      commands: ["pnpm verify:smoke"],
      cwd,
      required: false
    };
  }

  if (options.includeVisual ?? true) {
    hooks.visual = {
      enabled: true,
      commands: ["pnpm verify:visual"],
      cwd,
      required: options.visualRequired ?? false
    };
  }

  if (options.includePerformance ?? true) {
    hooks.performance = {
      enabled: true,
      commands: ["pnpm verify:performance"],
      cwd,
      required: options.performanceRequired ?? false
    };
  }

  return hooks;
};
