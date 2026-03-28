import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ThinkingBlock } from "../claude/ThinkingBlock";

describe("ThinkingBlock", () => {
  it("renders Thinking label", () => {
    render(<ThinkingBlock thinking="Some thoughts" />);
    expect(screen.getByText("Thinking")).toBeInTheDocument();
  });

  it("is expanded by default showing full thinking text", () => {
    const text = "Analyzing the code structure for potential issues.";
    render(<ThinkingBlock thinking={text} />);
    expect(screen.getByText(text)).toBeInTheDocument();
  });

  it("collapses on click and hides content", () => {
    const text = "Let me check this file. Then I will analyze the code.";
    render(<ThinkingBlock thinking={text} />);

    // Full text visible by default
    expect(screen.getByText(text)).toBeInTheDocument();

    // Click to collapse — AnimatedCollapse hides with opacity:0
    fireEvent.click(screen.getByText("Thinking"));
    const el = screen.getByText(text);
    const wrapper = el.closest("[style]");
    expect(wrapper).toBeTruthy();
    expect(wrapper?.getAttribute("style")).toContain("opacity: 0");
  });

  it("re-expands on second click", () => {
    const text = "Let me check this file. Then I will analyze the code.";
    render(<ThinkingBlock thinking={text} />);

    // Collapse
    fireEvent.click(screen.getByText("Thinking"));
    const el = screen.getByText(text);
    const wrapper = el.closest("[style]");
    expect(wrapper?.getAttribute("style")).toContain("opacity: 0");

    // Expand again
    fireEvent.click(screen.getByText("Thinking"));
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

  it("shows italic text in expanded view", () => {
    const { container } = render(<ThinkingBlock thinking="Some thought" />);
    expect(container.querySelector(".italic")).toBeTruthy();
  });
});
