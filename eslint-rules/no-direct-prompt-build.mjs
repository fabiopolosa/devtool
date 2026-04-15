import {
  containsPromptReference,
  createPathAllowCheck,
  getPropertyName,
  isStringConcatenation
} from "./utils.mjs";

const isDynamicTemplate = (node) =>
  Boolean(node && node.type === "TemplateLiteral" && node.expressions.length > 0);

const isPromptVariableName = (name) => typeof name === "string" && /prompt/i.test(name);

const isManualPromptComposition = (node) =>
  Boolean(
    node &&
      ((isStringConcatenation(node) && containsPromptReference(node)) ||
        (isDynamicTemplate(node) && containsPromptReference(node)))
  );

export default {
  meta: {
    type: "problem",
    docs: {
      description: "Require all prompt composition to flow through packages/prompt-builder."
    },
    schema: [
      {
        type: "object",
        properties: {
          allowWithin: {
            type: "array",
            items: { type: "string" }
          }
        },
        additionalProperties: false
      }
    ],
    messages: {
      directPromptVar:
        "Direct prompt variable declarations are forbidden outside prompt-builder. Use @cp/prompt-builder.",
      manualComposition:
        "Manual prompt composition is forbidden outside prompt-builder. Use @cp/prompt-builder.",
      promptAssignment:
        "Assignments to a prompt variable are forbidden outside prompt-builder."
    }
  },
  create(context) {
    const { isAllowedFile } = createPathAllowCheck(context, context.options?.[0]);
    if (isAllowedFile()) return {};

    return {
      VariableDeclarator(node) {
        if (node.id?.type === "Identifier") {
          const variableName = node.id.name;
          if (variableName === "prompt") {
            context.report({ node, messageId: "directPromptVar" });
            return;
          }

          if (node.init && isPromptVariableName(variableName)) {
            if (isStringConcatenation(node.init) || isDynamicTemplate(node.init)) {
              context.report({ node, messageId: "manualComposition" });
              return;
            }
          }
        }

        if (node.init && isManualPromptComposition(node.init)) {
          context.report({ node, messageId: "manualComposition" });
        }
      },

      AssignmentExpression(node) {
        if (node.left?.type === "Identifier" && node.left.name === "prompt") {
          context.report({ node, messageId: "promptAssignment" });
          return;
        }

        if (isManualPromptComposition(node.right)) {
          context.report({ node, messageId: "manualComposition" });
        }
      },

      Property(node) {
        const propertyName = getPropertyName(node.key);
        if (!propertyName || !isPromptVariableName(propertyName)) return;
        if (isManualPromptComposition(node.value)) {
          context.report({ node, messageId: "manualComposition" });
        }
      }
    };
  }
};
