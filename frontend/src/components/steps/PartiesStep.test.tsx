import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PartiesStep } from "./PartiesStep";
import type { Party } from "@/lib/types";

function defaultProps(
  overrides: Partial<Parameters<typeof PartiesStep>[0]> = {}
) {
  return {
    plaintiff: { name: "", address: "", phone: "" },
    defendant: { name: "", address: "", phone: "" },
    onFieldChange: vi.fn(),
    savedParties: [] as Party[],
    onSaveParty: vi.fn(),
    isSaving: false,
    error: null,
    onBack: vi.fn(),
    onContinue: vi.fn(),
    isBackendMode: true,
    ...overrides,
  };
}

afterEach(cleanup);

describe("PartiesStep", () => {
  it("renders header and both party cards", () => {
    render(<PartiesStep {...defaultProps()} />);
    expect(screen.getByText(/who's involved/i)).toBeInTheDocument();
    expect(screen.getByText("Plaintiff (you)")).toBeInTheDocument();
    expect(screen.getByText("Defendant (other party)")).toBeInTheDocument();
  });

  it("shows save buttons in backend mode when parties are unsaved", () => {
    render(<PartiesStep {...defaultProps()} />);
    expect(
      screen.getByRole("button", { name: /save plaintiff/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /save defendant/i })
    ).toBeInTheDocument();
  });

  it("hides save buttons when not in backend mode", () => {
    render(<PartiesStep {...defaultProps({ isBackendMode: false })} />);
    expect(
      screen.queryByRole("button", { name: /save plaintiff/i })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /save defendant/i })
    ).not.toBeInTheDocument();
  });

  it("hides save button and shows Saved badge once a party is saved", () => {
    const savedParties: Party[] = [
      {
        id: "p-1",
        case_id: "c-1",
        role: "plaintiff",
        name: "Alice",
        address: null,
        phone: null,
      },
    ];
    render(<PartiesStep {...defaultProps({ savedParties })} />);
    expect(
      screen.queryByRole("button", { name: /save plaintiff/i })
    ).not.toBeInTheDocument();
    expect(screen.getByText("Saved")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /save defendant/i })
    ).toBeInTheDocument();
  });

  it("calls onSaveParty with correct role when save buttons are clicked", () => {
    const onSaveParty = vi.fn();
    render(<PartiesStep {...defaultProps({ onSaveParty })} />);

    fireEvent.click(screen.getByRole("button", { name: /save plaintiff/i }));
    expect(onSaveParty).toHaveBeenCalledWith("plaintiff");

    fireEvent.click(screen.getByRole("button", { name: /save defendant/i }));
    expect(onSaveParty).toHaveBeenCalledWith("defendant");
  });

  it("calls onFieldChange when typing in name inputs", () => {
    const onFieldChange = vi.fn();
    render(<PartiesStep {...defaultProps({ onFieldChange })} />);

    const nameInputs = screen.getAllByPlaceholderText(/full legal name/i);
    fireEvent.change(nameInputs[0], { target: { value: "Alice" } });
    expect(onFieldChange).toHaveBeenCalledWith("plaintiff", "name", "Alice");

    fireEvent.change(nameInputs[1], { target: { value: "Bob" } });
    expect(onFieldChange).toHaveBeenCalledWith("defendant", "name", "Bob");
  });

  it("formats phone input as (xxx) xxx-xxxx", () => {
    render(<PartiesStep {...defaultProps()} />);
    const phoneInputs = screen.getAllByPlaceholderText("(307) 555-0100");
    fireEvent.change(phoneInputs[0], { target: { value: "3075550100" } });
    expect(phoneInputs[0]).toHaveValue("(307) 555-0100");
  });

  it("disables save buttons when isSaving is true", () => {
    render(<PartiesStep {...defaultProps({ isSaving: true })} />);
    const savingButtons = screen.getAllByRole("button", { name: /saving/i });
    savingButtons.forEach((btn) => expect(btn).toBeDisabled());
  });

  it("renders error message when error prop is set", () => {
    render(<PartiesStep {...defaultProps({ error: "Something went wrong" })} />);
    expect(screen.getByText("Something went wrong")).toBeInTheDocument();
  });

  it("calls onBack and onContinue when nav buttons are clicked", () => {
    const onBack = vi.fn();
    const onContinue = vi.fn();
    render(<PartiesStep {...defaultProps({ onBack, onContinue })} />);

    fireEvent.click(screen.getByRole("button", { name: /^back$/i }));
    expect(onBack).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: /^continue$/i }));
    expect(onContinue).toHaveBeenCalledTimes(1);
  });
});
