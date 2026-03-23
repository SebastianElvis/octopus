import { render, fireEvent } from "@testing-library/react";
import { ResizeHandle } from "../ResizeHandle";

describe("ResizeHandle", () => {
  it("renders horizontal handle with col-resize cursor", () => {
    const { container } = render(<ResizeHandle direction="horizontal" onResize={() => {}} />);
    const handle = container.firstChild as HTMLElement;
    expect(handle.className).toContain("cursor-col-resize");
    expect(handle.className).toContain("w-1");
  });

  it("renders vertical handle with row-resize cursor", () => {
    const { container } = render(<ResizeHandle direction="vertical" onResize={() => {}} />);
    const handle = container.firstChild as HTMLElement;
    expect(handle.className).toContain("cursor-row-resize");
    expect(handle.className).toContain("h-1");
  });

  it("calls onResize with horizontal delta on drag", () => {
    const onResize = vi.fn();
    const { container } = render(<ResizeHandle direction="horizontal" onResize={onResize} />);
    const handle = container.firstChild as HTMLElement;

    fireEvent.mouseDown(handle, { clientX: 100, clientY: 50 });
    fireEvent.mouseMove(document, { clientX: 110, clientY: 50 });

    expect(onResize).toHaveBeenCalledWith(10);
  });

  it("calls onResize with vertical delta on drag", () => {
    const onResize = vi.fn();
    const { container } = render(<ResizeHandle direction="vertical" onResize={onResize} />);
    const handle = container.firstChild as HTMLElement;

    fireEvent.mouseDown(handle, { clientX: 50, clientY: 200 });
    fireEvent.mouseMove(document, { clientX: 50, clientY: 220 });

    expect(onResize).toHaveBeenCalledWith(20);
  });

  it("tracks incremental deltas across multiple moves", () => {
    const onResize = vi.fn();
    const { container } = render(<ResizeHandle direction="horizontal" onResize={onResize} />);
    const handle = container.firstChild as HTMLElement;

    fireEvent.mouseDown(handle, { clientX: 100, clientY: 0 });
    fireEvent.mouseMove(document, { clientX: 110, clientY: 0 });
    fireEvent.mouseMove(document, { clientX: 115, clientY: 0 });

    expect(onResize).toHaveBeenCalledTimes(2);
    expect(onResize).toHaveBeenNthCalledWith(1, 10);
    expect(onResize).toHaveBeenNthCalledWith(2, 5);
  });

  it("calls onResizeEnd on mouseup", () => {
    const onResizeEnd = vi.fn();
    const { container } = render(
      <ResizeHandle direction="horizontal" onResize={() => {}} onResizeEnd={onResizeEnd} />,
    );
    const handle = container.firstChild as HTMLElement;

    fireEvent.mouseDown(handle, { clientX: 100, clientY: 0 });
    fireEvent.mouseUp(document);

    expect(onResizeEnd).toHaveBeenCalledTimes(1);
  });

  it("sets cursor and userSelect during drag", () => {
    const { container } = render(<ResizeHandle direction="horizontal" onResize={() => {}} />);
    const handle = container.firstChild as HTMLElement;

    fireEvent.mouseDown(handle, { clientX: 100, clientY: 0 });
    expect(document.body.style.cursor).toBe("col-resize");
    expect(document.body.style.userSelect).toBe("none");

    fireEvent.mouseUp(document);
    expect(document.body.style.cursor).toBe("");
    expect(document.body.style.userSelect).toBe("");
  });

  it("does not call onResize after mouseup", () => {
    const onResize = vi.fn();
    const { container } = render(<ResizeHandle direction="horizontal" onResize={onResize} />);
    const handle = container.firstChild as HTMLElement;

    fireEvent.mouseDown(handle, { clientX: 100, clientY: 0 });
    fireEvent.mouseUp(document);
    onResize.mockClear();

    fireEvent.mouseMove(document, { clientX: 200, clientY: 0 });
    expect(onResize).not.toHaveBeenCalled();
  });
});
