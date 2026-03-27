/**
 * Integration tests for the settings modal.
 *
 * Verifies the settings modal opens, tabs switch correctly, and API key
 * save flows through the mocked IPC layer.
 */
import { render, screen, act, fireEvent, waitFor } from "@testing-library/react";
import { mockIPC, mockWindows } from "@tauri-apps/api/mocks";
import App from "../../App";
import { useSessionStore } from "../../stores/sessionStore";
import { useRepoStore } from "../../stores/repoStore";
import { useUIStore } from "../../stores/uiStore";

let savedSettings: Record<string, string> = {};

beforeEach(() => {
  localStorage.setItem("tmt-onboarding-completed", "true");
  savedSettings = {};

  useSessionStore.setState({
    sessions: [],
    outputBuffers: {},
    sessionsLoading: true,
    sessionsError: null,
  });
  useRepoStore.setState({ repos: [] });
  useUIStore.setState({ sidebarCollapsed: false });

  mockWindows("main");
  mockIPC((cmd: string, args?: Record<string, unknown>) => {
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
        return savedSettings[(args?.key as string) ?? ""] ?? null;
      case "set_setting":
        savedSettings[(args?.key as string) ?? ""] = (args?.value as string) ?? "";
        return null;
      case "get_github_token":
        return null;
      default:
        return null;
    }
  });
});

afterEach(() => {
  localStorage.clear();
});

async function renderAndOpenSettings() {
  await act(async () => {
    render(<App />);
  });

  await waitFor(() => {
    expect(screen.getByText("TooManyTabs")).toBeInTheDocument();
  });

  // Click the settings gear button
  const settingsBtn = screen.getByTitle("Settings");
  await act(async () => {
    fireEvent.click(settingsBtn);
  });

  await waitFor(() => {
    expect(screen.getByTestId("settings-modal")).toBeInTheDocument();
  });
}

describe("Settings modal", () => {
  it("opens settings via the sidebar gear button", async () => {
    await renderAndOpenSettings();
    expect(screen.getByText("Settings")).toBeInTheDocument();
  });

  it("shows Appearance tab by default with theme selector", async () => {
    await renderAndOpenSettings();
    expect(screen.getByText("Theme")).toBeInTheDocument();
  });

  it("switches to Notifications tab", async () => {
    await renderAndOpenSettings();

    await act(async () => {
      fireEvent.click(screen.getByText("Notifications"));
    });

    expect(screen.getByText("Sound Notifications")).toBeInTheDocument();
  });

  it("switches to API Keys tab and shows key input", async () => {
    await renderAndOpenSettings();

    await act(async () => {
      fireEvent.click(screen.getByText("API Keys"));
    });

    expect(screen.getByText("Claude API Key")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("sk-ant-...")).toBeInTheDocument();
  });

  it("saves API key through IPC", async () => {
    await renderAndOpenSettings();

    await act(async () => {
      fireEvent.click(screen.getByText("API Keys"));
    });

    const input = screen.getByPlaceholderText("sk-ant-...");
    await act(async () => {
      fireEvent.change(input, { target: { value: "sk-ant-test-key" } });
    });

    await act(async () => {
      fireEvent.click(screen.getByText("Save"));
    });

    // Verify the key was saved through the mock IPC
    await waitFor(() => {
      expect(savedSettings["claude_api_key"]).toBe("sk-ant-test-key");
    });

    // Button should show "Saved" feedback
    expect(screen.getByText("Saved")).toBeInTheDocument();
  });

  it("switches to Shortcuts tab", async () => {
    await renderAndOpenSettings();

    await act(async () => {
      fireEvent.click(screen.getByText("Shortcuts"));
    });

    expect(screen.getByText("Command palette")).toBeInTheDocument();
  });

  it("closes settings with Escape key", async () => {
    await renderAndOpenSettings();

    await act(async () => {
      fireEvent.keyDown(window, { key: "Escape" });
    });

    await waitFor(() => {
      expect(screen.queryByTestId("settings-modal")).not.toBeInTheDocument();
    });
  });
});
