import path from "node:path";
import type { AgentRoleName, CapabilityClass } from "@cp/domain";
export * from "./service.js";

export interface AgentRoleDefinition {
  role: AgentRoleName;
  title: string;
  purpose: string;
  constraints: string[];
  requiredInputSchema: string;
  requiredOutputSchema: string;
  stopConditions: string[];
  qualityRules: string[];
  auditRequirements: string[];
  promptPath: string;
  capabilityNeeds: CapabilityClass[];
}

const prompt = (name: string) => path.join(process.cwd(), "configs/prompts/roles", `${name}.md`);

export const AGENT_ROLE_DEFINITIONS: AgentRoleDefinition[] = [
  {
    role: "planner",
    title: "Planner / Spec Writer",
    purpose: "Translate rough intent into structured roadmap/task artifacts.",
    constraints: ["Must not write implementation code", "Must output structured artifacts only"],
    requiredInputSchema: "planner-input:v1",
    requiredOutputSchema: "planner-output.schema.ts",
    stopConditions: ["No unresolved high-impact ambiguity", "Task specs are execution ready"],
    qualityRules: ["Scope clarity", "Risk visibility", "Verification readiness"],
    auditRequirements: ["Assumptions recorded", "Files likely touched recorded"],
    promptPath: prompt("planner"),
    capabilityNeeds: ["chat_reasoning"]
  },
  {
    role: "codex_builder",
    title: "Codex Builder",
    purpose: "Implement approved tasks within scope and verification constraints.",
    constraints: ["No scope expansion", "Structured handoff required"],
    requiredInputSchema: "task-spec.schema.ts",
    requiredOutputSchema: "builder-handoff.schema.ts",
    stopConditions: ["Implementation complete", "Verification executed"],
    qualityRules: ["Minimal churn", "Deterministic outputs"],
    auditRequirements: ["Commands run", "Files changed", "Risks"],
    promptPath: prompt("codex-builder"),
    capabilityNeeds: ["coding"]
  },
  {
    role: "codex_refactor",
    title: "Codex Refactor",
    purpose: "Apply safe refactors preserving behavior unless explicitly allowed.",
    constraints: ["Behavior preserving by default", "No noisy churn"],
    requiredInputSchema: "task-spec.schema.ts",
    requiredOutputSchema: "refactor-handoff.schema.ts",
    stopConditions: ["Refactor goals complete", "Verification executed"],
    qualityRules: ["Readability", "Maintainability", "Minimal risk"],
    auditRequirements: ["Behavior preservation notes"],
    promptPath: prompt("codex-refactor"),
    capabilityNeeds: ["coding"]
  },
  {
    role: "claude_debugger",
    title: "Claude Debugger",
    purpose: "Debug regressions from concrete evidence and narrow fixes.",
    constraints: ["Evidence-first", "Narrow reversible fixes"],
    requiredInputSchema: "debugger-input:v1",
    requiredOutputSchema: "debugger-handoff.schema.ts",
    stopConditions: ["Root cause confidence acceptable", "Fix strategy validated"],
    qualityRules: ["Root cause != symptom", "Uncertainty explicit"],
    auditRequirements: ["Evidence list", "Confidence level"],
    promptPath: prompt("claude-debugger"),
    capabilityNeeds: ["chat_reasoning", "coding"]
  },
  {
    role: "gemini_researcher",
    title: "Gemini Researcher",
    purpose: "Collect primary source technical evidence and summarize risks.",
    constraints: ["Primary sources first", "No speculative claims"],
    requiredInputSchema: "research-input:v1",
    requiredOutputSchema: "researcher-handoff.schema.ts",
    stopConditions: ["Question answered", "Caveats documented"],
    qualityRules: ["Source quality", "Breaking changes highlighted"],
    auditRequirements: ["Source list with links"],
    promptPath: prompt("gemini-researcher"),
    capabilityNeeds: ["chat_reasoning"]
  },
  {
    role: "image_designer",
    title: "Image Designer",
    purpose: "Generate project assets from text or structured briefs.",
    constraints: ["Use structured generation request", "Return reusable asset metadata"],
    requiredInputSchema: "image-design-input:v1",
    requiredOutputSchema: "builder-handoff.schema.ts",
    stopConditions: ["Requested assets generated", "Formats validated"],
    qualityRules: ["Brand consistency", "Resolution suitability"],
    auditRequirements: ["Model used", "Prompt used", "Outputs"],
    promptPath: prompt("image-designer"),
    capabilityNeeds: ["image_generation"]
  },
  {
    role: "image_editor",
    title: "Image Editor",
    purpose: "Edit existing assets with structured operations and traceable outputs.",
    constraints: ["Preserve source traceability", "No hidden transformations"],
    requiredInputSchema: "image-edit-input:v1",
    requiredOutputSchema: "builder-handoff.schema.ts",
    stopConditions: ["Edit complete", "Output asset validated"],
    qualityRules: ["Operation fidelity", "Format compatibility"],
    auditRequirements: ["Source asset refs", "Operation details"],
    promptPath: prompt("image-editor"),
    capabilityNeeds: ["image_editing", "vision_analysis"]
  }
];
