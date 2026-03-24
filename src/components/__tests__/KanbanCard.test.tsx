import { render, screen, fireEvent } from "@testing-library/react";
import { KanbanCard } from "../KanbanCard";
import type { Session } from "../../lib/types";

vi.mock("../../lib/tauri", () => ({
  replyToSession: vi.fn(() => Promise.resolve()),
}));

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    id: "s1",
    name: "Fix bug #42",
    repo: "my-repo",
    repoId: "repo-1",
    branch: "fix/bug-42",
    status: "running",
    stateChangedAt: Date.now() - 60000,
    ...overrides,
  };
}

describe("KanbanCard", () => {
  it("renders session name, repo, and branch", () => {
    render(<KanbanCard session={makeSession()} onView={() => {}} />);
    expect(screen.getByText("Fix bug #42")).toBeInTheDocument();
    expect(screen.getByText("my-repo")).toBeInTheDocument();
    expect(screen.getByText("· fix/bug-42")).toBeInTheDocument();
  });

  it("renders status pill", () => {
    render(<KanbanCard session={makeSession({ status: "waiting" })} onView={() => {}} />);
    expect(screen.getByText("waiting")).toBeInTheDocument();
  });

  it("calls onView when card is clicked", () => {
    const onView = vi.fn();
    render(<KanbanCard session={makeSession()} onView={onView} />);
    fireEvent.click(screen.getByText("Fix bug #42"));
    expect(onView).toHaveBeenCalledWith("s1");
  });

  it("shows Quick Reply and Full View buttons for waiting status", () => {
    render(
      <KanbanCard
        session={makeSession({ status: "waiting" })}
        onView={() => {}}
        onReply={() => {}}
      />,
    );
    expect(screen.getByText("Quick Reply")).toBeInTheDocument();
    expect(screen.getByText("Full View")).toBeInTheDocument();
  });

  it("shows Interrupt button for running status", () => {
    render(
      <KanbanCard
        session={makeSession({ status: "running" })}
        onView={() => {}}
        onInterrupt={() => {}}
      />,
    );
    expect(screen.getByText("Interrupt")).toBeInTheDocument();
  });

  it("shows Resume button for paused status", () => {
    render(
      <KanbanCard
        session={makeSession({ status: "paused" })}
        onView={() => {}}
        onResume={() => {}}
      />,
    );
    expect(screen.getByText("Resume")).toBeInTheDocument();
  });

  it("shows Resume button for interrupted status", () => {
    render(
      <KanbanCard
        session={makeSession({ status: "interrupted" })}
        onView={() => {}}
        onResume={() => {}}
      />,
    );
    expect(screen.getByText("Resume")).toBeInTheDocument();
  });

  it("always shows View button", () => {
    render(<KanbanCard session={makeSession({ status: "completed" })} onView={() => {}} />);
    expect(screen.getByText("View")).toBeInTheDocument();
  });

  it("calls onReply when Full View is clicked", () => {
    const onReply = vi.fn();
    render(
      <KanbanCard
        session={makeSession({ status: "waiting" })}
        onView={() => {}}
        onReply={onReply}
      />,
    );
    fireEvent.click(screen.getByText("Full View"));
    expect(onReply).toHaveBeenCalledWith("s1");
  });

  it("shows last message preview when present", () => {
    render(
      <KanbanCard
        session={makeSession({ lastMessage: "Working on tests..." })}
        onView={() => {}}
      />,
    );
    expect(screen.getByText("Working on tests...")).toBeInTheDocument();
  });

  it("shows linked issue number", () => {
    render(
      <KanbanCard
        session={makeSession({ linkedIssue: { number: 42, title: "Bug" } })}
        onView={() => {}}
      />,
    );
    expect(screen.getByText("#42")).toBeInTheDocument();
  });

  it("shows linked PR number", () => {
    render(
      <KanbanCard
        session={makeSession({ linkedPR: { number: 7, title: "Feature" } })}
        onView={() => {}}
      />,
    );
    expect(screen.getByText("PR #7")).toBeInTheDocument();
  });

  it("shows block type pill for waiting+blockType", () => {
    render(
      <KanbanCard
        session={makeSession({ status: "waiting", blockType: "decision" })}
        onView={() => {}}
      />,
    );
    expect(screen.getByText("decision")).toBeInTheDocument();
  });

  it("applies reduced opacity for closed sessions", () => {
    const { container } = render(
      <KanbanCard session={makeSession({ status: "completed" })} onView={() => {}} />,
    );
    expect(container.firstChild).toHaveClass("opacity-75");
  });

  // New tests for H1 features

  it("shows CI indicator dot when ciStatus is provided", () => {
    const { container } = render(
      <KanbanCard session={makeSession()} onView={() => {}} ciStatus="success" />,
    );
    const dot = container.querySelector('[title="CI: success"]');
    expect(dot).toBeInTheDocument();
    expect(dot).toHaveClass("bg-green-500");
  });

  it("shows red CI dot for failure", () => {
    const { container } = render(
      <KanbanCard session={makeSession()} onView={() => {}} ciStatus="failure" />,
    );
    const dot = container.querySelector('[title="CI: failure"]');
    expect(dot).toBeInTheDocument();
    expect(dot).toHaveClass("bg-red-500");
  });

  it("shows yellow CI dot for pending", () => {
    const { container } = render(
      <KanbanCard session={makeSession()} onView={() => {}} ciStatus="pending" />,
    );
    const dot = container.querySelector('[title="CI: pending"]');
    expect(dot).toBeInTheDocument();
    expect(dot).toHaveClass("bg-yellow-500");
  });

  it("does not show CI dot when ciStatus is null", () => {
    const { container } = render(
      <KanbanCard session={makeSession()} onView={() => {}} ciStatus={null} />,
    );
    expect(container.querySelector('[title^="CI:"]')).not.toBeInTheDocument();
  });

  it("shows textarea for quick reply (multi-line)", () => {
    render(
      <KanbanCard
        session={makeSession({ status: "waiting" })}
        onView={() => {}}
        onReply={() => {}}
      />,
    );
    fireEvent.click(screen.getByText("Quick Reply"));
    const textarea = screen.getByPlaceholderText("Type reply... (Cmd+Enter to send)");
    expect(textarea.tagName).toBe("TEXTAREA");
  });

  it("shows Retry button for failed sessions when onRetry is provided", () => {
    const onRetry = vi.fn();
    render(
      <KanbanCard
        session={makeSession({ status: "failed" })}
        onView={() => {}}
        onRetry={onRetry}
      />,
    );
    expect(screen.getByText("Retry")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Retry"));
    expect(onRetry).toHaveBeenCalledWith("s1");
  });

  it("shows Kill button with confirmation for running sessions", () => {
    const onKill = vi.fn();
    render(
      <KanbanCard session={makeSession({ status: "running" })} onView={() => {}} onKill={onKill} />,
    );
    expect(screen.getByText("Kill")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Kill"));
    // Should show confirmation
    expect(screen.getByText(/Kill "Fix bug #42"\?/)).toBeInTheDocument();
    // Confirm kill
    fireEvent.click(screen.getByText("Yes"));
    expect(onKill).toHaveBeenCalledWith("s1");
  });
});
