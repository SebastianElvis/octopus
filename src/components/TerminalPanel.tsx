import { useEffect, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebglAddon } from "@xterm/addon-webgl";
import "@xterm/xterm/css/xterm.css";
import { isTauri } from "../lib/env";
import { onSessionOutput, writeToSession, resizeSession, readSessionLog } from "../lib/tauri";
import { useSessionStore } from "../stores/sessionStore";
import { useTauriEvent } from "../hooks/useTauriEvent";

interface TerminalPanelProps {
  sessionId: string;
  sessionStatus: string;
  visible?: boolean;
}

export function TerminalPanel({ sessionId, sessionStatus, visible = true }: TerminalPanelProps) {
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

    // Use WebGL renderer for smoother rendering and fewer overlap artifacts
    try {
      const webglAddon = new WebglAddon();
      webglAddon.onContextLoss(() => {
        webglAddon.dispose();
      });
      terminal.loadAddon(webglAddon);
    } catch {
      // WebGL not available — falls back to DOM renderer automatically
      console.warn("[TerminalPanel] WebGL addon failed to load, using DOM renderer");
    }

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
    } else if (
      ["done", "completed", "failed", "killed", "idle", "interrupted"].includes(sessionStatus)
    ) {
      // Try to replay saved log output
      if (isTauri()) {
        void readSessionLog(sessionId)
          .then((log) => {
            if (log) {
              terminal.write(log);
            } else {
              terminal.writeln(
                "\x1b[90mSession has ended. Terminal output is not available for restored sessions.\x1b[0m",
              );
            }
          })
          .catch(() => {
            terminal.writeln(
              "\x1b[90mSession has ended. Terminal output is not available for restored sessions.\x1b[0m",
            );
          });
      } else {
        terminal.writeln(
          "\x1b[90mSession has ended. Terminal output is not available for restored sessions.\x1b[0m",
        );
      }
    }

    // Handle terminal input → send to backend PTY
    const onDataDispose = terminal.onData((data) => {
      if (isTauri()) {
        void writeToSession(sessionId, data).catch((err: unknown) =>
          console.error("[TerminalPanel] write error:", err),
        );
      }
    });

    // Handle resize → tell backend to resize PTY
    const onResizeDispose = terminal.onResize(({ cols, rows }) => {
      if (isTauri()) {
        void resizeSession(sessionId, rows, cols).catch((err: unknown) =>
          console.error("[TerminalPanel] resize error:", err),
        );
      }
    });

    // Send initial size to backend
    if (isTauri()) {
      const { cols, rows } = terminal;
      void resizeSession(sessionId, rows, cols).catch((_err: unknown) => {
        /* initial resize error ignored */
      });
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sessionStatus is intentionally read only on mount; adding it would re-create the terminal on every status change
  }, [sessionId]);

  // Refit terminal when tab becomes visible (xterm can't measure when hidden)
  useEffect(() => {
    if (visible && fitAddonRef.current && terminalRef.current) {
      // Use double-rAF to ensure the DOM has fully laid out after visibility change
      let cancelled = false;
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (cancelled) return;
          fitAddonRef.current?.fit();
          terminalRef.current?.refresh(0, terminalRef.current.rows - 1);
        });
      });
      return () => {
        cancelled = true;
      };
    }
  }, [visible]);

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

  return (
    <div className="h-full overflow-hidden">
      <div ref={containerRef} className="h-full bg-[#0d1117]" />
    </div>
  );
}
