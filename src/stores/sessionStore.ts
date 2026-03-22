import { create } from "zustand";
import type { Session } from "../lib/types";
import { listSessions } from "../lib/tauri";

export type { Session };
export type { SessionStatus, BlockType } from "../lib/types";

interface SessionState {
  sessions: Session[];
  outputBuffers: Record<string, string[]>;
  sessionsLoading: boolean;

  // Actions
  addSession: (session: Session) => void;
  updateSession: (id: string, updates: Partial<Session>) => void;
  removeSession: (id: string) => void;
  appendOutput: (sessionId: string, line: string) => void;
  loadSessions: () => Promise<void>;
}

export const useSessionStore = create<SessionState>((set) => ({
  sessions: [],
  outputBuffers: {},
  sessionsLoading: true,

  addSession: (session) => set((state) => ({ sessions: [...state.sessions, session] })),

  updateSession: (id, updates) =>
    set((state) => ({
      sessions: state.sessions.map((s) => (s.id === id ? { ...s, ...updates } : s)),
    })),

  removeSession: (id) =>
    set((state) => ({
      sessions: state.sessions.filter((s) => s.id !== id),
    })),

  appendOutput: (sessionId, line) =>
    set((state) => ({
      outputBuffers: {
        ...state.outputBuffers,
        [sessionId]: [...(state.outputBuffers[sessionId] ?? []), line],
      },
    })),

  loadSessions: async () => {
    set({ sessionsLoading: true });
    try {
      const sessions = await listSessions();
      set({ sessions, sessionsLoading: false });
    } catch {
      // Backend may not be available during development
      set({ sessionsLoading: false });
    }
  },
}));
