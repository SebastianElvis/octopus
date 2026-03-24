import { render, screen, fireEvent } from "@testing-library/react";
import { SettingsModal } from "../SettingsModal";

vi.mock("../../lib/tauri", () => ({
  getSetting: vi.fn(() => Promise.resolve(null)),
  setSetting: vi.fn(() => Promise.resolve()),
}));

describe("SettingsModal", () => {
  it("does not render when open is false", () => {
    const { container } = render(
      <SettingsModal open={false} onClose={() => {}} onShowShortcuts={() => {}} />,
    );
    expect(container.innerHTML).toBe("");
  });

  it("renders Settings title when open", () => {
    render(<SettingsModal open={true} onClose={() => {}} onShowShortcuts={() => {}} />);
    expect(screen.getByText("Settings")).toBeInTheDocument();
  });

  it("shows Appearance tab by default", () => {
    render(<SettingsModal open={true} onClose={() => {}} onShowShortcuts={() => {}} />);
    expect(screen.getByText("Theme")).toBeInTheDocument();
  });

  it("switches to Notifications tab", () => {
    render(<SettingsModal open={true} onClose={() => {}} onShowShortcuts={() => {}} />);
    fireEvent.click(screen.getByText("Notifications"));
    expect(screen.getByText("Sound Notifications")).toBeInTheDocument();
  });

  it("switches to API Keys tab", () => {
    render(<SettingsModal open={true} onClose={() => {}} onShowShortcuts={() => {}} />);
    fireEvent.click(screen.getByText("API Keys"));
    expect(screen.getByText("Claude API Key")).toBeInTheDocument();
  });

  it("switches to Shortcuts tab", () => {
    render(<SettingsModal open={true} onClose={() => {}} onShowShortcuts={() => {}} />);
    fireEvent.click(screen.getByText("Shortcuts"));
    expect(screen.getByText("Command palette")).toBeInTheDocument();
  });

  it("calls onClose when close button is clicked", () => {
    const onClose = vi.fn();
    render(<SettingsModal open={true} onClose={onClose} onShowShortcuts={() => {}} />);
    // Click the X button
    const closeButtons = screen.getAllByRole("button");
    const xButton = closeButtons.find((btn) => btn.querySelector("svg path"));
    if (xButton) fireEvent.click(xButton);
    expect(onClose).toHaveBeenCalled();
  });
});
