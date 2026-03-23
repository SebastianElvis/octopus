import { render, screen, fireEvent, act } from "@testing-library/react";
import { ToastContainer, type ToastItem } from "../Toast";

function makeToast(overrides: Partial<ToastItem> = {}): ToastItem {
  return {
    id: "t1",
    message: "Test toast",
    type: "info",
    ...overrides,
  };
}

describe("ToastContainer", () => {
  it("renders toast messages", () => {
    const toasts = [
      makeToast({ id: "1", message: "Hello" }),
      makeToast({ id: "2", message: "World" }),
    ];
    render(<ToastContainer toasts={toasts} onDismiss={() => {}} />);
    expect(screen.getByText("Hello")).toBeInTheDocument();
    expect(screen.getByText("World")).toBeInTheDocument();
  });

  it("renders nothing when no toasts", () => {
    const { container } = render(<ToastContainer toasts={[]} onDismiss={() => {}} />);
    expect(container.querySelector("[class*='fixed']")?.children.length).toBe(0);
  });

  it("calls onDismiss when close button is clicked", () => {
    vi.useFakeTimers();
    const onDismiss = vi.fn();
    const toasts = [makeToast({ id: "t1", message: "Dismiss me" })];
    render(<ToastContainer toasts={toasts} onDismiss={onDismiss} />);

    // The close button is the second button (after the message button)
    const buttons = screen.getAllByRole("button");
    // Last button in the toast is the close button (has the X svg)
    fireEvent.click(buttons[buttons.length - 1]);

    // onDismiss is called after a 200ms animation delay
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(onDismiss).toHaveBeenCalledWith("t1");
    vi.useRealTimers();
  });

  it("calls onClickToast when toast message is clicked", () => {
    const onClickToast = vi.fn();
    const toast = makeToast({ id: "t1", message: "Click me" });
    render(<ToastContainer toasts={[toast]} onDismiss={() => {}} onClickToast={onClickToast} />);

    fireEvent.click(screen.getByText("Click me"));
    expect(onClickToast).toHaveBeenCalledWith(toast);
  });

  it("auto-dismisses after default duration", () => {
    vi.useFakeTimers();
    const onDismiss = vi.fn();
    render(<ToastContainer toasts={[makeToast()]} onDismiss={onDismiss} />);

    // Default duration is 8000ms + 200ms animation
    act(() => {
      vi.advanceTimersByTime(8200);
    });
    expect(onDismiss).toHaveBeenCalled();
    vi.useRealTimers();
  });

  it("uses custom duration for auto-dismiss", () => {
    vi.useFakeTimers();
    const onDismiss = vi.fn();
    render(<ToastContainer toasts={[makeToast({ duration: 2000 })]} onDismiss={onDismiss} />);

    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(onDismiss).not.toHaveBeenCalled(); // animation delay not yet elapsed

    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(onDismiss).toHaveBeenCalled();
    vi.useRealTimers();
  });

  it("does not auto-dismiss when duration is 0", () => {
    vi.useFakeTimers();
    const onDismiss = vi.fn();
    render(<ToastContainer toasts={[makeToast({ duration: 0 })]} onDismiss={onDismiss} />);

    act(() => {
      vi.advanceTimersByTime(30000);
    });
    expect(onDismiss).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it("applies correct background color for toast types", () => {
    const { rerender, container } = render(
      <ToastContainer toasts={[makeToast({ type: "success" })]} onDismiss={() => {}} />,
    );
    expect(container.innerHTML).toContain("bg-green-600");

    rerender(<ToastContainer toasts={[makeToast({ type: "warning" })]} onDismiss={() => {}} />);
    expect(container.innerHTML).toContain("bg-orange-500");

    rerender(<ToastContainer toasts={[makeToast({ type: "info" })]} onDismiss={() => {}} />);
    expect(container.innerHTML).toContain("bg-blue-600");
  });
});
