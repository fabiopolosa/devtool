import { constants as fsConstants } from "node:fs";
import { access, lstat, readdir, realpath } from "node:fs/promises";
import path from "node:path";

const asString = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;

const normalizeForPrefix = (value: string): string => {
  const resolved = path.resolve(value);
  return resolved.endsWith(path.sep) ? resolved : `${resolved}${path.sep}`;
};

export const getWorkspaceAllowedRoots = (): string[] => {
  const raw = process.env.WORKSPACE_ALLOWED_ROOTS ?? process.env.WORKSPACE_ALLOWED_ROOT ?? "";
  return raw
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
    .map((entry) => path.resolve(entry));
};

export const isPathWithinRoot = (candidatePath: string, rootPath: string): boolean => {
  const normalizedCandidate = normalizeForPrefix(candidatePath);
  const normalizedRoot = normalizeForPrefix(rootPath);
  return normalizedCandidate === normalizedRoot || normalizedCandidate.startsWith(normalizedRoot);
};

export interface WorkspaceBrowserRoot {
  path: string;
  name: string;
  exists: boolean;
  isDirectory: boolean;
  readable: boolean;
  writable: boolean;
  executable: boolean;
}

export interface WorkspaceBrowserEntry {
  name: string;
  path: string;
  kind: "directory" | "file" | "symlink" | "other";
  isDirectory: boolean;
  isFile: boolean;
  isSymlink: boolean;
}

export interface WorkspaceBrowserListing {
  path?: string;
  resolvedPath?: string;
  root?: string;
  allowedRoots: WorkspaceBrowserRoot[];
  entries: WorkspaceBrowserEntry[];
  parentPath?: string;
  currentRoot?: string;
  currentName?: string;
}

export class WorkspaceBrowserPathError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WorkspaceBrowserPathError";
  }
}

const resolveBrowserPath = async (value: string): Promise<{ path: string; resolvedPath: string }> => {
  const candidatePath = path.resolve(value);
  const stats = await lstat(candidatePath);
  if (stats.isSymbolicLink()) {
    throw new WorkspaceBrowserPathError("Symbolic links are not allowed in workspace browsing.");
  }
  const resolvedPath = await realpath(candidatePath);
  return { path: candidatePath, resolvedPath };
};

const ensureWithinAllowedRoots = (resolvedPath: string): WorkspaceBrowserRoot | null => {
  const roots = getWorkspaceAllowedRoots();
  if (roots.length === 0) return null;
  const matchedRoot = roots.find((root) => isPathWithinRoot(resolvedPath, root));
  return matchedRoot
    ? {
        path: matchedRoot,
        name: path.basename(matchedRoot) || matchedRoot,
        exists: true,
        isDirectory: true,
        readable: true,
        writable: true,
        executable: true
      }
    : null;
};

export const listWorkspaceBrowserRoots = async (): Promise<WorkspaceBrowserListing> => {
  const allowedRoots = await Promise.all(
    getWorkspaceAllowedRoots().map(async (rootPath) => {
      try {
        const stats = await lstat(rootPath);
        if (stats.isSymbolicLink()) {
          return {
            path: rootPath,
            name: path.basename(rootPath) || rootPath,
            exists: true,
            isDirectory: false,
            readable: false,
            writable: false,
            executable: false
          };
        }
        const readable = await access(rootPath, fsConstants.R_OK).then(
          () => true,
          () => false
        );
        const writable = await access(rootPath, fsConstants.W_OK).then(
          () => true,
          () => false
        );
        const executable = await access(rootPath, fsConstants.X_OK).then(
          () => true,
          () => false
        );
        return {
          path: rootPath,
          name: path.basename(rootPath) || rootPath,
          exists: true,
          isDirectory: stats.isDirectory(),
          readable,
          writable,
          executable
        };
      } catch {
        return {
          path: rootPath,
          name: path.basename(rootPath) || rootPath,
          exists: false,
          isDirectory: false,
          readable: false,
          writable: false,
          executable: false
        };
      }
    })
  );

  return {
    allowedRoots,
    entries: []
  };
};

export const browseWorkspacePath = async (input: {
  path?: string | undefined;
}): Promise<WorkspaceBrowserListing> => {
  const allowedRoots = getWorkspaceAllowedRoots();
  if (allowedRoots.length === 0) {
    return {
      allowedRoots: [],
      entries: []
    };
  }

  if (!input.path) {
    return {
      allowedRoots: await listWorkspaceBrowserRoots().then((listing) => listing.allowedRoots),
      entries: []
    };
  }

  const rawPath = asString(input.path);
  if (!rawPath) {
    throw new WorkspaceBrowserPathError("path is required");
  }

  const { path: candidatePath, resolvedPath } = await resolveBrowserPath(rawPath);
  const matchedRoot = ensureWithinAllowedRoots(resolvedPath);
  if (!matchedRoot) {
    throw new WorkspaceBrowserPathError("Workspace path is outside configured allowed roots.");
  }

  const entries = await readdir(resolvedPath, { withFileTypes: true });
  const browserEntries: WorkspaceBrowserEntry[] = entries
    .map((entry) => ({
      name: entry.name,
      path: path.join(candidatePath, entry.name),
      kind: (entry.isDirectory()
        ? "directory"
        : entry.isFile()
          ? "file"
          : entry.isSymbolicLink()
            ? "symlink"
            : "other") as WorkspaceBrowserEntry["kind"],
      isDirectory: entry.isDirectory(),
      isFile: entry.isFile(),
      isSymlink: entry.isSymbolicLink()
    }))
    .sort((left, right) => {
      if (left.isDirectory !== right.isDirectory) {
        return Number(right.isDirectory) - Number(left.isDirectory);
      }
      return left.name.localeCompare(right.name);
    });

  const parentPath = path.dirname(candidatePath);
  const parentAllowed = allowedRoots.some((rootPath) => isPathWithinRoot(parentPath, rootPath));

  return {
    path: candidatePath,
    resolvedPath,
    root: matchedRoot.path,
    currentRoot: matchedRoot.path,
    currentName: path.basename(candidatePath) || candidatePath,
    ...(parentAllowed ? { parentPath } : {}),
    allowedRoots: await listWorkspaceBrowserRoots().then((listing) => listing.allowedRoots),
    entries: browserEntries
  };
};
