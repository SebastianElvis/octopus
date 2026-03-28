/// <reference types="vitest/globals" />
import "@testing-library/jest-dom";
import { mockIPC, mockWindows } from "@tauri-apps/api/mocks";

// jsdom stubs
Element.prototype.scrollIntoView = vi.fn();

// ResizeObserver stub (not implemented in jsdom, required by xterm)
class MockResizeObserver {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}
vi.stubGlobal("ResizeObserver", MockResizeObserver);

// matchMedia stub (not implemented in jsdom)
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: vi.fn((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// Node 21+ ships a built-in localStorage that conflicts with jsdom's.
// Ensure a working Storage implementation is available.
if (typeof globalThis.localStorage === "undefined" || typeof globalThis.localStorage.setItem !== "function") {
  const store: Record<string, string> = {};
  const storage = {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => { store[key] = String(value); },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { for (const k of Object.keys(store)) delete store[k]; },
    get length() { return Object.keys(store).length; },
    key: (i: number) => Object.keys(store)[i] ?? null,
  };
  Object.defineProperty(globalThis, "localStorage", { value: storage, writable: true });
}

// Mock AudioContext (not available in jsdom)
const mockAudioContext = {
  state: "running",
  resume: vi.fn(() => Promise.resolve()),
  createOscillator: () => ({
    type: "sine",
    frequency: { value: 0 },
    connect: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
  }),
  createGain: () => ({
    gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
    connect: vi.fn(),
  }),
  destination: {},
  currentTime: 0,
};
vi.stubGlobal("AudioContext", vi.fn(() => mockAudioContext));

// Mock @tauri-apps/plugin-notification (not available outside Tauri runtime)
vi.mock("@tauri-apps/plugin-notification", () => ({
  isPermissionGranted: vi.fn(() => Promise.resolve(true)),
  requestPermission: vi.fn(() => Promise.resolve("granted")),
  sendNotification: vi.fn(),
}));

// Default mockIPC setup — individual tests can override with their own mockIPC call
beforeEach(() => {
  mockWindows("main");
  mockIPC((cmd: string) => {
    // Default: return sensible empty responses for common commands
    switch (cmd) {
      case "list_sessions":
        return [];
      case "list_repos":
        return [];
      case "check_stuck_sessions":
        return [];
      case "check_prerequisites":
        return { claude: true, git: true, gh: true };
      case "get_setting":
        return null;
      case "get_github_token":
        return null;
      default:
        return null;
    }
  });
});

// Note: we intentionally skip clearMocks() in afterEach. Each beforeEach
// re-calls mockIPC() which overwrites the previous mock handler. Calling
// clearMocks() would delete __TAURI_INTERNALS__.invoke before React's
// async effect cleanup finishes, causing unhandled rejections from unlisten().
