import { createPathAllowCheck } from "./utils.mjs";

export default {
  meta: {
    type: "problem",
    docs: {
      description: "Block direct @cp/subprompts imports outside packages/prompt-builder."
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
      noDirectImport:
        "Direct @cp/subprompts import is forbidden outside prompt-builder. Use @cp/prompt-builder adapters."
    }
  },
  create(context) {
    const { isAllowedFile } = createPathAllowCheck(context, context.options?.[0]);
    if (isAllowedFile()) return {};

    return {
      ImportDeclaration(node) {
        if (node.source?.value === "@cp/subprompts") {
          context.report({ node, messageId: "noDirectImport" });
        }
      }
    };
  }
};
