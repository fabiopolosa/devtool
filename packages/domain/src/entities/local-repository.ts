export type LocalRepositoryStatus = "active" | "disabled" | "error";

export interface LocalRepository {
  id: string;
  name: string;
  rootPath: string;
  description: string;
  status: LocalRepositoryStatus;
  detectedGit: boolean;
  currentBranch?: string;
  lastCommitSha?: string;
  indexedFileCount: number;
  lastScannedAt?: string;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
}
