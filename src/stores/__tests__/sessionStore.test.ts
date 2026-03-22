import { describe, it, expect, beforeEach, vi } from "vitest";
import { useSessionStore } from "../sessionStore";
import type { Session } from "../sessionStore";

// Reset store between tests
beforeEach(() => {
  useSessionStore.setState({ sessions: [], outputBuffers: {}, sessionsLoading: false });
  vi.restoreAllMocks();
});

const makeSession = (id: string): Session => ({
  id,
  name: `Session ${id}`,
  repo: "owner/repo",
  repoId: "repo-1",
  branch: `branch-${id}`,
  status: "idle",
  stateChangedAt: Date.now(),
});

describe("sessionStore", () => {
  describe("addSession", () => {
    it("adds a session to the list", () => {
      const session = makeSession("s1");
      useSessionStore.getState().addSession(session);
      expect(useSessionStore.getState().sessions).toHaveLength(1);
      expect(useSessionStore.getState().sessions[0]).toEqual(session);
    });

    it("appends multiple sessions", () => {
      useSessionStore.getState().addSession(makeSession("s1"));
      useSessionStore.getState().addSession(makeSession("s2"));
      expect(useSessionStore.getState().sessions).toHaveLength(2);
    });
  });

  describe("updateSession", () => {
    it("updates fields of an existing session", () => {
      useSessionStore.getState().addSession(makeSession("s1"));
      useSessionStore.getState().updateSession("s1", { status: "running" });
      const updated = useSessionStore.getState().sessions.find((s) => s.id === "s1");
      expect(updated?.status).toBe("running");
    });

    it("does not affect other sessions", () => {
      useSessionStore.getState().addSession(makeSession("s1"));
      useSessionStore.getState().addSession(makeSession("s2"));
      useSessionStore.getState().updateSession("s1", { status: "done" });
      const s2 = useSessionStore.getState().sessions.find((s) => s.id === "s2");
      expect(s2?.status).toBe("idle");
    });
  });

  describe("removeSession", () => {
    it("removes a session by id", () => {
      useSessionStore.getState().addSession(makeSession("s1"));
      useSessionStore.getState().addSession(makeSession("s2"));
      useSessionStore.getState().removeSession("s1");
      const ids = useSessionStore.getState().sessions.map((s) => s.id);
      expect(ids).not.toContain("s1");
      expect(ids).toContain("s2");
    });

    it("is a no-op for unknown id", () => {
      useSessionStore.getState().addSession(makeSession("s1"));
      useSessionStore.getState().removeSession("unknown");
      expect(useSessionStore.getState().sessions).toHaveLength(1);
    });
  });

  describe("appendOutput", () => {
    it("appends lines to output buffer", () => {
      useSessionStore.getState().appendOutput("s1", "line 1");
      useSessionStore.getState().appendOutput("s1", "line 2");
      expect(useSessionStore.getState().outputBuffers.s1).toEqual(["line 1", "line 2"]);
    });

    it("creates buffer for new session id", () => {
      useSessionStore.getState().appendOutput("new-session", "hello");
      expect(useSessionStore.getState().outputBuffers["new-session"]).toEqual(["hello"]);
    });

    it("keeps buffers for different sessions independent", () => {
      useSessionStore.getState().appendOutput("s1", "a");
      useSessionStore.getState().appendOutput("s2", "b");
      expect(useSessionStore.getState().outputBuffers.s1).toEqual(["a"]);
      expect(useSessionStore.getState().outputBuffers.s2).toEqual(["b"]);
    });
  });

  describe("loadSessions", () => {
    it("returns empty array when not in Tauri environment", async () => {
      // isTauri() returns false by default in tests (see setup.ts)
      await useSessionStore.getState().loadSessions();
      expect(useSessionStore.getState().sessions).toEqual([]);
      expect(useSessionStore.getState().sessionsLoading).toBe(false);
    });

    it("populates sessions from tauri backend when in Tauri", async () => {
      const { isTauri } = await import("../../lib/env");
      vi.mocked(isTauri).mockReturnValue(true);

      const { invoke } = await import("@tauri-apps/api/core");
      const mockSessions = [makeSession("s1"), makeSession("s2")];
      vi.mocked(invoke).mockResolvedValueOnce(mockSessions);

      await useSessionStore.getState().loadSessions();
      expect(useSessionStore.getState().sessions).toEqual(mockSessions);
    });

    it("silently handles backend errors", async () => {
      const { isTauri } = await import("../../lib/env");
      vi.mocked(isTauri).mockReturnValue(true);

      const { invoke } = await import("@tauri-apps/api/core");
      vi.mocked(invoke).mockRejectedValueOnce(new Error("Backend unavailable"));

      await expect(useSessionStore.getState().loadSessions()).resolves.toBeUndefined();
      expect(useSessionStore.getState().sessions).toEqual([]);
    });
  });
});
