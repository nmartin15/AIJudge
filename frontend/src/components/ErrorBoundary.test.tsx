import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ErrorBoundary } from "./ErrorBoundary";

function ThrowingChild({ shouldThrow }: { shouldThrow: boolean }) {
  if (shouldThrow) throw new Error("Test error: component crashed!");
  return <p>Child content</p>;
}

describe("ErrorBoundary", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders children when there is no error", () => {
    render(
      <ErrorBoundary>
        <p>All good</p>
      </ErrorBoundary>
    );
    expect(screen.getByText("All good")).toBeInTheDocument();
  });

  it("shows fallback UI when a child throws", () => {
    // Suppress console.error for the expected error
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    render(
      <ErrorBoundary>
        <ThrowingChild shouldThrow={true} />
      </ErrorBoundary>
    );

    expect(screen.getByText("Something went wrong")).toBeInTheDocument();
    expect(screen.getByText(/An unexpected error occurred/)).toBeInTheDocument();
    expect(screen.queryByText("Child content")).not.toBeInTheDocument();

    spy.mockRestore();
  });

  it("displays error message in collapsible details", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    render(
      <ErrorBoundary>
        <ThrowingChild shouldThrow={true} />
      </ErrorBoundary>
    );

    expect(screen.getByText("Technical details")).toBeInTheDocument();
    expect(
      screen.getByText(/Test error: component crashed!/)
    ).toBeInTheDocument();

    spy.mockRestore();
  });

  it("provides a 'Reload page' button", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const reloadMock = vi.fn();
    Object.defineProperty(window, "location", {
      value: { reload: reloadMock },
      writable: true,
    });

    render(
      <ErrorBoundary>
        <ThrowingChild shouldThrow={true} />
      </ErrorBoundary>
    );

    const btn = screen.getByRole("button", { name: /reload page/i });
    expect(btn).toBeInTheDocument();
    fireEvent.click(btn);
    expect(reloadMock).toHaveBeenCalled();

    spy.mockRestore();
  });

  it("'Try again' resets and re-renders children", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    // Start with an error, then "fix" it
    let shouldThrow = true;
    function ConditionalThrower() {
      if (shouldThrow) throw new Error("Boom");
      return <p>Recovered</p>;
    }

    render(
      <ErrorBoundary>
        <ConditionalThrower />
      </ErrorBoundary>
    );

    expect(screen.getByText("Something went wrong")).toBeInTheDocument();

    // "Fix" the child
    shouldThrow = false;
    fireEvent.click(screen.getByRole("button", { name: /try again/i }));

    expect(screen.getByText("Recovered")).toBeInTheDocument();
    expect(screen.queryByText("Something went wrong")).not.toBeInTheDocument();

    spy.mockRestore();
  });

  it("shows disclaimer text about clearing cache", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    render(
      <ErrorBoundary>
        <ThrowingChild shouldThrow={true} />
      </ErrorBoundary>
    );

    expect(
      screen.getByText(/clear your browser cache/i)
    ).toBeInTheDocument();

    spy.mockRestore();
  });
});
