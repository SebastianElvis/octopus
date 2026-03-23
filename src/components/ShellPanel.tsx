import { useEffect, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebglAddon } from "@xterm/addon-webgl";
import "@xterm/xterm/css/xterm.css";
import { isTauri } from "../lib/env";
import { spawnShell, writeToShell, resizeShell, killShell, onShellOutput } from "../lib/tauri";
import { useTauriEvent } from "../hooks/useTauriEvent";

interface ShellPanelProps {
  /** Working directory for the shell. */
  cwd: string;
  /** Stable key to avoid re-spawning (e.g. sessionId). */
  shellKey: string;
  visible?: boolean;
}

export function ShellPanel({ cwd, shellKey, visible = true }: ShellPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const shellIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const terminal = new Terminal({
      cursorBlink: true,
      fontSize: 12,
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
      scrollback: 5000,
    });

    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);
    terminal.open(containerRef.current);
    fitAddon.fit();

    try {
      const webglAddon = new WebglAddon();
      webglAddon.onContextLoss(() => webglAddon.dispose());
      terminal.loadAddon(webglAddon);
    } catch {
      // fallback to DOM renderer
    }

    terminalRef.current = terminal;
    fitAddonRef.current = fitAddon;

    if (!isTauri()) {
      terminal.writeln("\x1b[33mShell requires Tauri backend.\x1b[0m");
    } else {
      // Spawn the shell
      void spawnShell(cwd).then((id) => {
        shellIdRef.current = id;
        // Send initial size
        const { cols, rows } = terminal;
        void resizeShell(id, rows, cols).catch(() => {});
      }).catch((err) => {
        terminal.writeln(`\x1b[31mFailed to spawn shell: ${String(err)}\x1b[0m`);
      });
    }

    // Handle terminal input
    const onDataDispose = terminal.onData((data) => {
      if (shellIdRef.current) {
        void writeToShell(shellIdRef.current, data).catch((err) =>
          console.error("[ShellPanel] write error:", err),
        );
      }
    });

    // Handle resize
    const onResizeDispose = terminal.onResize(({ cols, rows }) => {
      if (shellIdRef.current) {
        void resizeShell(shellIdRef.current, rows, cols).catch((err) =>
          console.error("[ShellPanel] resize error:", err),
        );
      }
    });

    // Resize terminal when container size changes
    const observer = new ResizeObserver(() => {
      fitAddonRef.current?.fit();
    });
    observer.observe(containerRef.current);

    return () => {
      onDataDispose.dispose();
      onResizeDispose.dispose();
      observer.disconnect();
      // Kill the shell on unmount
      if (shellIdRef.current) {
        void killShell(shellIdRef.current).catch(() => {});
        shellIdRef.current = null;
      }
      terminal.dispose();
      terminalRef.current = null;
      fitAddonRef.current = null;
    };
  }, [shellKey, cwd]);

  // Refit when visibility changes
  useEffect(() => {
    if (visible && fitAddonRef.current && terminalRef.current) {
      let cancelled = false;
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (cancelled) return;
          fitAddonRef.current?.fit();
          terminalRef.current?.refresh(0, terminalRef.current.rows - 1);
        });
      });
      return () => { cancelled = true; };
    }
  }, [visible]);

  // Listen for shell output events
  useTauriEvent(
    () =>
      onShellOutput((payload) => {
        if (payload.shellId === shellIdRef.current && terminalRef.current) {
          terminalRef.current.write(payload.data);
        }
      }),
    [shellKey],
  );

  return (
    <div className="h-full overflow-hidden">
      <div ref={containerRef} className="h-full bg-[#0d1117]" />
    </div>
  );
}
