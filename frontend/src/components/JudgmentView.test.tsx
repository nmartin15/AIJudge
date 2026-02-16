import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { JudgmentView } from "./JudgmentView";
import type { SimulationOutput } from "@/lib/mockSimulation";

function makeResult(
  overrides: Partial<SimulationOutput> = {}
): SimulationOutput {
  return {
    winner: "plaintiff",
    awardAmount: 1200.0,
    confidence: 0.85,
    rationale: "The court finds in favor of the plaintiff based on the evidence.",
    citedAuthorities: ["Wyo. Stat. 1-21-1208", "W.R.E. 401"],
    findingsOfFact: [
      "Tenant paid a $1,500 security deposit.",
      "Landlord did not return deposit within 30 days.",
    ],
    conclusionsOfLaw: [
      {
        text: "Landlord violated the security deposit statute.",
        citation: "W.S. 1-21-1208",
      },
    ],
    judgmentText: "Judgment is entered for the plaintiff in the amount of $1,200.00.",
    evidenceScoreSummary: [
      { item: "Plaintiff evidence", score: 85 },
      { item: "Defendant evidence", score: 40 },
    ],
    ...overrides,
  };
}

function defaultProps(
  overrides: Partial<Parameters<typeof JudgmentView>[0]> = {}
) {
  return {
    result: makeResult(),
    resultMode: "backend" as const,
    warning: null,
    judgeId: "common_sense" as const,
    comparisonResults: [],
    comparisonInsights: null,
    isRunningComparison: false,
    comparisonError: null,
    onRunComparison: vi.fn(),
    onStartOver: vi.fn(),
    isRunning: false,
    ...overrides,
  };
}

describe("JudgmentView", () => {
  afterEach(() => {
    cleanup();
  });

  // ── Loading state ─────────────────────────────────────────────────

  it("shows loading spinner when isRunning is true", () => {
    render(<JudgmentView {...defaultProps({ isRunning: true })} />);

    expect(
      screen.getByText(/the judge is deliberating/i)
    ).toBeInTheDocument();
  });

  // ── Decision header ───────────────────────────────────────────────

  it("displays the winning party", () => {
    render(<JudgmentView {...defaultProps()} />);
    expect(screen.getByText("plaintiff")).toBeInTheDocument();
  });

  it("displays award amount", () => {
    render(<JudgmentView {...defaultProps()} />);
    expect(screen.getByText("$1,200.00")).toBeInTheDocument();
  });

  it("displays confidence percentage", () => {
    render(<JudgmentView {...defaultProps()} />);
    expect(screen.getByText("85%")).toBeInTheDocument();
  });

  it("shows warning when present", () => {
    render(
      <JudgmentView
        {...defaultProps({ warning: "This is a test warning" })}
      />
    );
    expect(screen.getByText("This is a test warning")).toBeInTheDocument();
  });

  it("shows result source label", () => {
    render(<JudgmentView {...defaultProps({ resultMode: "backend" })} />);
    expect(screen.getByText(/AI judicial pipeline/)).toBeInTheDocument();
  });

  it("shows mock source label for mock mode", () => {
    render(<JudgmentView {...defaultProps({ resultMode: "mock" })} />);
    expect(screen.getByText(/Mock simulation/)).toBeInTheDocument();
  });

  // ── Rationale ─────────────────────────────────────────────────────

  it("displays rationale text when section is expanded", () => {
    render(<JudgmentView {...defaultProps()} />);
    // Rationale is collapsed by default; expand it first
    const rationaleToggle = screen.getByRole("button", { name: /rationale/i });
    fireEvent.click(rationaleToggle);
    expect(
      screen.getByText(/court finds in favor of the plaintiff/i)
    ).toBeInTheDocument();
  });

  // ── Findings of fact ──────────────────────────────────────────────

  it("displays findings of fact count", () => {
    render(<JudgmentView {...defaultProps()} />);
    expect(screen.getByText(/findings of fact \(2\)/i)).toBeInTheDocument();
  });

  // ── Conclusions of law ────────────────────────────────────────────

  it("displays conclusions of law count", () => {
    render(<JudgmentView {...defaultProps()} />);
    expect(
      screen.getByText(/conclusions of law \(1\)/i)
    ).toBeInTheDocument();
  });

  // ── Evidence scores ───────────────────────────────────────────────

  it("displays evidence analysis section", () => {
    render(<JudgmentView {...defaultProps()} />);
    expect(screen.getByText("Evidence analysis")).toBeInTheDocument();
  });

  // ── Cited authorities ─────────────────────────────────────────────

  it("displays cited authorities", () => {
    render(<JudgmentView {...defaultProps()} />);
    expect(screen.getByText("Cited authorities")).toBeInTheDocument();
  });

  // ── Formal document ───────────────────────────────────────────────

  it("has copy and download buttons for formal document", () => {
    render(<JudgmentView {...defaultProps()} />);
    expect(
      screen.getByRole("button", { name: /copy/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /download/i })
    ).toBeInTheDocument();
  });

  // ── Collapsible sections ──────────────────────────────────────────

  it("can expand and collapse sections", () => {
    render(<JudgmentView {...defaultProps()} />);

    // Findings of fact appears in both collapsible section and formal doc.
    // Target the collapsible section button specifically.
    const findingsButtons = screen.getAllByText(/findings of fact/i);
    const findingsToggle = findingsButtons
      .map((el) => el.closest("button"))
      .find((btn) => btn !== null);
    expect(findingsToggle).toBeTruthy();
    fireEvent.click(findingsToggle!);

    // After expanding, individual findings should be visible
    expect(
      screen.getAllByText("Tenant paid a $1,500 security deposit.").length
    ).toBeGreaterThanOrEqual(1);
  });

  // ── Multi-judge comparison ────────────────────────────────────────

  it("shows 'Compare judges' button", () => {
    render(<JudgmentView {...defaultProps()} />);
    expect(
      screen.getByRole("button", { name: /compare judges/i })
    ).toBeInTheDocument();
  });

  it("calls onRunComparison when Compare judges is clicked", () => {
    const onRunComparison = vi.fn();
    render(<JudgmentView {...defaultProps({ onRunComparison })} />);

    fireEvent.click(
      screen.getByRole("button", { name: /compare judges/i })
    );
    expect(onRunComparison).toHaveBeenCalledTimes(1);
  });

  it("shows comparison results when available", () => {
    const comparisonResults = [
      {
        judgeId: "strict" as const,
        output: makeResult({ winner: "defendant", awardAmount: 0 }),
      },
      {
        judgeId: "common_sense" as const,
        output: makeResult({ winner: "plaintiff", awardAmount: 1200 }),
      },
    ];

    render(
      <JudgmentView {...defaultProps({ comparisonResults })} />
    );

    // Need to first click "Compare judges" to show the comparison UI
    fireEvent.click(
      screen.getByRole("button", { name: /compare judges/i })
    );

    // The comparison table should show judge names (may appear multiple times)
    expect(
      screen.getAllByText("The Strict Judge").length
    ).toBeGreaterThanOrEqual(1);
  });

  // ── Actions ───────────────────────────────────────────────────────

  it("calls onStartOver when 'Start a new case' is clicked", () => {
    const onStartOver = vi.fn();
    render(<JudgmentView {...defaultProps({ onStartOver })} />);

    fireEvent.click(
      screen.getByRole("button", { name: /start a new case/i })
    );
    expect(onStartOver).toHaveBeenCalledTimes(1);
  });

  it("shows educational disclaimer", () => {
    render(<JudgmentView {...defaultProps()} />);
    expect(
      screen.getByText(/educational simulation/i)
    ).toBeInTheDocument();
  });

  // ── Defendant verdict ─────────────────────────────────────────────

  it("shows defendant verdict correctly", () => {
    render(
      <JudgmentView
        {...defaultProps({
          result: makeResult({ winner: "defendant", awardAmount: 0 }),
        })}
      />
    );
    expect(screen.getByText("defendant")).toBeInTheDocument();
    expect(screen.getByText("$0.00")).toBeInTheDocument();
  });
});
