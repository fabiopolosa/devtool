import type { AgentConfig, AgentRuntimeProfile, CapabilityClass } from "@cp/domain";

export type AgentLibraryGroup = "system" | "tenant" | "project_assigned";

export const agentLibraryGroupLabels: Record<AgentLibraryGroup, string> = {
  system: "System library",
  tenant: "Tenant library",
  project_assigned: "Project-assigned"
};

export type AgentProfileArtifacts = {
  agentMd?: string;
  soulMd?: string;
};

export type AgentProfileSnapshot = {
  purpose?: string;
  workMode?: string;
  persona?: string;
  language?: string;
  tone?: string;
  compatibility: string[];
  supportedProviders: string[];
  supportedModes: string[];
  artifacts: AgentProfileArtifacts;
};

const asRecord = (value: unknown): Record<string, unknown> | undefined => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  return value as Record<string, unknown>;
};

const asString = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;

const asStringArray = (value: unknown): string[] =>
  Array.isArray(value) ? value.map((entry) => asString(entry)).filter((entry): entry is string => Boolean(entry)) : [];

const unique = (values: string[]): string[] => [...new Set(values.filter((value) => value.trim().length > 0))];

const resolveScope = (value: string | undefined): AgentLibraryGroup | undefined => {
  if (!value) return undefined;
  const normalized = value.trim().toLowerCase();
  if (normalized === "system") return "system";
  if (normalized === "project" || normalized === "project_assigned") return "project_assigned";
  if (normalized === "tenant") return "tenant";
  return undefined;
};

export const classifyAgentLibraryGroup = (agent: AgentConfig): AgentLibraryGroup => {
  const runtimeConfig = asRecord(agent.runtimeConfig) ?? {};
  const runtimeProfileMetadata = asRecord(agent.runtimeProfile?.metadata) ?? {};

  const scoped =
    resolveScope(asString(runtimeProfileMetadata.scope)) ??
    resolveScope(asString(runtimeConfig.scope)) ??
    resolveScope(asString((asRecord(runtimeConfig.agentProfile) ?? {}).scope));
  if (scoped) return scoped;

  const projectPointer =
    asString(runtimeProfileMetadata.projectId) ??
    asString(runtimeConfig.projectId) ??
    asString(runtimeConfig.workspaceId) ??
    asString(runtimeConfig.assignedProjectId);
  if (projectPointer) {
    return "project_assigned";
  }

  const normalizedRole = agent.role.toLowerCase();
  const normalizedName = agent.name.toLowerCase();
  const normalizedDescription = agent.description.toLowerCase();
  if (
    normalizedRole.startsWith("system") ||
    normalizedName.startsWith("system") ||
    normalizedDescription.includes("system agent")
  ) {
    return "system";
  }

  return "tenant";
};

const resolveSupportedModes = (profileRecord: Record<string, unknown>, runtimeProfile?: AgentRuntimeProfile): string[] => {
  const explicit = asStringArray(profileRecord.supportedModes);
  if (explicit.length > 0) return explicit;
  if (!runtimeProfile) return [];
  return unique([runtimeProfile.runtimeKind, runtimeProfile.host, runtimeProfile.launchMode]);
};

const resolveSupportedProviders = (
  profileRecord: Record<string, unknown>,
  runtimeProfile?: AgentRuntimeProfile
): string[] => {
  const explicit = asStringArray(profileRecord.supportedProviders);
  if (explicit.length > 0) return explicit;
  const runtimeVendor = asString(runtimeProfile?.vendor);
  return runtimeVendor ? [runtimeVendor] : [];
};

export const extractAgentProfile = (agent: AgentConfig): AgentProfileSnapshot => {
  const runtimeConfig = asRecord(agent.runtimeConfig) ?? {};
  const profileRecord = asRecord(runtimeConfig.agentProfile) ?? {};
  const artifactsRecord = asRecord(profileRecord.artifacts) ?? {};
  const runtimeMetadata = asRecord(agent.runtimeProfile?.metadata) ?? {};
  const resolvedAgentMd = asString(artifactsRecord["agent.md"]) ?? asString(profileRecord.agentMd);
  const resolvedSoulMd = asString(artifactsRecord["soul.md"]) ?? asString(profileRecord.soulMd);
  const artifacts: AgentProfileArtifacts = {
    ...(resolvedAgentMd ? { agentMd: resolvedAgentMd } : {}),
    ...(resolvedSoulMd ? { soulMd: resolvedSoulMd } : {})
  };

  const compatibility = unique(
    [
      ...asStringArray(profileRecord.compatibility),
      asString(agent.adapterType),
      asString(agent.runtimeProfile?.runtimeKind)
    ].filter((entry): entry is string => Boolean(entry))
  );

  const resolvedPurpose = asString(profileRecord.purpose) ?? agent.description;
  const resolvedWorkMode = asString(profileRecord.workMode);
  const resolvedPersona = asString(profileRecord.persona);
  const resolvedLanguage =
    asString(profileRecord.language) ??
    asString(runtimeConfig.language) ??
    asString(runtimeMetadata.language);
  const resolvedTone = asString(profileRecord.tone);

  return {
    ...(resolvedPurpose ? { purpose: resolvedPurpose } : {}),
    ...(resolvedWorkMode ? { workMode: resolvedWorkMode } : {}),
    ...(resolvedPersona ? { persona: resolvedPersona } : {}),
    ...(resolvedLanguage ? { language: resolvedLanguage } : {}),
    ...(resolvedTone ? { tone: resolvedTone } : {}),
    compatibility,
    supportedProviders: resolveSupportedProviders(profileRecord, agent.runtimeProfile),
    supportedModes: resolveSupportedModes(profileRecord, agent.runtimeProfile),
    artifacts
  };
};

export type BuildAgentArtifactsInput = {
  name: string;
  role: string;
  purpose: string;
  description: string;
  workMode: string;
  persona: string;
  language: string;
  tone?: string;
  capabilities: CapabilityClass[];
  desiredSkills: string[];
  runtimeProfile: AgentRuntimeProfile;
};

export const buildAgentArtifacts = (input: BuildAgentArtifactsInput): AgentProfileArtifacts => {
  const capabilities = input.capabilities.length > 0 ? input.capabilities.join(", ") : "none";
  const skills = input.desiredSkills.length > 0 ? input.desiredSkills.join(", ") : "none";
  const tone = input.tone?.trim().length ? input.tone.trim() : "balanced, pragmatic and transparent";

  const agentMd = [
    `# ${input.name}`,
    "",
    `Role: ${input.role}`,
    `Purpose: ${input.purpose}`,
    `Work mode: ${input.workMode}`,
    `Language: ${input.language}`,
    "",
    "## Mission",
    input.description,
    "",
    "## Capabilities",
    capabilities,
    "",
    "## Skills",
    skills,
    "",
    "## Runtime",
    `- Runtime family: ${input.runtimeProfile.runtimeKind}`,
    `- Vendor: ${input.runtimeProfile.vendor}`,
    `- Host: ${input.runtimeProfile.host}`,
    `- Launch mode: ${input.runtimeProfile.launchMode}`
  ].join("\n");

  const soulMd = [
    `# Soul · ${input.name}`,
    "",
    "## Persona",
    input.persona,
    "",
    "## Interaction style",
    `- Tone: ${tone}`,
    `- Default language: ${input.language}`,
    "",
    "## Behavior guardrails",
    "- Prefer clarity over verbosity.",
    "- Ask for missing context only when it materially changes outcomes.",
    "- Keep execution aligned with project and runtime constraints."
  ].join("\n");

  return { agentMd, soulMd };
};
