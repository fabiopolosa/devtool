export type SkillScope = "system" | "tenant" | "user";
export type SkillSourceType = "github" | "file" | "zip";
export type SkillValidationStatus = "pending" | "valid" | "invalid";

export interface SkillSandboxProfile {
  filesystem: "read_only" | "workspace_only" | "full";
  network: boolean;
  networkAllowlist?: string[];
  process: boolean;
}

export interface SkillExecutionConfig {
  commandAllowlist: string[];
  requireConfirmation: boolean;
  timeoutMs?: number;
  entryCommand?: string;
  entryArgs?: string[];
}

export interface SkillVersionRecord {
  version: string;
  sourceRef?: string;
  installedAt: string;
  installedBy: string;
  notes?: string;
}

export interface Skill {
  id: string;
  name: string;
  description: string;
  repositoryUrl: string;
  version: string;
  installed: boolean;
  categories: string[];
  instructions: string;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
  scope?: SkillScope;
  sourceType?: SkillSourceType;
  sourceRef?: string;
  capabilities?: string[];
  validationStatus?: SkillValidationStatus;
  validationErrors?: string[];
  validationWarnings?: string[];
  lastValidatedAt?: string;
  sandboxProfile?: SkillSandboxProfile;
  executionConfig?: SkillExecutionConfig;
  currentVersion?: string;
  versionHistory?: SkillVersionRecord[];
  metadata?: Record<string, unknown>;
}
