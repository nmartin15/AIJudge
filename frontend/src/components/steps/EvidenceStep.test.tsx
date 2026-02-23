import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { EvidenceStep } from "./EvidenceStep";
import type { Evidence } from "@/lib/types";

function defaultProps(
  overrides: Partial<Parameters<typeof EvidenceStep>[0]> = {}
) {
  return {
    savedEvidence: [] as Evidence[],
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

describe("EvidenceStep", () => {
  it("renders header and add-evidence form", () => {
    render(<EvidenceStep {...defaultProps()} />);
    expect(screen.getByText(/what evidence do you have/i)).toBeInTheDocument();
    expect(screen.getByText(/add an evidence item/i)).toBeInTheDocument();
  });

  it("disables add button when title is empty", () => {
    render(<EvidenceStep {...defaultProps()} />);
    const addBtn = screen.getByRole("button", { name: /add evidence/i });
    expect(addBtn).toBeDisabled();
  });

  it("enables add button when title has content", () => {
    render(<EvidenceStep {...defaultProps()} />);
    fireEvent.change(screen.getByPlaceholderText(/signed lease agreement/i), {
      target: { value: "Lease agreement" },
    });
    const addBtn = screen.getByRole("button", { name: /add evidence/i });
    expect(addBtn).not.toBeDisabled();
  });

  it("calls onSave with form data when add button is clicked", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<EvidenceStep {...defaultProps({ onSave })} />);

    fireEvent.change(screen.getByPlaceholderText(/signed lease agreement/i), {
      target: { value: "Signed lease" },
    });
    fireEvent.change(
      screen.getByPlaceholderText(/briefly describe/i),
      { target: { value: "Original signed copy" } }
    );
    fireEvent.click(screen.getByRole("button", { name: /add evidence/i }));

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        role: "plaintiff",
        evidenceType: "document",
        title: "Signed lease",
        description: "Original signed copy",
        file: null,
      })
    );
  });

  it("clears form after successful save", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<EvidenceStep {...defaultProps({ onSave })} />);

    const titleInput = screen.getByPlaceholderText(/signed lease agreement/i);
    fireEvent.change(titleInput, { target: { value: "Evidence A" } });
    fireEvent.click(screen.getByRole("button", { name: /add evidence/i }));

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(titleInput).toHaveValue(""));
  });

  it("renders saved evidence list", () => {
    const evidence: Evidence[] = [
      {
        id: "e-1",
        case_id: "c-1",
        submitted_by: "plaintiff",
        evidence_type: "document",
        title: "Signed lease",
        description: null,
        has_file: false,
        score: null,
        score_explanation: null,
        created_at: new Date().toISOString(),
      },
    ];
    render(<EvidenceStep {...defaultProps({ savedEvidence: evidence })} />);
    expect(screen.getByText("Signed lease")).toBeInTheDocument();
    expect(screen.getByText(/evidence on file \(1\)/i)).toBeInTheDocument();
  });

  it("shows simulation hint when not in backend mode and no evidence", () => {
    render(<EvidenceStep {...defaultProps({ isBackendMode: false })} />);
    expect(screen.getByText(/simulation mode/i)).toBeInTheDocument();
  });

  it("shows error message", () => {
    render(<EvidenceStep {...defaultProps({ error: "Upload failed" })} />);
    expect(screen.getByText("Upload failed")).toBeInTheDocument();
  });

  it("disables add button while saving", () => {
    render(<EvidenceStep {...defaultProps({ isSaving: true })} />);
    expect(screen.getByRole("button", { name: /adding/i })).toBeDisabled();
  });

  it("calls onBack and onContinue", () => {
    const onBack = vi.fn();
    const onContinue = vi.fn();
    render(<EvidenceStep {...defaultProps({ onBack, onContinue })} />);

    fireEvent.click(screen.getByRole("button", { name: /^back$/i }));
    expect(onBack).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: /^continue$/i }));
    expect(onContinue).toHaveBeenCalledTimes(1);
  });
});
