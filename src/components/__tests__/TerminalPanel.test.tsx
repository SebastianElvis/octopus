import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";
import { TerminalPanel } from "../TerminalPanel";

const writeFn = vi.fn();
const writelnFn = vi.fn();
const openFn = vi.fn();
const onDataFn = vi.fn(() => ({ dispose: vi.fn() }));
const onResizeFn = vi.fn(() => ({ dispose: vi.fn() }));
const loadAddonFn = vi.fn();
const disposeFn = vi.fn();
const refreshFn = vi.fn();

// Mock xterm with a real class so `new Terminal(...)` works
vi.mock("@xterm/xterm", () => {
  class MockTerminal {
    options: unknown;
    cols = 80;
    rows = 24;
    open = openFn;
    write = writeFn;
    writeln = writelnFn;
    onData = onDataFn;
    onResize = onResizeFn;
    loadAddon = loadAddonFn;
    dispose = disposeFn;
    refresh = refreshFn;
    constructor(opts: unknown) {
      this.options = opts;
    }
  }
  return { Terminal: MockTerminal };
});

vi.mock("@xterm/addon-fit", () => {
  class MockFitAddon {
    fit = vi.fn();
  }
  return { FitAddon: MockFitAddon };
});

vi.mock("@xterm/addon-webgl", () => {
  class MockWebglAddon {
    onContextLoss = vi.fn();
    dispose = vi.fn();
  }
  return { WebglAddon: MockWebglAddon };
});

vi.mock("@xterm/xterm/css/xterm.css", () => ({}));

vi.mock("../../lib/env", () => ({
  isTauri: vi.fn(() => false),
}));

vi.mock("../../lib/tauri", () => ({
  onSessionOutput: vi.fn(),
  writeToSession: vi.fn(),
  resizeSession: vi.fn(),
  readSessionLog: vi.fn(),
}));

vi.mock("../../stores/sessionStore", () => ({
  useSessionStore: Object.assign(
    vi.fn((selector: (s: { outputBuffers: Record<string, string[]> }) => unknown) =>
      selector({ outputBuffers: {} }),
    ),
    {
      getState: vi.fn(() => ({ outputBuffers: {} })),
    },
  ),
}));

vi.mock("../../hooks/useTauriEvent", () => ({
  useTauriEvent: vi.fn(),
}));

// Mock ResizeObserver
class MockResizeObserver {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}
vi.stubGlobal("ResizeObserver", MockResizeObserver);

describe("TerminalPanel", () => {
  beforeEach(() => {
    writeFn.mockClear();
    writelnFn.mockClear();
    openFn.mockClear();
    onDataFn.mockClear();
    onResizeFn.mockClear();
    loadAddonFn.mockClear();
    disposeFn.mockClear();
    refreshFn.mockClear();
  });

  it("renders terminal container", () => {
    const { container } = render(<TerminalPanel sessionId="s1" sessionStatus="running" />);
    expect(container.querySelector(".bg-\\[\\#0d1117\\]")).toBeTruthy();
  });

  it("opens terminal in the container div", () => {
    render(<TerminalPanel sessionId="s1" sessionStatus="running" />);
    expect(openFn).toHaveBeenCalledTimes(1);
  });

  it("renders a Tauri-not-available message outside Tauri", () => {
    render(<TerminalPanel sessionId="s1" sessionStatus="running" />);
    expect(writelnFn).toHaveBeenCalledWith(
      expect.stringContaining("Terminal requires Tauri backend"),
    );
  });

  it("registers onData and onResize handlers", () => {
    render(<TerminalPanel sessionId="s1" sessionStatus="running" />);
    expect(onDataFn).toHaveBeenCalledTimes(1);
    expect(onResizeFn).toHaveBeenCalledTimes(1);
  });

  it("loads the FitAddon and WebglAddon", () => {
    render(<TerminalPanel sessionId="s1" sessionStatus="running" />);
    // FitAddon + WebglAddon = 2 calls
    expect(loadAddonFn).toHaveBeenCalledTimes(2);
  });

  it("renders with overflow-hidden wrapper", () => {
    const { container } = render(<TerminalPanel sessionId="s1" sessionStatus="running" />);
    expect(container.querySelector(".overflow-hidden")).toBeTruthy();
  });

  it("renders with h-full class", () => {
    const { container } = render(<TerminalPanel sessionId="s1" sessionStatus="running" />);
    expect(container.querySelector(".h-full")).toBeTruthy();
  });

  it("disposes terminal on unmount", () => {
    const { unmount } = render(<TerminalPanel sessionId="s1" sessionStatus="running" />);
    unmount();
    expect(disposeFn).toHaveBeenCalledTimes(1);
  });

  it("creates a new terminal when sessionId changes", () => {
    const { rerender } = render(<TerminalPanel sessionId="s1" sessionStatus="running" />);
    openFn.mockClear();
    rerender(<TerminalPanel sessionId="s2" sessionStatus="running" />);
    expect(openFn).toHaveBeenCalledTimes(1);
  });
});
