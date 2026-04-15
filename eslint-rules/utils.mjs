import path from "node:path";

const normalizePath = (value) => value.split(path.sep).join("/");

const defaultAllowWithin = Object.freeze([]);

export const createPathAllowCheck = (context, options = {}) => {
  const allowWithin = Array.isArray(options.allowWithin) ? options.allowWithin : defaultAllowWithin;
  const filename = normalizePath(context.getFilename?.() ?? "");
  const allowed = allowWithin.map((segment) => normalizePath(segment));

  const isAllowedFile = () => {
    if (!filename || filename === "<input>") return false;
    return allowed.some((segment) => filename.includes(segment));
  };

  return {
    filename,
    isAllowedFile
  };
};

export const getPropertyName = (node) => {
  if (!node) return null;
  if (node.type === "Identifier") return node.name;
  if (node.type === "Literal" && typeof node.value === "string") return node.value;
  return null;
};

export const isStringLiteralLike = (node) =>
  Boolean(
    node &&
      ((node.type === "Literal" && typeof node.value === "string") ||
        node.type === "TemplateLiteral")
  );

export const walkNode = (node, visitor, seen = new WeakSet()) => {
  if (!node || typeof node !== "object") return;
  if (seen.has(node)) return;
  seen.add(node);

  visitor(node);

  for (const [key, value] of Object.entries(node)) {
    // ESLint AST nodes may contain cyclic parent references.
    if (key === "parent" || !value) continue;

    if (Array.isArray(value)) {
      for (const item of value) {
        walkNode(item, visitor, seen);
      }
      continue;
    }

    walkNode(value, visitor, seen);
  }
};

export const containsPromptReference = (node) => {
  let found = false;
  walkNode(node, (child) => {
    if (found) return;
    if (child.type === "Identifier" && /prompt/i.test(child.name)) {
      found = true;
      return;
    }
    if (child.type === "MemberExpression") {
      const name = getPropertyName(child.property);
      if (name && /prompt/i.test(name)) {
        found = true;
      }
    }
  });
  return found;
};

export const isStringConcatenation = (node) => {
  if (!node || node.type !== "BinaryExpression" || node.operator !== "+") return false;
  if (isStringLiteralLike(node.left) || isStringLiteralLike(node.right)) return true;
  return isStringConcatenation(node.left) || isStringConcatenation(node.right);
};
