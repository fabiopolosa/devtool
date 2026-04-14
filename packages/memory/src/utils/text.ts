export const normalizeText = (value: string): string =>
  value.replace(/\r\n/g, "\n").replace(/[\t ]+/g, " ").trim();

export const estimateTokens = (value: string): number => Math.max(1, Math.ceil(value.length / 4));

export const splitIntoParagraphs = (value: string): string[] =>
  normalizeText(value)
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean);

export const firstSentence = (value: string): string => {
  const normalized = normalizeText(value);
  const match = normalized.match(/^(.+?[.!?])(\s|$)/);
  return match?.[1] ?? normalized.slice(0, 240);
};

export const stripMarkdown = (value: string): string =>
  normalizeText(value)
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^[-*+]\s+/gm, "")
    .replace(/`{1,3}([^`]+)`{1,3}/g, "$1")
    .replace(/\[(.*?)\]\((.*?)\)/g, "$1");
