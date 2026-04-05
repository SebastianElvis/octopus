import { renderHook } from "@testing-library/react";
import { useTauriEvent } from "../useTauriEvent";

describe("useTauriEvent", () => {
  it("calls subscribe on mount", () => {
    const unlisten = vi.fn();
    const subscribe = vi.fn(() => Promise.resolve(unlisten));

    renderHook(() => useTauriEvent(subscribe, []));
    expect(subscribe).toHaveBeenCalledTimes(1);
  });

  it("calls unlisten on unmount", async () => {
    const unlisten = vi.fn();
    const subscribe = vi.fn(() => Promise.resolve(unlisten));

    const { unmount } = renderHook(() => useTauriEvent(subscribe, []));
    // Let the subscription promise resolve
    await vi.waitFor(() => expect(unlisten).not.toHaveBeenCalled());

    unmount();
    // After unmount, the cleanup should call unlisten
    expect(unlisten).toHaveBeenCalledTimes(1);
  });

  it("immediately cleans up if unmounted before subscription resolves", async () => {
    const unlisten = vi.fn();
    let resolveSubscribe: (fn: () => void) => void;
    const subscribe = () =>
      new Promise<() => void>((r) => {
        resolveSubscribe = r;
      });

    const { unmount } = renderHook(() => useTauriEvent(subscribe, []));
    unmount(); // Unmount before subscription resolves

    // Now resolve — should immediately call unlisten since component is gone

    resolveSubscribe!(unlisten);
    await vi.waitFor(() => expect(unlisten).toHaveBeenCalledTimes(1));
  });

  it("re-subscribes when deps change", async () => {
    const unlisten1 = vi.fn();
    const unlisten2 = vi.fn();
    let callCount = 0;
    const subscribe = vi.fn(() => {
      callCount++;
      return Promise.resolve(callCount === 1 ? unlisten1 : unlisten2);
    });

    const { rerender } = renderHook(({ dep }) => useTauriEvent(subscribe, [dep]), {
      initialProps: { dep: 1 },
    });

    // Wait for first subscription
    await vi.waitFor(() => expect(subscribe).toHaveBeenCalledTimes(1));

    rerender({ dep: 2 });
    await vi.waitFor(() => expect(subscribe).toHaveBeenCalledTimes(2));
    // First subscription should be cleaned up
    expect(unlisten1).toHaveBeenCalledTimes(1);
  });

  it("does not re-subscribe when deps are stable", async () => {
    const subscribe = vi.fn(() => Promise.resolve(() => {}));

    const { rerender } = renderHook(({ dep }) => useTauriEvent(subscribe, [dep]), {
      initialProps: { dep: 1 },
    });

    await vi.waitFor(() => expect(subscribe).toHaveBeenCalledTimes(1));
    rerender({ dep: 1 });
    expect(subscribe).toHaveBeenCalledTimes(1);
  });

  it("logs errors from subscription", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const subscribe = () => Promise.reject(new Error("subscribe failed"));

    renderHook(() => useTauriEvent(subscribe, []));
    await vi.waitFor(() =>
      expect(consoleSpy).toHaveBeenCalledWith(
        "[useTauriEvent] Failed to subscribe:",
        "subscribe failed",
      ),
    );
    consoleSpy.mockRestore();
  });
});
