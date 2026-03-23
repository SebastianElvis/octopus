import { useEditorStore } from "../editorStore";

vi.mock("../../lib/tauri", () => ({
  readFile: vi.fn((path: string) => Promise.resolve(`content of ${path}`)),
}));

beforeEach(() => {
  useEditorStore.setState({
    tabs: [],
    activeTabId: null,
    contents: {},
    loading: false,
  });
});

describe("editorStore", () => {
  it("has correct initial state", () => {
    const state = useEditorStore.getState();
    expect(state.tabs).toEqual([]);
    expect(state.activeTabId).toBeNull();
    expect(state.contents).toEqual({});
    expect(state.loading).toBe(false);
  });

  it("openFile adds a tab and loads content", async () => {
    await useEditorStore.getState().openFile("/src/main.ts");
    const state = useEditorStore.getState();
    expect(state.tabs).toHaveLength(1);
    expect(state.tabs[0].id).toBe("/src/main.ts");
    expect(state.tabs[0].fileName).toBe("main.ts");
    expect(state.tabs[0].language).toBe("typescript");
    expect(state.activeTabId).toBe("/src/main.ts");
    expect(state.contents["/src/main.ts"]).toBe("content of /src/main.ts");
    expect(state.loading).toBe(false);
  });

  it("openFile activates existing tab without duplicating", async () => {
    await useEditorStore.getState().openFile("/src/a.ts");
    await useEditorStore.getState().openFile("/src/b.ts");
    await useEditorStore.getState().openFile("/src/a.ts");
    const state = useEditorStore.getState();
    expect(state.tabs).toHaveLength(2);
    expect(state.activeTabId).toBe("/src/a.ts");
  });

  it("openFile detects language from extension", async () => {
    await useEditorStore.getState().openFile("/app.py");
    expect(useEditorStore.getState().tabs[0].language).toBe("python");
  });

  it("openFile defaults to text for unknown extensions", async () => {
    await useEditorStore.getState().openFile("/file.xyz");
    expect(useEditorStore.getState().tabs[0].language).toBe("text");
  });

  it("closeTab removes tab and content", async () => {
    await useEditorStore.getState().openFile("/src/a.ts");
    await useEditorStore.getState().openFile("/src/b.ts");
    useEditorStore.getState().closeTab("/src/a.ts");
    const state = useEditorStore.getState();
    expect(state.tabs).toHaveLength(1);
    expect(state.tabs[0].id).toBe("/src/b.ts");
    expect(state.contents["/src/a.ts"]).toBeUndefined();
  });

  it("closeTab activates last tab when active tab is closed", async () => {
    await useEditorStore.getState().openFile("/src/a.ts");
    await useEditorStore.getState().openFile("/src/b.ts");
    useEditorStore.getState().closeTab("/src/b.ts");
    expect(useEditorStore.getState().activeTabId).toBe("/src/a.ts");
  });

  it("closeTab sets activeTabId to null when last tab is closed", async () => {
    await useEditorStore.getState().openFile("/src/a.ts");
    useEditorStore.getState().closeTab("/src/a.ts");
    expect(useEditorStore.getState().activeTabId).toBeNull();
  });

  it("closeTab preserves activeTabId when non-active tab is closed", async () => {
    await useEditorStore.getState().openFile("/src/a.ts");
    await useEditorStore.getState().openFile("/src/b.ts");
    useEditorStore.getState().closeTab("/src/a.ts");
    expect(useEditorStore.getState().activeTabId).toBe("/src/b.ts");
  });

  it("setActiveTab changes the active tab", async () => {
    await useEditorStore.getState().openFile("/src/a.ts");
    await useEditorStore.getState().openFile("/src/b.ts");
    useEditorStore.getState().setActiveTab("/src/a.ts");
    expect(useEditorStore.getState().activeTabId).toBe("/src/a.ts");
  });

  it("closeAllTabs clears everything", async () => {
    await useEditorStore.getState().openFile("/src/a.ts");
    await useEditorStore.getState().openFile("/src/b.ts");
    useEditorStore.getState().closeAllTabs();
    const state = useEditorStore.getState();
    expect(state.tabs).toEqual([]);
    expect(state.activeTabId).toBeNull();
    expect(state.contents).toEqual({});
  });

  it("handles readFile failure gracefully", async () => {
    const { readFile } = await import("../../lib/tauri");
    vi.mocked(readFile).mockRejectedValueOnce(new Error("read error"));
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await useEditorStore.getState().openFile("/bad/file.ts");
    const state = useEditorStore.getState();
    expect(state.tabs).toHaveLength(0);
    expect(state.loading).toBe(false);
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });
});
