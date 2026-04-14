export const normalizeText = (value: string): string =>
  value.replace(/\r\n/g, "\n").replace(/[\t ]+/g, " ").trim();

export const estimateTokens = (value: string): number => Math.max(1, Math.ceil(value.length / 4));

export const truncate = (value: string, maxChars: number): string => {
  const normalized = normalizeText(value);
  if (normalized.length <= maxChars) return normalized;
  return `${normalized.slice(0, Math.max(0, maxChars - 3)).trimEnd()}...`;
};

export const cosineSimilarity = (left: number[], right: number[]): number => {
  const length = Math.min(left.length, right.length);
  if (length === 0) return 0;
  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;
  for (let index = 0; index < length; index += 1) {
    const l = left[index] ?? 0;
    const r = right[index] ?? 0;
    dot += l * r;
    leftNorm += l * l;
    rightNorm += r * r;
  }
  if (leftNorm === 0 || rightNorm === 0) return 0;
  return dot / (Math.sqrt(leftNorm) * Math.sqrt(rightNorm));
};

export const uniqueBy = <T>(values: T[], keyFn: (value: T) => string): T[] => {
  const seen = new Set<string>();
  const result: T[] = [];
  for (const value of values) {
    const key = keyFn(value);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(value);
  }
  return result;
};
