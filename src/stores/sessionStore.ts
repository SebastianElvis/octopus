import { create } from "zustand";

export type SessionStatus = "waiting" | "running" | "idle" | "done";

export type BlockType = "decision" | "review" | "confirm";

export interface Session {
  id: string;
  name: string;
  repo: string;
  branch: string;
  status: SessionStatus;
  blockType?: BlockType;
  lastMessage?: string;
  stateChangedAt: number;
  linkedIssue?: { number: number; title: string };
  linkedPR?: { number: number; title: string };
}

interface SessionState {
  sessions: Session[];
  addSession: (session: Session) => void;
  updateSession: (id: string, updates: Partial<Session>) => void;
  removeSession: (id: string) => void;
}

export const useSessionStore = create<SessionState>((set) => ({
  sessions: [],

  addSession: (session) =>
    set((state) => ({ sessions: [...state.sessions, session] })),

  updateSession: (id, updates) =>
    set((state) => ({
      sessions: state.sessions.map((s) =>
        s.id === id ? { ...s, ...updates } : s,
      ),
    })),

  removeSession: (id) =>
    set((state) => ({
      sessions: state.sessions.filter((s) => s.id !== id),
    })),
}));
