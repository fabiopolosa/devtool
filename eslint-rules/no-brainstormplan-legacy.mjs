import { getPropertyName } from "./utils.mjs";

const forbiddenProperties = new Set(["recommendedStack", "roadmap", "risks"]);

export default {
  meta: {
    type: "problem",
    docs: {
      description: "Disallow legacy brainstormPlan field access outside plan.*."
    },
    schema: [],
    messages: {
      noLegacy:
        "Legacy BrainstormPlan access '{{property}}' is forbidden. Use brainstormPlan.plan.{{property}}."
    }
  },
  create(context) {
    return {
      MemberExpression(node) {
        if (node.object?.type !== "Identifier" || node.object.name !== "brainstormPlan") return;
        const property = getPropertyName(node.property);
        if (!property || !forbiddenProperties.has(property)) return;
        context.report({ node, messageId: "noLegacy", data: { property } });
      }
    };
  }
};
