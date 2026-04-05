import { render, screen, fireEvent } from "@testing-library/react";
import { OnboardingDialog } from "../OnboardingDialog";

vi.mock("../../lib/tauri", () => ({
  checkPrerequisites: vi.fn(() => Promise.resolve({ claude: true, git: true, gh: true })),
}));

describe("OnboardingDialog", () => {
  it("renders the welcome title", () => {
    render(
      <OnboardingDialog
        onClose={() => {}}
        onOpenRepoSettings={() => {}}
        onOpenNewSession={() => {}}
      />,
    );
    expect(screen.getByText("Welcome to Octopus")).toBeInTheDocument();
  });

  it("shows the prerequisites step first", () => {
    render(
      <OnboardingDialog
        onClose={() => {}}
        onOpenRepoSettings={() => {}}
        onOpenNewSession={() => {}}
      />,
    );
    expect(screen.getByText("01 / check prerequisites")).toBeInTheDocument();
  });

  it("calls onClose when close button is clicked", () => {
    const onClose = vi.fn();
    render(
      <OnboardingDialog
        onClose={onClose}
        onOpenRepoSettings={() => {}}
        onOpenNewSession={() => {}}
      />,
    );
    // Close button is the X SVG's parent button
    const closeButtons = screen.getAllByRole("button");
    const xButton = closeButtons.find((btn) => btn.querySelector("svg"));
    if (xButton) fireEvent.click(xButton);
    expect(onClose).toHaveBeenCalled();
  });

  it("shows Next button on prerequisites step", () => {
    render(
      <OnboardingDialog
        onClose={() => {}}
        onOpenRepoSettings={() => {}}
        onOpenNewSession={() => {}}
      />,
    );
    expect(screen.getByText("Next")).toBeInTheDocument();
  });
});
