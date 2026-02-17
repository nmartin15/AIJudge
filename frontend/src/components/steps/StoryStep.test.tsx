import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StoryStep } from "./StoryStep";
import { mockCaseTemplates } from "@/lib/mockSimulation";

const firstRealTemplate = mockCaseTemplates.find((t) => t.id !== "blank") ?? mockCaseTemplates[0];

function defaultProps(
  overrides: Partial<Parameters<typeof StoryStep>[0]> = {}
) {
  return {
    templates: mockCaseTemplates,
    selectedTemplateId: firstRealTemplate.id,
    onLoadTemplate: vi.fn(),
    plaintiffNarrative: firstRealTemplate.plaintiffNarrative,
    onPlaintiffNarrativeChange: vi.fn(),
    defendantNarrative: firstRealTemplate.defendantNarrative,
    onDefendantNarrativeChange: vi.fn(),
    amountClaimed: firstRealTemplate.amountClaimed,
    onAmountChange: vi.fn(),
    judgeId: "common_sense" as const,
    onJudgeChange: vi.fn(),
    isSaving: false,
    error: null,
    onContinue: vi.fn(),
    ...overrides,
  };
}

describe("StoryStep", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders the header text", () => {
    render(<StoryStep {...defaultProps()} />);
    expect(
      screen.getByText(/tell us what happened/i)
    ).toBeInTheDocument();
  });

  it("renders the searchable template combobox", () => {
    render(<StoryStep {...defaultProps()} />);
    expect(screen.getByRole("combobox")).toBeInTheDocument();
    expect(screen.getByText(firstRealTemplate.title)).toBeInTheDocument();
  });

  it("shows template list when combobox is focused", () => {
    render(<StoryStep {...defaultProps()} />);
    const combobox = screen.getByRole("combobox");
    fireEvent.focus(combobox);
    expect(screen.getByRole("listbox")).toBeInTheDocument();
    expect(screen.getByText("Start from scratch")).toBeInTheDocument();
  });

  it("calls onLoadTemplate when a template option is clicked", () => {
    const onLoadTemplate = vi.fn();
    render(<StoryStep {...defaultProps({ onLoadTemplate })} />);

    const combobox = screen.getByRole("combobox");
    fireEvent.focus(combobox);

    const secondRealTemplate = mockCaseTemplates.find((t) => t.id !== "blank" && t.id !== firstRealTemplate.id)!;
    fireEvent.click(screen.getByText(secondRealTemplate.title));
    expect(onLoadTemplate).toHaveBeenCalledWith(secondRealTemplate.id);
  });

  it("shows plaintiff and defendant narrative fields", () => {
    render(<StoryStep {...defaultProps()} />);
    expect(
      screen.getByPlaceholderText(/in my own words/i)
    ).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText(/they would probably say/i)
    ).toBeInTheDocument();
  });

  it("fires onPlaintiffNarrativeChange when typing", () => {
    const onPlaintiffNarrativeChange = vi.fn();
    render(
      <StoryStep {...defaultProps({ onPlaintiffNarrativeChange })} />
    );

    const textarea = screen.getByPlaceholderText(/in my own words/i);
    fireEvent.change(textarea, { target: { value: "New narrative" } });
    expect(onPlaintiffNarrativeChange).toHaveBeenCalledWith("New narrative");
  });

  it("fires onDefendantNarrativeChange when typing", () => {
    const onDefendantNarrativeChange = vi.fn();
    render(
      <StoryStep {...defaultProps({ onDefendantNarrativeChange })} />
    );

    const textarea = screen.getByPlaceholderText(/they would probably say/i);
    fireEvent.change(textarea, { target: { value: "Defense story" } });
    expect(onDefendantNarrativeChange).toHaveBeenCalledWith("Defense story");
  });

  it("shows narrative strength indicators", () => {
    render(
      <StoryStep
        {...defaultProps({
          plaintiffNarrative:
            "This is a long enough narrative that should register as solid quality writing for the strength indicator. I am making it much longer now to be sure it exceeds 120 characters and gets rated as Solid by the system.",
          defendantNarrative: "Short",
        })}
      />
    );
    expect(screen.getByText("Solid")).toBeInTheDocument();
    expect(screen.getByText("Too short")).toBeInTheDocument();
  });

  it("shows character count for narratives", () => {
    render(
      <StoryStep
        {...defaultProps({
          plaintiffNarrative: "Hello world",
          defendantNarrative: "Response text",
        })}
      />
    );
    expect(screen.getByText("11 characters")).toBeInTheDocument();
    expect(screen.getByText("13 characters")).toBeInTheDocument();
  });

  it("renders the claimed amount input", () => {
    render(<StoryStep {...defaultProps({ amountClaimed: 1500 })} />);
    const input = screen.getByRole("spinbutton");
    expect(input).toBeInTheDocument();
  });

  it("shows over-limit warning when amount > $6,000", () => {
    render(<StoryStep {...defaultProps({ amountClaimed: 7000 })} />);
    expect(
      screen.getByText(/exceeds wyoming/i)
    ).toBeInTheDocument();
  });

  it("does not show over-limit warning when amount <= $6,000", () => {
    render(<StoryStep {...defaultProps({ amountClaimed: 5000 })} />);
    expect(
      screen.queryByText(/exceeds wyoming/i)
    ).not.toBeInTheDocument();
  });

  it("renders all four judge options", () => {
    render(<StoryStep {...defaultProps()} />);
    expect(screen.getByText("The Strict Judge")).toBeInTheDocument();
    expect(screen.getByText("The Common-Sense Judge")).toBeInTheDocument();
    expect(screen.getByText("The Evidence-Heavy Judge")).toBeInTheDocument();
    expect(screen.getByText("The Practical Judge")).toBeInTheDocument();
  });

  it("calls onJudgeChange when a judge is selected", () => {
    const onJudgeChange = vi.fn();
    render(<StoryStep {...defaultProps({ onJudgeChange })} />);

    fireEvent.click(screen.getByText("The Strict Judge"));
    expect(onJudgeChange).toHaveBeenCalledWith("strict");
  });

  it("shows error message when error prop is set", () => {
    render(
      <StoryStep
        {...defaultProps({ error: "Both narratives are required." })}
      />
    );
    expect(
      screen.getByText("Both narratives are required.")
    ).toBeInTheDocument();
  });

  it("calls onContinue when Continue button is clicked", () => {
    const onContinue = vi.fn();
    render(<StoryStep {...defaultProps({ onContinue })} />);

    fireEvent.click(screen.getByRole("button", { name: /continue/i }));
    expect(onContinue).toHaveBeenCalledTimes(1);
  });

  it("disables Continue button and shows spinner when saving", () => {
    render(<StoryStep {...defaultProps({ isSaving: true })} />);
    const btn = screen.getByRole("button", { name: /saving/i });
    expect(btn).toBeDisabled();
  });
});
