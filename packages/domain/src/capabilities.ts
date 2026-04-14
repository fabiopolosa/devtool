export const capabilityClasses = [
  "chat_reasoning",
  "coding",
  "embedding",
  "image_generation",
  "image_editing",
  "vision_analysis"
] as const;

export type CapabilityClass = (typeof capabilityClasses)[number];

export const providerNames = [
  "openai",
  "anthropic",
  "gemini",
  "openrouter",
  "kie_ai",
  "mistral",
  "cohere",
  "ai21",
  "zhipu",
  "meta_llama",
  "databricks_dbrx",
  "xai",
  "amazon_bedrock",
  "aleph_alpha"
] as const;
export type ProviderName = (typeof providerNames)[number];

export const agentRoles = [
  "planner",
  "codex_builder",
  "codex_refactor",
  "claude_debugger",
  "gemini_researcher",
  "image_designer",
  "image_editor",
  "verifier"
] as const;
export type AgentRoleName = (typeof agentRoles)[number];
