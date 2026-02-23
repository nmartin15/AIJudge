import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ReviewStep } from "./ReviewStep";
import type { Case } from "@/lib/types";

const baseCaseRecord: Case = {
  id: "case-1",
  session_id: "session-1",
  status: "intake",
  case_type: "security_deposit",
  case_type_confidence: null,
  plaintiff_narrative: "I paid a deposit.",
  defendant_narrative: "Tenant caused damage.",
  claimed_amount: 1500,
  damages_breakdown: null,
  archetype_id: "common_sense",
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  parties: [
    { id: "p-1", case_id: "case-1", role: "plaintiff", name: "Alice", address: null, phone: null },
    { id: "p-2", case_id: "case-1", role: "defendant", name: "Bob", address: null, phone: null },
  ],
  evidence: [
    {
      id: "e-1",
      case_id: "case-1",
      submitted_by: "plaintiff",
      evidence_type: "document",
      title: "Lease",
      description: null,
      has_file: false,
      score: null,
      score_explanation: null,
      created_at: new Date().toISOString(),
    },
  ],
  timeline_events: [
    {
      id: "t-1",
      case_id: "case-1",
      event_date: "2025-01-15T00:00:00Z",
      description: "Lease signed",
      source: "plaintiff",
      disputed: false,
      created_at: new Date().toISOString(),
    },
  ],
};

function defaultProps(
  overrides: Partial<Parameters<typeof ReviewStep>[0]> = {}
) {
  return {
    caseRecord: baseCaseRecord,
    plaintiffNarrative: "I paid a deposit.",
    defendantNarrative: "Tenant caused damage.",
    amountClaimed: 1500,
    judgeId: "common_sense" as const,
    plaintiffName: "Alice",
    defendantName: "Bob",
    allowEarlyJudgment: false,
    onAllowEarlyJudgmentChange: vi.fn(),
    hearingConcluded: false,
    hasExistingJudgment: false,
    isBackendMode: true,
    onBack: vi.fn(),
    onBeginHearing: vi.fn(),
    onSkipToJudgment: vi.fn(),
    ...overrides,
  };
}

afterEach(cleanup);

describe("ReviewStep", () => {
  it("renders header and case summary", () => {
    render(<ReviewStep {...defaultProps()} />);
    expect(screen.getByText(/review your case/i)).toBeInTheDocument();
    expect(screen.getByText("Alice")).toBeInTheDocument();
    expect(screen.getByText("Bob")).toBeInTheDocument();
    expect(screen.getByText("$1,500")).toBeInTheDocument();
  });

  it("shows party, evidence, and timeline counts in backend mode", () => {
    render(<ReviewStep {...defaultProps()} />);
    expect(screen.getByText("2")).toBeInTheDocument(); // parties
    expect(screen.getByText("1")).toBeInTheDocument(); // evidence
    expect(screen.getByText("1 events")).toBeInTheDocument(); // timeline
  });

  it("hides backend-only stats when not in backend mode", () => {
    render(<ReviewStep {...defaultProps({ isBackendMode: false })} />);
    expect(screen.queryByText("Parties")).not.toBeInTheDocument();
  });

  it("shows begin hearing button when hearing has not concluded", () => {
    render(<ReviewStep {...defaultProps()} />);
    expect(
      screen.getByRole("button", { name: /begin hearing/i })
    ).toBeInTheDocument();
  });

  it("hides begin hearing button when hearing is concluded", () => {
    render(<ReviewStep {...defaultProps({ hearingConcluded: true })} />);
    expect(
      screen.queryByRole("button", { name: /begin hearing/i })
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /get judgment/i })
    ).toBeInTheDocument();
  });

  it("shows skip-to-judgment when allowEarlyJudgment is checked", () => {
    render(<ReviewStep {...defaultProps({ allowEarlyJudgment: true })} />);
    expect(
      screen.getByRole("button", { name: /skip to judgment/i })
    ).toBeInTheDocument();
  });

  it("shows early judgment checkbox in backend mode before hearing concludes", () => {
    render(<ReviewStep {...defaultProps()} />);
    expect(
      screen.getByLabelText(/skip the hearing/i)
    ).toBeInTheDocument();
  });

  it("fires onAllowEarlyJudgmentChange when checkbox is toggled", () => {
    const onAllowEarlyJudgmentChange = vi.fn();
    render(<ReviewStep {...defaultProps({ onAllowEarlyJudgmentChange })} />);
    fireEvent.click(screen.getByLabelText(/skip the hearing/i));
    expect(onAllowEarlyJudgmentChange).toHaveBeenCalledWith(true);
  });

  it("shows hearing concluded banner", () => {
    render(<ReviewStep {...defaultProps({ hearingConcluded: true })} />);
    expect(screen.getByText(/hearing has been concluded/i)).toBeInTheDocument();
  });

  it("shows existing judgment notice", () => {
    render(<ReviewStep {...defaultProps({ hasExistingJudgment: true })} />);
    expect(
      screen.getByText(/judgment has already been generated/i)
    ).toBeInTheDocument();
  });

  it("calls onBack and onBeginHearing", () => {
    const onBack = vi.fn();
    const onBeginHearing = vi.fn();
    render(<ReviewStep {...defaultProps({ onBack, onBeginHearing })} />);

    fireEvent.click(screen.getByRole("button", { name: /^back$/i }));
    expect(onBack).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: /begin hearing/i }));
    expect(onBeginHearing).toHaveBeenCalledTimes(1);
  });

  it("calls onSkipToJudgment when hearing is concluded", () => {
    const onSkipToJudgment = vi.fn();
    render(
      <ReviewStep
        {...defaultProps({ hearingConcluded: true, onSkipToJudgment })}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /get judgment/i }));
    expect(onSkipToJudgment).toHaveBeenCalledTimes(1);
  });

  it("truncates long narratives in summary", () => {
    const longNarrative = "A".repeat(300);
    render(
      <ReviewStep {...defaultProps({ plaintiffNarrative: longNarrative })} />
    );
    expect(screen.getByText(/A{200}\.{3}/)).toBeInTheDocument();
  });
});
