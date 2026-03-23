import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { TerminalPanel } from "../TerminalPanel";

const writeFn = vi.fn();
const writelnFn = vi.fn();
const openFn = vi.fn();
const onDataFn = vi.fn(() => ({ dispose: vi.fn() }));
const onResizeFn = vi.fn(() => ({ dispose: vi.fn() }));
const loadAddonFn = vi.fn();
const disposeFn = vi.fn();

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

vi.mock("@xterm/xterm/css/xterm.css", () => ({}));

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
  });

  it("renders terminal container and header", () => {
    render(<TerminalPanel sessionId="s1" sessionStatus="running" />);
    expect(screen.getByText("Terminal")).toBeInTheDocument();
  });

  it("shows running status indicator", () => {
    render(<TerminalPanel sessionId="s1" sessionStatus="running" />);
    expect(screen.getByText("running")).toBeInTheDocument();
  });

  it("shows stopped status", () => {
    render(<TerminalPanel sessionId="s1" sessionStatus="stopped" />);
    expect(screen.getByText("stopped")).toBeInTheDocument();
  });

  it("renders a Tauri-not-available message outside Tauri", () => {
    render(<TerminalPanel sessionId="s1" sessionStatus="running" />);
    expect(writelnFn).toHaveBeenCalledWith(
      expect.stringContaining("Terminal requires Tauri backend"),
    );
  });

  it("opens terminal in the container div", () => {
    render(<TerminalPanel sessionId="s1" sessionStatus="running" />);
    expect(openFn).toHaveBeenCalledTimes(1);
  });

  it("registers onData and onResize handlers", () => {
    render(<TerminalPanel sessionId="s1" sessionStatus="running" />);
    expect(onDataFn).toHaveBeenCalledTimes(1);
    expect(onResizeFn).toHaveBeenCalledTimes(1);
  });

  it("loads the FitAddon", () => {
    render(<TerminalPanel sessionId="s1" sessionStatus="running" />);
    expect(loadAddonFn).toHaveBeenCalledTimes(1);
  });

  it("shows green pulse for active sessions", () => {
    const { container } = render(<TerminalPanel sessionId="s1" sessionStatus="running" />);
    const dot = container.querySelector(".animate-pulse");
    expect(dot).toBeTruthy();
  });

  it("shows gray dot for inactive sessions", () => {
    const { container } = render(<TerminalPanel sessionId="s1" sessionStatus="stopped" />);
    const dot = container.querySelector(".bg-gray-400");
    expect(dot).toBeTruthy();
  });
});
