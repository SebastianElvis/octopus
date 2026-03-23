export type SessionStatus = "waiting" | "running" | "idle" | "done" | "completed" | "failed" | "killed" | "paused" | "stuck";
export type BlockType = "decision" | "review" | "confirm";

/** Raw session shape returned by the Tauri backend (camelCase of Rust fields). */
export interface BackendSession {
  id: string;
  repoId?: string;
  name?: string;
  branch?: string;
  status?: string;
  blockType?: string;
  worktreePath?: string;
  logPath?: string;
  linkedIssueNumber?: number;
  linkedPrNumber?: number;
  prompt?: string;
  createdAt?: string;
  stateChangedAt?: string;
}

export interface Session {
  id: string;
  name: string;
  repo: string;
  repoId: string;
  branch: string;
  status: SessionStatus;
  blockType?: BlockType;
  lastMessage?: string;
  stateChangedAt: number;
  linkedIssue?: { number: number; title: string };
  linkedPR?: { number: number; title: string };
  worktreePath?: string;
  logPath?: string;
  prompt?: string;
}

/** Convert a backend session to the frontend Session shape. */
export function mapBackendSession(raw: BackendSession): Session {
  return {
    id: raw.id,
    name: raw.name ?? "Untitled",
    repo: raw.repoId ?? "",
    repoId: raw.repoId ?? "",
    branch: raw.branch ?? "",
    status: (raw.status as SessionStatus) ?? "idle",
    blockType: raw.blockType as BlockType | undefined,
    worktreePath: raw.worktreePath,
    logPath: raw.logPath,
    prompt: raw.prompt,
    stateChangedAt: raw.stateChangedAt ? new Date(raw.stateChangedAt).getTime() : Date.now(),
    linkedIssue: raw.linkedIssueNumber
      ? { number: raw.linkedIssueNumber, title: "" }
      : undefined,
    linkedPR: raw.linkedPrNumber
      ? { number: raw.linkedPrNumber, title: "" }
      : undefined,
  };
}

export interface Repo {
  id: string;
  githubUrl: string;
  localPath: string | null;
  defaultBranch: string;
  addedAt: number;
}

export interface LabelInfo {
  name: string;
  color: string;
}

export interface GitHubIssue {
  number: number;
  title: string;
  body?: string;
  labels: LabelInfo[];
  state: "open" | "closed";
  htmlUrl: string;
  user: string;
  comments: number;
  createdAt: string;
  updatedAt: string;
}

export interface GitHubPR {
  number: number;
  title: string;
  body?: string;
  state: "open" | "closed" | "merged";
  htmlUrl: string;
  headRef: string;
  baseRef: string;
  user: string;
  comments: number;
  createdAt: string;
  updatedAt: string;
}

export interface ReviewComment {
  id: number;
  body: string;
  path: string;
  line: number | null;
  user: string;
  createdAt: string;
  updatedAt: string;
}

export interface DiffLine {
  type: "add" | "remove" | "context" | "header";
  content: string;
  oldLineNo?: number;
  newLineNo?: number;
}

export interface DiffFile {
  oldPath: string;
  newPath: string;
  additions: number;
  deletions: number;
  lines: DiffLine[];
}

export interface FileEntry {
  name: string;
  path: string;
  isDir: boolean;
  size: number;
  extension: string | null;
}

export interface ChangedFile {
  path: string;
  status: string;
  staged: boolean;
  oldPath: string | null;
}

export interface EditorTab {
  id: string;
  filePath: string;
  fileName: string;
  language: string;
  isDirty: boolean;
}
