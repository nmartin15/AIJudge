import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ToastContainer, type Toast } from "./ToastContainer";

function makeToast(
  overrides: Partial<Toast> & { id: string }
): Toast {
  return {
    message: "Default toast message",
    type: "info",
    ...overrides,
  };
}

describe("ToastContainer", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders nothing when there are no toasts", () => {
    const { container } = render(
      <ToastContainer toasts={[]} onDismiss={vi.fn()} />
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders a single toast message", () => {
    const toasts: Toast[] = [
      makeToast({ id: "1", message: "Saved successfully", type: "success" }),
    ];
    render(<ToastContainer toasts={toasts} onDismiss={vi.fn()} />);
    expect(screen.getByText("Saved successfully")).toBeInTheDocument();
  });

  it("renders multiple toasts", () => {
    const toasts: Toast[] = [
      makeToast({ id: "1", message: "First toast", type: "info" }),
      makeToast({ id: "2", message: "Second toast", type: "error" }),
      makeToast({ id: "3", message: "Third toast", type: "success" }),
    ];
    render(<ToastContainer toasts={toasts} onDismiss={vi.fn()} />);
    expect(screen.getByText("First toast")).toBeInTheDocument();
    expect(screen.getByText("Second toast")).toBeInTheDocument();
    expect(screen.getByText("Third toast")).toBeInTheDocument();
  });

  it("calls onDismiss with the correct id when dismiss button is clicked", () => {
    const dismissFn = vi.fn();
    const toasts: Toast[] = [
      makeToast({ id: "toast-42", message: "Dismissable", type: "info" }),
    ];
    render(<ToastContainer toasts={toasts} onDismiss={dismissFn} />);

    // Find the dismiss button (the X button)
    const buttons = screen.getAllByRole("button");
    expect(buttons.length).toBe(1);
    fireEvent.click(buttons[0]);

    expect(dismissFn).toHaveBeenCalledWith("toast-42");
  });

  it("applies success styling for success toasts", () => {
    const toasts: Toast[] = [
      makeToast({ id: "1", message: "Success!", type: "success" }),
    ];
    const { container } = render(
      <ToastContainer toasts={toasts} onDismiss={vi.fn()} />
    );
    // Success toasts have emerald coloring
    const toastEl = container.querySelector("[class*='emerald']");
    expect(toastEl).not.toBeNull();
  });

  it("applies error styling for error toasts", () => {
    const toasts: Toast[] = [
      makeToast({ id: "1", message: "Error!", type: "error" }),
    ];
    const { container } = render(
      <ToastContainer toasts={toasts} onDismiss={vi.fn()} />
    );
    const toastEl = container.querySelector("[class*='rose']");
    expect(toastEl).not.toBeNull();
  });

  it("applies info styling for info toasts", () => {
    const toasts: Toast[] = [
      makeToast({ id: "1", message: "FYI", type: "info" }),
    ];
    const { container } = render(
      <ToastContainer toasts={toasts} onDismiss={vi.fn()} />
    );
    // Info toasts use zinc/white styling
    const toastEl = container.querySelector("[class*='zinc']");
    expect(toastEl).not.toBeNull();
  });
});
