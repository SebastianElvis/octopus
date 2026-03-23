import { describe, it, expect, beforeEach, vi } from "vitest";
import { useRepoStore } from "../repoStore";
import type { Repo } from "../../lib/types";

// Reset store between tests
beforeEach(() => {
  useRepoStore.setState({ repos: [] });
  vi.restoreAllMocks();
});

const makeRepo = (id: string): Repo => ({
  id,
  githubUrl: `https://github.com/owner/repo-${id}`,
  localPath: `/home/user/repos/repo-${id}`,
  defaultBranch: "main",
  addedAt: Date.now(),
});

describe("repoStore", () => {
  describe("removeRepo", () => {
    it("removes a repo by id", async () => {
      const { isTauri } = await import("../../lib/env");
      vi.mocked(isTauri).mockReturnValue(true);
      const { invoke } = await import("@tauri-apps/api/core");
      vi.mocked(invoke).mockResolvedValueOnce(undefined);

      useRepoStore.setState({ repos: [makeRepo("r1"), makeRepo("r2")] });
      await useRepoStore.getState().removeRepo("r1");
      const ids = useRepoStore.getState().repos.map((r) => r.id);
      expect(ids).not.toContain("r1");
      expect(ids).toContain("r2");
    });

    it("is a no-op for unknown id", async () => {
      const { isTauri } = await import("../../lib/env");
      vi.mocked(isTauri).mockReturnValue(true);
      const { invoke } = await import("@tauri-apps/api/core");
      vi.mocked(invoke).mockResolvedValueOnce(undefined);

      useRepoStore.setState({ repos: [makeRepo("r1")] });
      await useRepoStore.getState().removeRepo("unknown");
      expect(useRepoStore.getState().repos).toHaveLength(1);
    });

    it("results in empty list when last repo is removed", async () => {
      const { isTauri } = await import("../../lib/env");
      vi.mocked(isTauri).mockReturnValue(true);
      const { invoke } = await import("@tauri-apps/api/core");
      vi.mocked(invoke).mockResolvedValueOnce(undefined);

      useRepoStore.setState({ repos: [makeRepo("r1")] });
      await useRepoStore.getState().removeRepo("r1");
      expect(useRepoStore.getState().repos).toHaveLength(0);
    });
  });

  describe("loadRepos", () => {
    it("returns empty array when not in Tauri environment", async () => {
      const { isTauri } = await import("../../lib/env");
      vi.mocked(isTauri).mockReturnValue(false);

      await useRepoStore.getState().loadRepos();
      expect(useRepoStore.getState().repos).toEqual([]);
    });

    it("populates repos from tauri backend when in Tauri", async () => {
      const { isTauri } = await import("../../lib/env");
      vi.mocked(isTauri).mockReturnValue(true);

      const { invoke } = await import("@tauri-apps/api/core");
      const mockRepos = [makeRepo("r1"), makeRepo("r2")];
      vi.mocked(invoke).mockResolvedValueOnce(mockRepos);

      await useRepoStore.getState().loadRepos();
      expect(useRepoStore.getState().repos).toEqual(mockRepos);
    });

    it("silently handles backend errors", async () => {
      const { isTauri } = await import("../../lib/env");
      vi.mocked(isTauri).mockReturnValue(true);

      const { invoke } = await import("@tauri-apps/api/core");
      vi.mocked(invoke).mockRejectedValueOnce(new Error("Backend unavailable"));

      await expect(useRepoStore.getState().loadRepos()).resolves.toBeUndefined();
      expect(useRepoStore.getState().repos).toEqual([]);
    });
  });

  describe("addRepo", () => {
    it("adds a repo returned from the backend", async () => {
      const { isTauri } = await import("../../lib/env");
      vi.mocked(isTauri).mockReturnValue(true);

      const { invoke } = await import("@tauri-apps/api/core");
      const newRepo = makeRepo("r-new");
      vi.mocked(invoke).mockResolvedValueOnce(newRepo);

      await useRepoStore.getState().addRepo("https://github.com/owner/repo-r-new", "/local/path");
      expect(useRepoStore.getState().repos).toContainEqual(newRepo);
    });

    it("appends repo to existing list", async () => {
      const existingRepo = makeRepo("r1");
      useRepoStore.setState({ repos: [existingRepo] });

      const { isTauri } = await import("../../lib/env");
      vi.mocked(isTauri).mockReturnValue(true);

      const { invoke } = await import("@tauri-apps/api/core");
      const newRepo = makeRepo("r2");
      vi.mocked(invoke).mockResolvedValueOnce(newRepo);

      await useRepoStore.getState().addRepo("https://github.com/owner/repo-r2", "/local/path2");
      expect(useRepoStore.getState().repos).toHaveLength(2);
    });

    it("re-throws errors from the backend", async () => {
      const { isTauri } = await import("../../lib/env");
      vi.mocked(isTauri).mockReturnValue(true);

      const { invoke } = await import("@tauri-apps/api/core");
      vi.mocked(invoke).mockRejectedValueOnce(new Error("Invalid URL"));

      await expect(useRepoStore.getState().addRepo("bad-url", "/path")).rejects.toThrow(
        "Invalid URL",
      );
    });
  });
});
