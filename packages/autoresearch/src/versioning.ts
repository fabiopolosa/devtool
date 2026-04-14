export interface PromptVersionRef {
  promptId: string;
  version: string;
  contentRef: string;
}

export interface RoutingPolicyVersionRef {
  policyId: string;
  version: string;
  contentRef: string;
}

export interface ExperimentVersionRefs {
  prompt?: PromptVersionRef;
  routingPolicy?: RoutingPolicyVersionRef;
  budgetPolicy?: { policyId: string; version: string; contentRef: string };
  contextPacketFormat?: { formatId: string; version: string; contentRef: string };
}
