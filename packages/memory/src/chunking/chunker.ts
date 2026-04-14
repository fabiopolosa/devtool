import type { ChunkingPolicy, MemoryCategory, MemoryChunk, MemoryEntry } from "@cp/domain";
import { chunkIdFor, newId } from "../utils/ids.js";
import { estimateTokens, firstSentence, normalizeText, splitIntoParagraphs, stripMarkdown } from "../utils/text.js";

const splitByHeadings = (value: string): string[] => {
  const normalized = value.replace(/\r\n/g, "\n");
  const lines = normalized.split("\n");
  const chunks: string[] = [];
  let current: string[] = [];

  const flush = () => {
    const text = current.join("\n").trim();
    if (text) chunks.push(text);
    current = [];
  };

  for (const line of lines) {
    if (/^#{1,6}\s+/.test(line) && current.length > 0) {
      flush();
      current.push(line);
      continue;
    }
    if (!line.trim() && current.length > 0) {
      current.push(line);
      continue;
    }
    current.push(line);
  }

  flush();
  return chunks.length > 0 ? chunks : [normalized.trim()];
};

const splitErrorText = (value: string): string[] => {
  const normalized = normalizeText(value);
  const sections = normalized.split(/(?=^(?:Error|Exception|Caused by|Stack trace|Traceback))/gim).map((part) => part.trim()).filter(Boolean);
  if (sections.length > 1) return sections;
  return splitIntoParagraphs(normalized);
};

const splitTaskText = (value: string): string[] => {
  const sections = splitByHeadings(value);
  if (sections.length > 1) return sections;
  return splitIntoParagraphs(value);
};

const splitOversizedSegment = (segment: string, policy: ChunkingPolicy): string[] => {
  const normalized = normalizeText(segment);
  if (estimateTokens(normalized) <= policy.maxTokens) {
    return [normalized];
  }

  const words = normalized.split(/\s+/).filter(Boolean);
  const maxWords = Math.max(1, policy.maxTokens * 4);
  const overlapWords = Math.max(0, policy.overlapTokens * 4);
  const chunks: string[] = [];
  let start = 0;

  while (start < words.length) {
    const end = Math.min(words.length, start + maxWords);
    const slice = words.slice(start, end).join(" ").trim();
    if (slice) chunks.push(slice);
    if (end >= words.length) break;
    start = Math.max(end - overlapWords, start + 1);
  }

  return chunks.length > 0 ? chunks : [normalized];
};

const chunkSegments = (segments: string[], policy: ChunkingPolicy): string[] => {
  const output: string[] = [];
  let buffer: string[] = [];
  let bufferTokens = 0;

  const flush = () => {
    const text = normalizeText(buffer.join("\n\n"));
    if (!text) {
      buffer = [];
      bufferTokens = 0;
      return;
    }
    output.push(text);
    buffer = [];
    bufferTokens = 0;
  };

  for (const segment of segments) {
    const exploded = splitOversizedSegment(segment, policy);
    for (const part of exploded) {
      const tokens = estimateTokens(part);
      if (bufferTokens + tokens > policy.targetTokens && buffer.length > 0) {
        flush();
      }
      buffer.push(part);
      bufferTokens += tokens;
      if (bufferTokens >= policy.maxTokens) {
        flush();
      }
    }
  }

  flush();
  return output;
};

const splitByCategory = (entry: MemoryEntry, policy: ChunkingPolicy): string[] => {
  let segments: string[];
  switch (entry.category) {
    case "error_report":
      segments = splitErrorText(entry.body);
      break;
    case "task_summary":
    case "roadmap_note":
      segments = splitTaskText(entry.body);
      break;
    case "adr":
    case "architecture_note":
    case "project_overview":
    case "coding_standard":
    case "repo_local_instruction":
    case "prompt_policy_note":
    case "research_note":
    case "run_summary":
      segments = policy.splitByHeadings ? splitByHeadings(entry.body) : splitIntoParagraphs(entry.body);
      break;
    default:
      segments = splitIntoParagraphs(entry.body);
      break;
  }

  return chunkSegments(segments, policy);
};

const summarizeChunk = (category: MemoryCategory, title: string, text: string): string => {
  const cleaned = stripMarkdown(text);
  const label = title.trim() || category.replace(/_/g, " ");
  return `${label}: ${firstSentence(cleaned)}`;
};

export interface MemoryChunkingStrategy {
  chunk(entry: MemoryEntry, policy: ChunkingPolicy): Promise<MemoryChunk[]>;
}

export class DefaultMemoryChunkingService implements MemoryChunkingStrategy {
  async chunk(entry: MemoryEntry, policy: ChunkingPolicy): Promise<MemoryChunk[]> {
    const rawSegments = splitByCategory(entry, policy);
    const chunks: MemoryChunk[] = [];

    for (const [index, rawSegment] of rawSegments.entries()) {
      const chunkText = normalizeText(rawSegment);
      if (!chunkText) continue;
      chunks.push({
        id: chunkIdFor(entry.id, index),
        memoryEntryId: entry.id,
        projectId: entry.projectId,
        ...(entry.repositoryId ? { repositoryId: entry.repositoryId } : {}),
        category: entry.category,
        chunkIndex: index,
        chunkText,
        chunkTitle: summarizeChunk(entry.category, entry.title, chunkText),
        tokenEstimate: estimateTokens(chunkText),
        metadata: {
          sourceRef: entry.sourceRef ?? "",
          pinned: entry.pinned,
          priority: entry.priority,
          freshnessTtlHours: entry.freshnessTtlHours ?? 0
        },
        embeddingRef: newId(),
        createdAt: entry.updatedAt,
        createdBy: entry.updatedBy,
        updatedAt: entry.updatedAt,
        updatedBy: entry.updatedBy
      });
    }

    if (chunks.length === 0) {
      chunks.push({
        id: chunkIdFor(entry.id, 0),
        memoryEntryId: entry.id,
        projectId: entry.projectId,
        ...(entry.repositoryId ? { repositoryId: entry.repositoryId } : {}),
        category: entry.category,
        chunkIndex: 0,
        chunkText: normalizeText(entry.body),
        chunkTitle: summarizeChunk(entry.category, entry.title, entry.body),
        tokenEstimate: estimateTokens(entry.body),
        metadata: {
          sourceRef: entry.sourceRef ?? "",
          pinned: entry.pinned,
          priority: entry.priority,
          freshnessTtlHours: entry.freshnessTtlHours ?? 0
        },
        embeddingRef: newId(),
        createdAt: entry.updatedAt,
        createdBy: entry.updatedBy,
        updatedAt: entry.updatedAt,
        updatedBy: entry.updatedBy
      });
    }

    return chunks;
  }
}
