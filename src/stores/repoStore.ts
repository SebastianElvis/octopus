import { create } from "zustand";
import type { Repo } from "../lib/types";
import { listRepos, addRepo as tauriAddRepo } from "../lib/tauri";

interface RepoState {
  repos: Repo[];

  // Actions
  loadRepos: () => Promise<void>;
  addRepo: (githubUrl: string, localPath: string) => Promise<void>;
  removeRepo: (id: string) => void;
}

export const useRepoStore = create<RepoState>((set) => ({
  repos: [],

  loadRepos: async () => {
    try {
      const repos = await listRepos();
      set({ repos });
    } catch {
      // Backend may not be available during development
    }
  },

  addRepo: async (githubUrl: string, localPath: string) => {
    const repo = await tauriAddRepo(githubUrl, localPath);
    set((state) => ({ repos: [...state.repos, repo] }));
  },

  removeRepo: (id: string) =>
    set((state) => ({
      repos: state.repos.filter((r) => r.id !== id),
    })),
}));
