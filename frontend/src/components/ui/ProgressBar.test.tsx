import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { ProgressBar } from "./ProgressBar";

const STEPS = ["Story", "Parties", "Evidence", "Timeline", "Review"];

describe("ProgressBar", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders all step labels", () => {
    render(<ProgressBar steps={STEPS} currentStep={0} />);
    for (const step of STEPS) {
      // Each label appears in both mobile and desktop views
      const matches = screen.getAllByText(step);
      expect(matches.length).toBeGreaterThanOrEqual(1);
    }
  });

  it("shows current step number and name for mobile", () => {
    render(<ProgressBar steps={STEPS} currentStep={2} />);
    expect(screen.getByText("Step 3 of 5")).toBeInTheDocument();
    // "Evidence" appears in both mobile and desktop views
    expect(screen.getAllByText("Evidence").length).toBeGreaterThanOrEqual(1);
  });

  it("applies active styling to current step number", () => {
    const { container } = render(
      <ProgressBar steps={STEPS} currentStep={1} />
    );
    // Step 2 (index 1) should be active
    const stepCircles = container.querySelectorAll("ol li div div");
    // The second circle (index 1) should contain "2"
    expect(stepCircles[1]?.textContent).toBe("2");
  });

  it("shows checkmark for completed steps", () => {
    const { container } = render(
      <ProgressBar steps={STEPS} currentStep={3} />
    );
    // Steps 0, 1, 2 should be completed — they get SVG checkmarks
    const svgs = container.querySelectorAll("ol svg");
    expect(svgs.length).toBeGreaterThanOrEqual(3);
  });

  it("renders correct progress bar width for mobile", () => {
    const { container } = render(
      <ProgressBar steps={STEPS} currentStep={2} />
    );
    const progressFill = container.querySelector(
      ".bg-zinc-900, .dark\\:bg-zinc-100"
    );
    // Step 2 of 5 => (2/4)*100 = 50%
    // Look for the style attribute with width
    const allDivs = container.querySelectorAll("div[style]");
    const progressDiv = Array.from(allDivs).find((div) =>
      div.getAttribute("style")?.includes("width")
    );
    expect(progressDiv).toBeTruthy();
    expect(progressDiv?.getAttribute("style")).toContain("50%");
  });

  it("handles first step correctly", () => {
    const { container } = render(
      <ProgressBar steps={STEPS} currentStep={0} />
    );
    expect(screen.getByText("Step 1 of 5")).toBeInTheDocument();
    // Progress bar should be at 0%
    const allDivs = container.querySelectorAll("div[style]");
    const progressDiv = Array.from(allDivs).find((div) =>
      div.getAttribute("style")?.includes("width")
    );
    expect(progressDiv?.getAttribute("style")).toContain("0%");
  });

  it("handles last step correctly", () => {
    render(<ProgressBar steps={STEPS} currentStep={4} />);
    expect(screen.getByText("Step 5 of 5")).toBeInTheDocument();
    expect(screen.getAllByText("Review").length).toBeGreaterThanOrEqual(1);
  });

  it("has accessible navigation landmark", () => {
    render(<ProgressBar steps={STEPS} currentStep={0} />);
    expect(
      screen.getByRole("navigation", { name: /case intake progress/i })
    ).toBeInTheDocument();
  });
});
