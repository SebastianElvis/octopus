import { useFileBrowserStore } from "../fileBrowserStore";

vi.mock("../../lib/tauri", () => ({
  listDir: vi.fn((path: string) =>
    Promise.resolve([
      { name: "file1.ts", path: `${path}/file1.ts`, isDir: false },
      { name: "subdir", path: `${path}/subdir`, isDir: true },
    ]),
  ),
}));

function resetStore() {
  useFileBrowserStore.setState({
    rootPath: null,
    expandedDirs: new Set(),
    entries: {},
    loading: {},
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  resetStore();
});

describe("fileBrowserStore", () => {
  it("has correct initial state", () => {
    const state = useFileBrowserStore.getState();
    expect(state.rootPath).toBeNull();
    expect(state.expandedDirs.size).toBe(0);
    expect(state.entries).toEqual({});
    expect(state.loading).toEqual({});
  });

  it("setRootPath sets root and loads directory", async () => {
    useFileBrowserStore.getState().setRootPath("/project");
    await vi.waitFor(() =>
      expect(useFileBrowserStore.getState().entries["/project"]).toBeDefined(),
    );
    expect(useFileBrowserStore.getState().rootPath).toBe("/project");
    expect(useFileBrowserStore.getState().entries["/project"]).toHaveLength(2);
  });

  it("setRootPath resets expanded dirs and entries", async () => {
    useFileBrowserStore.setState({
      expandedDirs: new Set(["/old"]),
      entries: { "/old": [] },
    });
    useFileBrowserStore.getState().setRootPath("/new");
    expect(useFileBrowserStore.getState().expandedDirs.size).toBe(0);
    await vi.waitFor(() => expect(useFileBrowserStore.getState().entries["/new"]).toBeDefined());
  });

  it("loadDir loads entries for a path", async () => {
    await useFileBrowserStore.getState().loadDir("/src");
    const entries = useFileBrowserStore.getState().entries["/src"];
    expect(entries).toHaveLength(2);
    expect(entries[0].name).toBe("file1.ts");
    expect(useFileBrowserStore.getState().loading["/src"]).toBe(false);
  });

  it("loadDir handles errors gracefully", async () => {
    const { listDir } = await import("../../lib/tauri");
    vi.mocked(listDir).mockRejectedValueOnce(new Error("permission denied"));
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await useFileBrowserStore.getState().loadDir("/restricted");
    expect(useFileBrowserStore.getState().loading["/restricted"]).toBe(false);
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it("toggleDir expands and loads directory", async () => {
    await useFileBrowserStore.getState().toggleDir("/src");
    expect(useFileBrowserStore.getState().expandedDirs.has("/src")).toBe(true);
    expect(useFileBrowserStore.getState().entries["/src"]).toHaveLength(2);
  });

  it("toggleDir collapses expanded directory", async () => {
    await useFileBrowserStore.getState().toggleDir("/src");
    expect(useFileBrowserStore.getState().expandedDirs.has("/src")).toBe(true);
    await useFileBrowserStore.getState().toggleDir("/src");
    expect(useFileBrowserStore.getState().expandedDirs.has("/src")).toBe(false);
  });

  it("toggleDir does not reload already-loaded directory", async () => {
    const { listDir } = await import("../../lib/tauri");
    await useFileBrowserStore.getState().toggleDir("/src");
    const callCount = vi.mocked(listDir).mock.calls.length;
    // Collapse
    await useFileBrowserStore.getState().toggleDir("/src");
    // Re-expand — should not call listDir again since entries exist
    await useFileBrowserStore.getState().toggleDir("/src");
    expect(vi.mocked(listDir).mock.calls.length).toBe(callCount);
  });

  it("refreshDir reloads directory entries", async () => {
    const { listDir } = await import("../../lib/tauri");
    await useFileBrowserStore.getState().loadDir("/src");
    const callCount = vi.mocked(listDir).mock.calls.length;
    await useFileBrowserStore.getState().refreshDir("/src");
    expect(vi.mocked(listDir).mock.calls.length).toBe(callCount + 1);
  });
});
