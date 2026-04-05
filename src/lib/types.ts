export type SessionStatus = "attention" | "running" | "done";
export type BlockType = "permission" | "confirmation" | "question" | "input";

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
  lastMessage?: string;
  dangerouslySkipPermissions?: boolean;
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
    status: (raw.status ?? "attention") as SessionStatus,
    blockType: raw.blockType as BlockType | undefined,
    lastMessage: raw.lastMessage,
    worktreePath: raw.worktreePath,
    logPath: raw.logPath,
    prompt: raw.prompt,
    stateChangedAt: raw.stateChangedAt ? new Date(raw.stateChangedAt).getTime() : Date.now(),
    linkedIssue: raw.linkedIssueNumber ? { number: raw.linkedIssueNumber, title: "" } : undefined,
    linkedPR: raw.linkedPrNumber ? { number: raw.linkedPrNumber, title: "" } : undefined,
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
  insertions: number | null;
  deletions: number | null;
}

export interface EditorTab {
  id: string;
  filePath: string;
  fileName: string;
  language: string;
  isDirty: boolean;
  isDiff?: boolean;
}

export interface CheckRun {
  id: number;
  name: string;
  status: string; // queued, in_progress, completed
  conclusion: string | null; // success, failure, neutral, cancelled, etc.
  htmlUrl: string;
  startedAt: string | null;
  completedAt: string | null;
}

// ---------------------------------------------------------------------------
// Claude Code stream-json event types
// ---------------------------------------------------------------------------

/** Content block types within Claude messages */
export type ClaudeContentBlock =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
  | {
      type: "tool_result";
      tool_use_id: string;
      content: string | { type: string; text?: string }[];
    }
  | { type: "thinking"; thinking: string; signature?: string };

/** Raw API streaming event (inside stream_event wrapper) */
export type ClaudeRawStreamEvent =
  | {
      type: "content_block_start";
      index: number;
      content_block: ClaudeContentBlock;
    }
  | {
      type: "content_block_delta";
      index: number;
      delta: {
        type: string;
        text?: string;
        partial_json?: string;
        thinking?: string;
        signature?: string;
      };
    }
  | {
      type: "content_block_stop";
      index: number;
    }
  | {
      type: "message_start" | "message_delta" | "message_stop" | "ping" | "error";
      [key: string]: unknown;
    };

/** Top-level stream-json event types from Claude CLI */
export type ClaudeStreamEvent =
  | {
      type: "system";
      subtype: string;
      session_id?: string;
      // init fields
      tools?: { name: string; description?: string }[];
      model?: string;
      cwd?: string;
      // api_retry fields
      attempt?: number;
      max_retries?: number;
      error?: string;
      error_status?: number | null;
      retry_delay_ms?: number;
      // status fields
      status?: string | null;
      // task_notification fields
      task_id?: string;
      summary?: string;
      // generic catch-all for other subtype-specific fields
      [key: string]: unknown;
    }
  | {
      type: "assistant";
      message: {
        role: "assistant";
        content: ClaudeContentBlock[];
        stop_reason?: string;
        usage?: { input_tokens: number; output_tokens: number };
      };
    }
  | {
      type: "user";
      message: {
        role: "user";
        content: ClaudeContentBlock[];
      };
    }
  | {
      type: "stream_event";
      event: ClaudeRawStreamEvent;
    }
  | {
      type: "result";
      subtype: string;
      result?: string;
      error?: string;
      errors?: string[];
      cost_usd?: number;
      total_cost_usd?: number;
      duration_ms?: number;
      num_turns?: number;
      is_error?: boolean;
      session_id?: string;
      usage?: {
        input_tokens: number;
        output_tokens: number;
        cache_creation_input_tokens?: number;
        cache_read_input_tokens?: number;
      };
    }
  | {
      type: "tool_progress";
      tool_use_id: string;
      tool_name: string;
      elapsed_time_seconds: number;
      [key: string]: unknown;
    }
  | {
      type: "rate_limit_event";
      rate_limit_info: {
        status: string;
        resetsAt?: number;
        utilization?: number;
        rate_limit_type?: string;
      };
      [key: string]: unknown;
    }
  | {
      type: "error";
      error: { message: string };
    };

// ---------------------------------------------------------------------------
// Hook event types (from the hooks HTTP server)
// ---------------------------------------------------------------------------

export interface HookEvent {
  hook_event_name: string;
  session_id: string;
  cwd: string;
  tool_name?: string;
  tool_input?: Record<string, unknown>;
  tool_result?: Record<string, unknown>;
  file_path?: string;
  change_type?: string;
  user_prompt?: string;
  reason?: string;
  permission_mode?: string;
  [key: string]: unknown;
}

export interface HookEventPayload {
  requestId: string;
  event: HookEvent;
}

export interface SessionAnalytics {
  toolCalls: { toolName: string; timestamp: number; success: boolean }[];
  totalCostUsd: number;
  totalDurationMs: number;
  inputTokens: number;
  outputTokens: number;
}

/** A processed message for rendering in the Claude output panel */
export interface ClaudeMessage {
  id: string;
  role: "assistant" | "user" | "system";
  blocks: ClaudeContentBlock[];
  timestamp: number;
  isStreaming?: boolean;
}
