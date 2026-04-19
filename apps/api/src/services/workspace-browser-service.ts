import { constants as fsConstants } from "node:fs";
import { access, lstat, readdir, realpath } from "node:fs/promises";
import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

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

export const getWorkspaceBrowsableRoots = (): string[] => {
  const configuredRoots = getWorkspaceAllowedRoots();
  if (configuredRoots.length > 0) {
    return configuredRoots;
  }

  const fallbackRoots = [process.env.HOME, process.cwd()]
    .map((entry) => asString(entry))
    .filter((entry): entry is string => Boolean(entry))
    .map((entry) => path.resolve(entry));

  return [...new Set(fallbackRoots)];
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

export class WorkspaceBrowserDialogError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WorkspaceBrowserDialogError";
  }
}

type WorkspaceFolderDialogPicker = (input: {
  path?: string;
  allowedRoots: string[];
}) => Promise<string | undefined>;

let workspaceFolderDialogPickerOverride: WorkspaceFolderDialogPicker | undefined;

export const setWorkspaceFolderDialogPickerForTests = (
  picker: WorkspaceFolderDialogPicker | undefined
): void => {
  workspaceFolderDialogPickerOverride = picker;
};

const resolveBrowserPath = async (value: string): Promise<{ path: string; resolvedPath: string }> => {
  const candidatePath = path.resolve(value);
  const stats = await lstat(candidatePath);
  if (stats.isSymbolicLink()) {
    throw new WorkspaceBrowserPathError("Symbolic links are not allowed in workspace browsing.");
  }
  const resolvedPath = await realpath(candidatePath);
  return { path: candidatePath, resolvedPath };
};

const ensureWithinAllowedRoots = (resolvedPath: string, roots: string[]): WorkspaceBrowserRoot | null => {
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

const resolveDialogStartPath = async (
  inputPath: string | undefined,
  allowedRoots: string[]
): Promise<string | undefined> => {
  const trimmed = asString(inputPath);
  if (trimmed) {
    try {
      const { resolvedPath } = await resolveBrowserPath(trimmed);
      if (allowedRoots.some((rootPath) => isPathWithinRoot(resolvedPath, rootPath))) {
        return trimmed;
      }
    } catch {
      // Fall back to the first allowed root when the current path is missing or invalid.
    }
  }
  return allowedRoots[0];
};

const pickWorkspaceFolderWithMacDialog: WorkspaceFolderDialogPicker = async ({ path, allowedRoots }) => {
  const defaultPath = await resolveDialogStartPath(path, allowedRoots);
  const args = [
    "-e",
    "on run argv",
    "-e",
    "set promptText to item 1 of argv",
    "-e",
    "set defaultPath to item 2 of argv",
    "-e",
    "try",
    "-e",
    'if defaultPath is not "" then',
    "-e",
    "set chosenFolder to choose folder with prompt promptText default location POSIX file defaultPath",
    "-e",
    "else",
    "-e",
    "set chosenFolder to choose folder with prompt promptText",
    "-e",
    "end if",
    "-e",
    "return POSIX path of chosenFolder",
    "-e",
    "on error number -128",
    "-e",
    'return "__WORKSPACE_PICKER_CANCELLED__"',
    "-e",
    "end try",
    "-e",
    "end run",
    "--",
    "Choose a local workspace folder",
    defaultPath ?? ""
  ];

  const { stdout } = await execFileAsync("osascript", args);
  const selectedPath = stdout.trim();
  if (selectedPath === "__WORKSPACE_PICKER_CANCELLED__") {
    return undefined;
  }
  return selectedPath.length > 0 ? selectedPath : undefined;
};

const defaultWorkspaceFolderDialogPicker: WorkspaceFolderDialogPicker = async (input) => {
  if (process.platform === "darwin") {
    return pickWorkspaceFolderWithMacDialog(input);
  }
  throw new WorkspaceBrowserDialogError(
    "Native folder picker is currently available on macOS only in this build."
  );
};

export const listWorkspaceBrowserRoots = async (): Promise<WorkspaceBrowserListing> => {
  const allowedRoots = await Promise.all(
    getWorkspaceBrowsableRoots().map(async (rootPath) => {
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
  const configuredRoots = getWorkspaceAllowedRoots();
  const browsableRoots = getWorkspaceBrowsableRoots();
  if (browsableRoots.length === 0) {
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
  const matchedConfiguredRoot = ensureWithinAllowedRoots(resolvedPath, configuredRoots);
  const matchedBrowsableRoot = ensureWithinAllowedRoots(resolvedPath, browsableRoots);
  if (configuredRoots.length > 0 && !matchedConfiguredRoot) {
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
  const parentAllowed =
    parentPath !== candidatePath &&
    (configuredRoots.length === 0 || configuredRoots.some((rootPath) => isPathWithinRoot(parentPath, rootPath)));

  return {
    path: candidatePath,
    resolvedPath,
    ...(matchedBrowsableRoot ? { root: matchedBrowsableRoot.path, currentRoot: matchedBrowsableRoot.path } : {}),
    currentName: path.basename(candidatePath) || candidatePath,
    ...(parentAllowed ? { parentPath } : {}),
    allowedRoots: await listWorkspaceBrowserRoots().then((listing) => listing.allowedRoots),
    entries: browserEntries
  };
};

export const pickWorkspaceFolderDialog = async (input: {
  path?: string | undefined;
}): Promise<WorkspaceBrowserListing | undefined> => {
  const allowedRoots = getWorkspaceBrowsableRoots();
  if (allowedRoots.length === 0) {
    throw new WorkspaceBrowserPathError("No allowed workspace roots are configured for local folder picking.");
  }

  const picker = workspaceFolderDialogPickerOverride ?? defaultWorkspaceFolderDialogPicker;
  const selectedPath = await picker({
    ...(input.path ? { path: input.path } : {}),
    allowedRoots
  });

  if (!selectedPath) {
    return undefined;
  }

  return browseWorkspacePath({ path: selectedPath });
};
