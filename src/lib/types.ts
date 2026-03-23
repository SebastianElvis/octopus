export type SessionStatus = "waiting" | "running" | "idle" | "done" | "paused" | "stuck";
export type BlockType = "decision" | "review" | "confirm";

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
}

export interface Repo {
  id: string;
  githubUrl: string;
  localPath: string;
  defaultBranch: string;
  addedAt: number;
}

export interface GitHubIssue {
  number: number;
  title: string;
  body?: string;
  labels: string[];
  state: "open" | "closed";
  url: string;
}

export interface GitHubPR {
  number: number;
  title: string;
  body?: string;
  state: "open" | "closed" | "merged";
  url: string;
  headBranch: string;
  ciStatus: "pending" | "success" | "failure" | "unknown";
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
