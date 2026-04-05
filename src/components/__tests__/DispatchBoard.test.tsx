import { render, screen, fireEvent } from "@testing-library/react";
import { DispatchBoard } from "../DispatchBoard";
import { useSessionStore } from "../../stores/sessionStore";
import type { Session } from "../../lib/types";

vi.mock("../../lib/tauri", () => ({
  checkStuckSessions: vi.fn(() => Promise.resolve([])),
  killSession: vi.fn(() => Promise.resolve()),
  resumeSession: vi.fn(() => Promise.resolve()),
  retrySession: vi.fn(() =>
    Promise.resolve({
      id: "new",
      name: "retry",
      repo: "",
      repoId: "",
      branch: "",
      status: "running",
      stateChangedAt: Date.now(),
    }),
  ),
}));

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
    sessions: [],
    sessionsLoading: false,
    sessionsError: null,
  });
});

describe("DispatchBoard", () => {
  it("shows empty state when no sessions", () => {
    render(<DispatchBoard onViewSession={() => {}} onNewSession={() => {}} />);
    expect(screen.getByText("no sessions")).toBeInTheDocument();
    expect(screen.getByText("+ new session")).toBeInTheDocument();
  });

  it("calls onNewSession when button clicked in empty state", () => {
    const onNewSession = vi.fn();
    render(<DispatchBoard onViewSession={() => {}} onNewSession={onNewSession} />);
    fireEvent.click(screen.getByText("+ new session"));
    expect(onNewSession).toHaveBeenCalled();
  });

  it("shows loading skeleton when sessionsLoading", () => {
    useSessionStore.setState({ sessionsLoading: true });
    const { container } = render(
      <DispatchBoard onViewSession={() => {}} onNewSession={() => {}} />,
    );
    expect(container.querySelectorAll(".animate-pulse").length).toBeGreaterThan(0);
  });

  it("shows error state when sessionsError is set", () => {
    useSessionStore.setState({
      sessionsLoading: false,
      sessionsError: "Database connection failed",
    });
    render(<DispatchBoard onViewSession={() => {}} onNewSession={() => {}} />);
    expect(screen.getByText("Failed to load sessions")).toBeInTheDocument();
    expect(screen.getByText("Database connection failed")).toBeInTheDocument();
    expect(screen.getByText("Retry")).toBeInTheDocument();
  });

  it("retry button triggers loadSessions", () => {
    const loadSessions = vi.fn(() => Promise.resolve());
    useSessionStore.setState({
      sessionsLoading: false,
      sessionsError: "Something broke",
      loadSessions,
    });
    render(<DispatchBoard onViewSession={() => {}} onNewSession={() => {}} />);
    fireEvent.click(screen.getByText("Retry"));
    expect(loadSessions).toHaveBeenCalled();
  });

  it("renders three kanban columns", () => {
    useSessionStore.setState({
      sessions: [
        makeSession({ id: "s1", status: "attention" }),
        makeSession({ id: "s2", status: "running" }),
        makeSession({ id: "s3", status: "done" }),
      ],
    });
    render(<DispatchBoard onViewSession={() => {}} onNewSession={() => {}} />);

    expect(screen.getByText("Needs Input")).toBeInTheDocument();
    expect(screen.getByText("Running")).toBeInTheDocument();
    expect(screen.getByText("Done")).toBeInTheDocument();
  });

  it("categorizes sessions into correct columns", () => {
    useSessionStore.setState({
      sessions: [
        makeSession({ id: "s1", name: "Waiting one", status: "attention" }),
        makeSession({ id: "s2", name: "Running one", status: "running" }),
        makeSession({ id: "s3", name: "Done one", status: "done" }),
        makeSession({ id: "s4", name: "Stuck one", status: "attention" }),
      ],
    });
    render(<DispatchBoard onViewSession={() => {}} onNewSession={() => {}} />);

    expect(screen.getByText("Waiting one")).toBeInTheDocument();
    expect(screen.getByText("Running one")).toBeInTheDocument();
    expect(screen.getByText("Done one")).toBeInTheDocument();
    expect(screen.getByText("Stuck one")).toBeInTheDocument();
  });

  it("shows fleet summary counts", () => {
    useSessionStore.setState({
      sessions: [
        makeSession({ id: "s1", status: "attention" }),
        makeSession({ id: "s2", status: "running" }),
        makeSession({ id: "s3", status: "running" }),
        makeSession({ id: "s4", status: "done" }),
        makeSession({ id: "s5", status: "done" }),
      ],
    });
    render(<DispatchBoard onViewSession={() => {}} onNewSession={() => {}} />);

    // Fleet summary pills show count + label for each status
    expect(screen.getAllByText("attention").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("running").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("done").length).toBeGreaterThanOrEqual(1);
    // Natural-language summary sentence
    expect(screen.getByText("1 session needs your input. 2 actively running.")).toBeInTheDocument();
  });

  it("search filters sessions by name", () => {
    useSessionStore.setState({
      sessions: [
        makeSession({ id: "s1", name: "Fix auth bug", status: "running" }),
        makeSession({ id: "s2", name: "Add tests", status: "running" }),
      ],
    });
    render(<DispatchBoard onViewSession={() => {}} onNewSession={() => {}} />);

    fireEvent.change(screen.getByPlaceholderText("Filter sessions... (press / to focus)"), {
      target: { value: "auth" },
    });

    expect(screen.getByText("Fix auth bug")).toBeInTheDocument();
    expect(screen.queryByText("Add tests")).not.toBeInTheDocument();
  });

  it("search filters by repo", () => {
    useSessionStore.setState({
      sessions: [
        makeSession({ id: "s1", name: "Task A", repo: "backend", status: "running" }),
        makeSession({ id: "s2", name: "Task B", repo: "frontend", status: "running" }),
      ],
    });
    render(<DispatchBoard onViewSession={() => {}} onNewSession={() => {}} />);

    fireEvent.change(screen.getByPlaceholderText("Filter sessions... (press / to focus)"), {
      target: { value: "frontend" },
    });

    expect(screen.queryByText("Task A")).not.toBeInTheDocument();
    expect(screen.getByText("Task B")).toBeInTheDocument();
  });

  it("shows empty column messages", () => {
    useSessionStore.setState({
      sessions: [makeSession({ id: "s1", status: "running" })],
    });
    render(<DispatchBoard onViewSession={() => {}} onNewSession={() => {}} />);

    expect(screen.getByText("No sessions need your attention right now.")).toBeInTheDocument();
    expect(screen.getByText("Finished sessions will appear here.")).toBeInTheDocument();
  });
});
