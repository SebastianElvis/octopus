import { create } from "zustand";
import type { Session } from "../lib/types";
import { listSessions } from "../lib/tauri";
import { formatError } from "../lib/errors";

export type { Session };
export type { SessionStatus, BlockType } from "../lib/types";

interface SessionState {
  sessions: Session[];
  outputBuffers: Record<string, string[]>;
  sessionsLoading: boolean;
  sessionsError: string | null;

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
  sessionsError: null,

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
    set({ sessionsLoading: true, sessionsError: null });
    try {
      const sessions = await listSessions();
      set({ sessions, sessionsLoading: false });
    } catch (err) {
      set({ sessionsLoading: false, sessionsError: formatError(err) });
    }
  },
}));
