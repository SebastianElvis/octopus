import { renderHook, waitFor, act } from "@testing-library/react";
import { useAsync } from "../useAsync";

describe("useAsync", () => {
  it("starts in loading state", () => {
    const factory = () => new Promise<string>(() => {});
    const { result } = renderHook(() => useAsync(factory, []));
    expect(result.current.loading).toBe(true);
    expect(result.current.data).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it("resolves with data on success", async () => {
    const factory = () => Promise.resolve("hello");
    const { result } = renderHook(() => useAsync(factory, []));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data).toBe("hello");
    expect(result.current.error).toBeNull();
  });

  it("handles Error rejection", async () => {
    const factory = () => Promise.reject(new Error("boom"));
    const { result } = renderHook(() => useAsync(factory, []));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data).toBeNull();
    expect(result.current.error).toBe("boom");
  });

  it("handles string rejection", async () => {
    // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
    const factory = () => Promise.reject("string error");
    const { result } = renderHook(() => useAsync(factory, []));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe("string error");
  });

  it("re-runs when deps change", async () => {
    let callCount = 0;
    const factory = () => {
      callCount++;
      return Promise.resolve(callCount);
    };

    const { result, rerender } = renderHook(({ dep }) => useAsync(factory, [dep]), {
      initialProps: { dep: 1 },
    });
    await waitFor(() => expect(result.current.data).toBe(1));

    rerender({ dep: 2 });
    await waitFor(() => expect(result.current.data).toBe(2));
    expect(callCount).toBe(2);
  });

  it("cancels stale requests", async () => {
    let resolve1: (v: string) => void;
    const p1 = new Promise<string>((r) => {
      resolve1 = r;
    });
    let callCount = 0;

    const { result, rerender } = renderHook(
      ({ dep }) =>
        useAsync(() => {
          callCount++;
          return callCount === 1 ? p1 : Promise.resolve("second");
        }, [dep]),
      { initialProps: { dep: 1 } },
    );

    // Trigger re-run before first resolves
    rerender({ dep: 2 });
    await waitFor(() => expect(result.current.data).toBe("second"));

    // Now resolve the stale first request — should be ignored
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    act(() => {
      resolve1!("first");
    });
    expect(result.current.data).toBe("second");
  });

  it("reload re-executes the factory", async () => {
    let callCount = 0;
    const factory = () => Promise.resolve(++callCount);
    const { result } = renderHook(() => useAsync(factory, []));
    await waitFor(() => expect(result.current.data).toBe(1));

    act(() => {
      result.current.reload();
    });
    await waitFor(() => expect(result.current.data).toBe(2));
  });

  it("clears error on re-execution", async () => {
    let shouldFail = true;
    const factory = () => (shouldFail ? Promise.reject(new Error("fail")) : Promise.resolve("ok"));

    const { result } = renderHook(() => useAsync(factory, []));
    await waitFor(() => expect(result.current.error).toBe("fail"));

    shouldFail = false;
    act(() => {
      result.current.reload();
    });
    await waitFor(() => expect(result.current.data).toBe("ok"));
    expect(result.current.error).toBeNull();
  });
});
