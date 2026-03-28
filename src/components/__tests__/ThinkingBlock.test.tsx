import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ThinkingBlock } from "../claude/ThinkingBlock";

describe("ThinkingBlock", () => {
  it("renders Thinking label", () => {
    render(<ThinkingBlock thinking="Some thoughts" />);
    expect(screen.getByText("Thinking")).toBeInTheDocument();
  });

  it("shows preview of short thinking content when collapsed", () => {
    render(<ThinkingBlock thinking="Short thought" />);
    expect(screen.getByText("Short thought")).toBeInTheDocument();
  });

  it("truncates long thinking content in preview", () => {
    const longText = "a".repeat(150);
    render(<ThinkingBlock thinking={longText} />);
    expect(screen.getByText("a".repeat(120) + "...")).toBeInTheDocument();
  });

  it("shows full content when expanded", () => {
    const longText = "a".repeat(150);
    render(<ThinkingBlock thinking={longText} />);

    // Click to expand
    fireEvent.click(screen.getByText("Thinking"));

    // Full text should be visible
    expect(screen.getByText(longText)).toBeInTheDocument();
  });

  it("collapses back on second click", () => {
    const longText = "a".repeat(150);
    render(<ThinkingBlock thinking={longText} />);

    // Expand
    fireEvent.click(screen.getByText("Thinking"));
    expect(screen.getByText(longText)).toBeInTheDocument();

    // Collapse
    fireEvent.click(screen.getByText("Thinking"));
    expect(screen.getByText("a".repeat(120) + "...")).toBeInTheDocument();
  });

  it("shows streaming indicator when isStreaming", () => {
    const { container } = render(
      <ThinkingBlock thinking="Analyzing..." isStreaming />,
    );
    expect(container.querySelector(".animate-pulse")).toBeTruthy();
  });

  it("does not show streaming indicator when not streaming", () => {
    const { container } = render(
      <ThinkingBlock thinking="Analyzing..." isStreaming={false} />,
    );
    expect(container.querySelector(".animate-pulse")).toBeNull();
  });

  it("shows preview italic text", () => {
    const { container } = render(<ThinkingBlock thinking="Some thought" />);
    expect(container.querySelector(".italic")).toBeTruthy();
  });
});
