/**
 * WebDriverIO configuration for TooManyTabs E2E tests.
 *
 * Uses `tauri-driver` as the WebDriver server, which bridges to the native
 * WebView (WKWebView on macOS via safaridriver).
 *
 * Prerequisites (one-time):
 *   sudo safaridriver --enable
 *   cargo install tauri-driver
 *
 * Usage:
 *   npm run e2e:build   # build the app binary (debug)
 *   npm run e2e:test    # run E2E tests against built binary
 *   npm run e2e         # build + test in one step
 */

import type { Options } from "@wdio/types";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

// ── App binary path (macOS debug build) ─────────────────────────────
const appBinaryPath = resolve(
  import.meta.dirname,
  "src-tauri/target/debug/TooManyTabs",
);

// ── Tauri-driver lifecycle ──────────────────────────────────────────
let tauriDriver: ChildProcess;
let tempDbDir: string;

export const config: Options.Testrunner = {
  // ── Runner ─────────────────────────────────────────────────────────
  runner: "local",
  specs: ["./e2e/specs/**/*.spec.ts"],
  maxInstances: 1, // one app at a time (SQLite lock)

  // ── Capabilities ───────────────────────────────────────────────────
  capabilities: [
    {
      // @ts-expect-error — tauri:options is not in the standard WebDriver types
      "browserName": "wry",
      "tauri:options": {
        application: appBinaryPath,
      },
    },
  ],

  // ── Framework ──────────────────────────────────────────────────────
  framework: "mocha",
  reporters: ["spec"],

  mochaOpts: {
    ui: "bdd",
    timeout: 60_000, // 60s per test
  },

  // ── Timeouts ───────────────────────────────────────────────────────
  waitforTimeout: 10_000,
  connectionRetryTimeout: 120_000,
  connectionRetryCount: 0,

  // ── Retry flaky tests once (helpful for agent debugging loops) ─────
  specFileRetries: 1,
  specFileRetriesDeferred: true,

  // ── TypeScript ─────────────────────────────────────────────────────
  autoCompileOpts: {
    tsNodeOpts: {
      project: "./e2e/tsconfig.json",
    },
  },

  // ── Lifecycle hooks ────────────────────────────────────────────────

  /**
   * Start tauri-driver before the test suite.
   *
   * Also creates a temporary directory for the test database so E2E
   * tests never touch the developer's real data.
   */
  onPrepare() {
    // Isolated database for tests
    tempDbDir = mkdtempSync(join(tmpdir(), "toomanytabs-e2e-"));
    const dbPath = join(tempDbDir, "test.db");
    process.env.TOOMANYTABS_DB_PATH = dbPath;

    tauriDriver = spawn("tauri-driver", [], {
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        TOOMANYTABS_DB_PATH: dbPath,
      },
    });

    // Wait for tauri-driver to signal readiness
    return new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error("tauri-driver failed to start within 15s")),
        15_000,
      );

      tauriDriver.stderr?.on("data", (data: Buffer) => {
        const msg = data.toString();
        // tauri-driver prints a listening message when ready
        if (msg.includes("listening")) {
          clearTimeout(timeout);
          resolve();
        }
      });

      tauriDriver.on("error", (err) => {
        clearTimeout(timeout);
        reject(
          new Error(
            `Failed to start tauri-driver: ${err.message}\n` +
              "Make sure tauri-driver is installed: cargo install tauri-driver",
          ),
        );
      });

      tauriDriver.on("close", (code) => {
        if (code !== null && code !== 0) {
          clearTimeout(timeout);
          reject(new Error(`tauri-driver exited with code ${code}`));
        }
      });
    });
  },

  /**
   * Clean up tauri-driver and temp database after all tests.
   */
  onComplete() {
    tauriDriver?.kill();

    // Clean up temp database directory
    if (tempDbDir) {
      try {
        rmSync(tempDbDir, { recursive: true, force: true });
      } catch {
        // best-effort cleanup
      }
    }
  },

  /**
   * Capture a screenshot on test failure for agent debugging.
   */
  afterTest: async function (
    test: { parent?: string; title?: string },
    _context: unknown,
    result: { error?: Error },
  ) {
    if (result.error) {
      const name = `${test.parent ?? "suite"}-${test.title ?? "test"}`.replace(
        /\s+/g,
        "_",
      );
      try {
        await browser.saveScreenshot(
          `e2e/screenshots/FAIL-${name}-${Date.now()}.png`,
        );
      } catch {
        // Screenshot may fail if the browser session is already dead
      }
    }
  },
};
