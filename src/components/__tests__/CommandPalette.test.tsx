import { render, screen, fireEvent } from "@testing-library/react";
import { CommandPalette } from "../CommandPalette";
import { useSessionStore } from "../../stores/sessionStore";
import type { Session } from "../../lib/types";

// jsdom doesn't implement scrollIntoView
Element.prototype.scrollIntoView = vi.fn();

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    id: "s1",
    name: "Test Session",
    repo: "my-repo",
    repoId: "repo-1",
    branch: "main",
    status: "running",
    stateChangedAt: Date.now(),
    ...overrides,
  };
}

beforeEach(() => {
  useSessionStore.setState({
    sessions: [
      makeSession({ id: "s1", name: "Fix auth bug", repo: "backend" }),
      makeSession({ id: "s2", name: "Add tests", repo: "frontend", status: "attention" }),
      makeSession({ id: "s3", name: "Deploy hotfix", repo: "infra", status: "done" }),
    ],
  });
});

describe("CommandPalette", () => {
  it("returns null when not open", () => {
    const { container } = render(
      <CommandPalette open={false} onClose={() => {}} onSelectSession={() => {}} />,
    );
    expect(container.innerHTML).toBe("");
  });

  it("renders all sessions when open", () => {
    render(<CommandPalette open={true} onClose={() => {}} onSelectSession={() => {}} />);
    expect(screen.getByText("Fix auth bug")).toBeInTheDocument();
    expect(screen.getByText("Add tests")).toBeInTheDocument();
    expect(screen.getByText("Deploy hotfix")).toBeInTheDocument();
  });

  it("renders search input with placeholder", () => {
    render(<CommandPalette open={true} onClose={() => {}} onSelectSession={() => {}} />);
    expect(screen.getByPlaceholderText("Search sessions...")).toBeInTheDocument();
  });

  it("filters sessions by name", () => {
    render(<CommandPalette open={true} onClose={() => {}} onSelectSession={() => {}} />);
    fireEvent.change(screen.getByPlaceholderText("Search sessions..."), {
      target: { value: "auth" },
    });
    expect(screen.getByText("Fix auth bug")).toBeInTheDocument();
    expect(screen.queryByText("Add tests")).not.toBeInTheDocument();
    expect(screen.queryByText("Deploy hotfix")).not.toBeInTheDocument();
  });

  it("filters sessions by repo", () => {
    render(<CommandPalette open={true} onClose={() => {}} onSelectSession={() => {}} />);
    fireEvent.change(screen.getByPlaceholderText("Search sessions..."), {
      target: { value: "frontend" },
    });
    expect(screen.queryByText("Fix auth bug")).not.toBeInTheDocument();
    expect(screen.getByText("Add tests")).toBeInTheDocument();
  });

  it("shows 'No sessions found' for empty results", () => {
    render(<CommandPalette open={true} onClose={() => {}} onSelectSession={() => {}} />);
    fireEvent.change(screen.getByPlaceholderText("Search sessions..."), {
      target: { value: "nonexistent" },
    });
    expect(screen.getByText("No sessions found")).toBeInTheDocument();
  });

  it("calls onClose when backdrop is clicked", () => {
    const onClose = vi.fn();
    render(<CommandPalette open={true} onClose={onClose} onSelectSession={() => {}} />);
    // Click the backdrop (outer div)

    fireEvent.click(screen.getByText("Fix auth bug").closest("[class*='fixed']")!);
    expect(onClose).toHaveBeenCalled();
  });

  it("calls onClose on Escape key", () => {
    const onClose = vi.fn();
    render(<CommandPalette open={true} onClose={onClose} onSelectSession={() => {}} />);

    const container = screen
      .getByPlaceholderText("Search sessions...")
      .closest("div[class*='max-w']")!;
    fireEvent.keyDown(container, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });

  it("calls onSelectSession and onClose on Enter", () => {
    const onSelectSession = vi.fn();
    const onClose = vi.fn();
    render(<CommandPalette open={true} onClose={onClose} onSelectSession={onSelectSession} />);

    const container = screen
      .getByPlaceholderText("Search sessions...")
      .closest("div[class*='max-w']")!;
    fireEvent.keyDown(container, { key: "Enter" });

    expect(onSelectSession).toHaveBeenCalledWith("s1");
    expect(onClose).toHaveBeenCalled();
  });

  it("navigates with arrow keys", () => {
    const onSelectSession = vi.fn();
    render(<CommandPalette open={true} onClose={() => {}} onSelectSession={onSelectSession} />);

    const container = screen
      .getByPlaceholderText("Search sessions...")
      .closest("div[class*='max-w']")!;
    fireEvent.keyDown(container, { key: "ArrowDown" });
    fireEvent.keyDown(container, { key: "Enter" });

    expect(onSelectSession).toHaveBeenCalledWith("s2");
  });

  it("clicking a session calls onSelectSession", () => {
    const onSelectSession = vi.fn();
    render(<CommandPalette open={true} onClose={() => {}} onSelectSession={onSelectSession} />);

    fireEvent.click(screen.getByText("Add tests"));
    expect(onSelectSession).toHaveBeenCalledWith("s2");
  });
});
