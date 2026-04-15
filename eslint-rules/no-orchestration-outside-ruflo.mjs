import { createPathAllowCheck } from "./utils.mjs";

export default {
  meta: {
    type: "problem",
    docs: {
      description: "Disallow direct @cp/orchestration-ruflo imports outside allowed boundaries."
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
      forbiddenImport:
        "Direct @cp/orchestration-ruflo import is forbidden outside approved runtime boundaries."
    }
  },
  create(context) {
    const { isAllowedFile } = createPathAllowCheck(context, context.options?.[0]);
    if (isAllowedFile()) return {};

    return {
      ImportDeclaration(node) {
        if (node.source?.value === "@cp/orchestration-ruflo") {
          context.report({ node, messageId: "forbiddenImport" });
        }
      }
    };
  }
};
