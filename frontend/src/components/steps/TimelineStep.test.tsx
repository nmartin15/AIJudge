import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { TimelineStep } from "./TimelineStep";
import type { TimelineEvent } from "@/lib/types";

function defaultProps(
  overrides: Partial<Parameters<typeof TimelineStep>[0]> = {}
) {
  return {
    savedEvents: [] as TimelineEvent[],
    onSave: vi.fn().mockResolvedValue(undefined),
    isSaving: false,
    error: null,
    onBack: vi.fn(),
    onContinue: vi.fn(),
    isBackendMode: true,
    ...overrides,
  };
}

afterEach(cleanup);

describe("TimelineStep", () => {
  it("renders header and add-event form", () => {
    render(<TimelineStep {...defaultProps()} />);
    expect(screen.getByText(/what happened, and when/i)).toBeInTheDocument();
    expect(screen.getByText(/add a timeline event/i)).toBeInTheDocument();
  });

  it("disables add button when date or description is empty", () => {
    render(<TimelineStep {...defaultProps()} />);
    const addBtn = screen.getByRole("button", { name: /add event/i });
    expect(addBtn).toBeDisabled();

    const dateInput = document.querySelector(
      'input[type="datetime-local"]'
    ) as HTMLInputElement;
    fireEvent.change(dateInput, { target: { value: "2025-01-15T10:00" } });
    expect(addBtn).toBeDisabled();
  });

  it("enables add button when both date and description are filled", () => {
    render(<TimelineStep {...defaultProps()} />);

    const dateInput = document.querySelector(
      'input[type="datetime-local"]'
    ) as HTMLInputElement;
    fireEvent.change(dateInput, { target: { value: "2025-01-15T10:00" } });
    fireEvent.change(screen.getByPlaceholderText(/describe the event/i), {
      target: { value: "Lease signed" },
    });

    const addBtn = screen.getByRole("button", { name: /add event/i });
    expect(addBtn).not.toBeDisabled();
  });

  it("calls onSave with form data when add button is clicked", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<TimelineStep {...defaultProps({ onSave })} />);

    const dateInput = document.querySelector(
      'input[type="datetime-local"]'
    ) as HTMLInputElement;
    fireEvent.change(dateInput, { target: { value: "2025-01-15T10:00" } });
    fireEvent.change(screen.getByPlaceholderText(/describe the event/i), {
      target: { value: "Lease ended" },
    });
    fireEvent.click(screen.getByRole("button", { name: /add event/i }));

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        date: "2025-01-15T10:00",
        description: "Lease ended",
        source: "plaintiff",
        disputed: false,
      })
    );
  });

  it("clears form after successful save", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<TimelineStep {...defaultProps({ onSave })} />);

    const dateInput = document.querySelector(
      'input[type="datetime-local"]'
    ) as HTMLInputElement;
    fireEvent.change(dateInput, { target: { value: "2025-01-15T10:00" } });
    const descInput = screen.getByPlaceholderText(/describe the event/i);
    fireEvent.change(descInput, { target: { value: "Event A" } });
    fireEvent.click(screen.getByRole("button", { name: /add event/i }));

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(dateInput).toHaveValue(""));
    await waitFor(() => expect(descInput).toHaveValue(""));
  });

  it("passes disputed flag when checkbox is checked", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<TimelineStep {...defaultProps({ onSave })} />);

    const dateInput = document.querySelector(
      'input[type="datetime-local"]'
    ) as HTMLInputElement;
    fireEvent.change(dateInput, { target: { value: "2025-06-01T09:00" } });
    fireEvent.change(screen.getByPlaceholderText(/describe the event/i), {
      target: { value: "Disputed event" },
    });
    fireEvent.click(
      screen.getByLabelText(/the other party disputes/i)
    );
    fireEvent.click(screen.getByRole("button", { name: /add event/i }));

    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({ disputed: true })
      )
    );
  });

  it("renders saved events in timeline", () => {
    const events: TimelineEvent[] = [
      {
        id: "t-1",
        case_id: "c-1",
        event_date: "2025-01-15T10:00:00Z",
        description: "Lease signed",
        source: "plaintiff",
        disputed: false,
        created_at: new Date().toISOString(),
      },
      {
        id: "t-2",
        case_id: "c-1",
        event_date: "2025-03-01T10:00:00Z",
        description: "Deposit not returned",
        source: "plaintiff",
        disputed: true,
        created_at: new Date().toISOString(),
      },
    ];
    render(<TimelineStep {...defaultProps({ savedEvents: events })} />);
    expect(screen.getByText("Lease signed")).toBeInTheDocument();
    expect(screen.getByText("Deposit not returned")).toBeInTheDocument();
    expect(screen.getByText(/timeline \(2 events\)/i)).toBeInTheDocument();
    expect(screen.getByText("Disputed")).toBeInTheDocument();
  });

  it("shows simulation hint when not in backend mode and no events", () => {
    render(<TimelineStep {...defaultProps({ isBackendMode: false })} />);
    expect(screen.getByText(/simulation mode/i)).toBeInTheDocument();
  });

  it("shows error message", () => {
    render(<TimelineStep {...defaultProps({ error: "Save failed" })} />);
    expect(screen.getByText("Save failed")).toBeInTheDocument();
  });

  it("calls onBack and onContinue", () => {
    const onBack = vi.fn();
    const onContinue = vi.fn();
    render(<TimelineStep {...defaultProps({ onBack, onContinue })} />);

    fireEvent.click(screen.getByRole("button", { name: /^back$/i }));
    expect(onBack).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: /^continue$/i }));
    expect(onContinue).toHaveBeenCalledTimes(1);
  });
});
