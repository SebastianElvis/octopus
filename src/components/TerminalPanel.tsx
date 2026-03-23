import { useEffect, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import { isTauri } from "../lib/env";
import { onSessionOutput, writeToSession, resizeSession } from "../lib/tauri";
import { useSessionStore } from "../stores/sessionStore";
import { useTauriEvent } from "../hooks/useTauriEvent";

interface TerminalPanelProps {
  sessionId: string;
  sessionStatus: string;
}

export function TerminalPanel({ sessionId, sessionStatus }: TerminalPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const terminal = new Terminal({
      cursorBlink: true,
      fontSize: 13,
      fontFamily: "'SF Mono', 'Menlo', 'Monaco', 'Courier New', monospace",
      theme: {
        background: "#0d1117",
        foreground: "#c9d1d9",
        cursor: "#c9d1d9",
        selectionBackground: "#264f78",
        black: "#0d1117",
        red: "#ff7b72",
        green: "#7ee787",
        yellow: "#d29922",
        blue: "#79c0ff",
        magenta: "#d2a8ff",
        cyan: "#a5d6ff",
        white: "#c9d1d9",
        brightBlack: "#484f58",
        brightRed: "#ffa198",
        brightGreen: "#56d364",
        brightYellow: "#e3b341",
        brightBlue: "#a5d6ff",
        brightMagenta: "#d2a8ff",
        brightCyan: "#b6e3ff",
        brightWhite: "#f0f6fc",
      },
      scrollback: 10000,
    });

    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);
    terminal.open(containerRef.current);
    fitAddon.fit();

    terminalRef.current = terminal;
    fitAddonRef.current = fitAddon;

    if (!isTauri()) {
      terminal.writeln("\x1b[33mTerminal requires Tauri backend.\x1b[0m");
      terminal.writeln("Run with: pnpm tauri dev");
    }

    // Replay any buffered output that arrived before mount
    const currentBuffer = useSessionStore.getState().outputBuffers[sessionId] ?? [];
    if (currentBuffer.length > 0) {
      for (const chunk of currentBuffer) {
        terminal.write(chunk);
      }
    } else if (["done", "completed", "failed", "idle"].includes(sessionStatus)) {
      terminal.writeln("\x1b[90mSession has ended. Terminal output is not available for restored sessions.\x1b[0m");
    }

    // Handle terminal input → send to backend PTY
    const onDataDispose = terminal.onData((data) => {
      if (isTauri()) {
        void writeToSession(sessionId, data).catch((err) =>
          console.error("[TerminalPanel] write error:", err),
        );
      }
    });

    // Handle resize → tell backend to resize PTY
    const onResizeDispose = terminal.onResize(({ cols, rows }) => {
      if (isTauri()) {
        void resizeSession(sessionId, rows, cols).catch((err) =>
          console.error("[TerminalPanel] resize error:", err),
        );
      }
    });

    // Send initial size to backend
    if (isTauri()) {
      const { cols, rows } = terminal;
      void resizeSession(sessionId, rows, cols).catch(() => {});
    }

    // Resize terminal when container size changes
    const observer = new ResizeObserver(() => {
      fitAddonRef.current?.fit();
    });
    observer.observe(containerRef.current);

    return () => {
      onDataDispose.dispose();
      onResizeDispose.dispose();
      observer.disconnect();
      terminal.dispose();
      terminalRef.current = null;
      fitAddonRef.current = null;
    };
  }, [sessionId]);

  // Listen for new PTY output events → write to terminal
  useTauriEvent(
    () =>
      onSessionOutput((payload) => {
        if (payload.sessionId === sessionId && terminalRef.current) {
          terminalRef.current.write(payload.data);
        }
      }),
    [sessionId],
  );

  const isActive = sessionStatus === "running" || sessionStatus === "waiting";

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex shrink-0 items-center justify-between border-b border-gray-200 bg-gray-50 px-3 py-1.5 dark:border-gray-800 dark:bg-gray-900">
        <h3 className="text-xs font-medium text-gray-700 dark:text-gray-300">Terminal</h3>
        <div className="flex items-center gap-2">
          <span
            className={`h-2 w-2 rounded-full ${isActive ? "bg-green-500 animate-pulse" : "bg-gray-400"}`}
          />
          <span className="text-xs text-gray-500">{sessionStatus}</span>
        </div>
      </div>
      <div
        ref={containerRef}
        className="flex-1 bg-[#0d1117]"
      />
    </div>
  );
}
