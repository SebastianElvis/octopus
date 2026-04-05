import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ThinkingBlock } from "../claude/ThinkingBlock";

describe("ThinkingBlock", () => {
  it("renders Thinking label", () => {
    render(<ThinkingBlock thinking="Some thoughts" />);
    expect(screen.getByText("Thinking")).toBeInTheDocument();
  });

  it("always shows thinking text (no collapse)", () => {
    const text = "Analyzing the code structure for potential issues.";
    render(<ThinkingBlock thinking={text} />);
    expect(screen.getByText(text)).toBeInTheDocument();
  });

  it("shows streaming indicator when isStreaming is true", () => {
    const { container } = render(<ThinkingBlock thinking="Thinking..." isStreaming />);
    // Purple pulse dot for streaming
    expect(container.querySelector(".animate-pulse")).toBeTruthy();
  });

  it("does not show streaming indicator when not streaming", () => {
    const { container } = render(<ThinkingBlock thinking="Done thinking." />);
    // No streaming indicators (no animate-pulse elements)
    expect(container.querySelector(".bg-purple-400.animate-pulse")).toBeNull();
  });

  it("shows italic text", () => {
    const { container } = render(<ThinkingBlock thinking="Some thought" />);
    expect(container.querySelector(".italic")).toBeTruthy();
  });
});
