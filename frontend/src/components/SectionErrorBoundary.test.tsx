import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SectionErrorBoundary } from "./SectionErrorBoundary";

function ThrowingChild({ shouldThrow }: { shouldThrow: boolean }) {
  if (shouldThrow) throw new Error("Section crashed");
  return <p>Section content</p>;
}

describe("SectionErrorBoundary", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders children normally when no error", () => {
    render(
      <SectionErrorBoundary section="Test Section">
        <p>Working fine</p>
      </SectionErrorBoundary>
    );
    expect(screen.getByText("Working fine")).toBeInTheDocument();
  });

  it("shows section-specific fallback on error", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    render(
      <SectionErrorBoundary section="Hearing">
        <ThrowingChild shouldThrow={true} />
      </SectionErrorBoundary>
    );

    expect(
      screen.getByText("Hearing encountered an error")
    ).toBeInTheDocument();
    expect(
      screen.getByText(/rest of the page should still work/i)
    ).toBeInTheDocument();
    expect(screen.queryByText("Section content")).not.toBeInTheDocument();

    spy.mockRestore();
  });

  it("shows error details in expandable section", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    render(
      <SectionErrorBoundary section="Judgment">
        <ThrowingChild shouldThrow={true} />
      </SectionErrorBoundary>
    );

    expect(screen.getByText("Details")).toBeInTheDocument();
    expect(screen.getByText("Section crashed")).toBeInTheDocument();

    spy.mockRestore();
  });

  it("retry button resets the section", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    let shouldThrow = true;
    function ToggleChild() {
      if (shouldThrow) throw new Error("Crash");
      return <p>Back to normal</p>;
    }

    render(
      <SectionErrorBoundary section="Test">
        <ToggleChild />
      </SectionErrorBoundary>
    );

    expect(screen.getByText("Test encountered an error")).toBeInTheDocument();

    shouldThrow = false;
    fireEvent.click(screen.getByRole("button", { name: /retry section/i }));

    expect(screen.getByText("Back to normal")).toBeInTheDocument();

    spy.mockRestore();
  });

  it("provides reload page button", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    render(
      <SectionErrorBoundary section="Test">
        <ThrowingChild shouldThrow={true} />
      </SectionErrorBoundary>
    );

    expect(
      screen.getByRole("button", { name: /reload page/i })
    ).toBeInTheDocument();

    spy.mockRestore();
  });
});
