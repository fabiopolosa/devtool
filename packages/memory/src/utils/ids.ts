import { randomUUID } from "node:crypto";

export const newId = (): string => randomUUID();

export const chunkIdFor = (memoryEntryId: string, chunkIndex: number): string =>
  `${memoryEntryId}:chunk:${chunkIndex}`;
