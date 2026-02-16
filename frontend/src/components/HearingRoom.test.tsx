import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { HearingRoom } from "./HearingRoom";
import type { HearingMessage } from "@/lib/types";

// jsdom doesn't implement scrollIntoView
beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

function defaultProps(overrides: Partial<Parameters<typeof HearingRoom>[0]> = {}) {
  return {
    judgeId: "common_sense" as const,
    messages: [] as HearingMessage[],
    input: "",
    onInputChange: vi.fn(),
    role: "plaintiff" as const,
    onRoleChange: vi.fn(),
    concluded: false,
    isStarting: false,
    isSending: false,
    status: "Not started.",
    isConnected: false,
    hasHearingRecord: false,
    onBegin: vi.fn(),
    onSend: vi.fn(),
    onProceedToJudgment: vi.fn(),
    onBack: vi.fn(),
    plaintiffName: "Alice",
    defendantName: "Bob",
    ...overrides,
  };
}

function makeMessage(overrides: Partial<HearingMessage> = {}): HearingMessage {
  return {
    id: "msg-1",
    hearing_id: "h-1",
    role: "judge",
    content: "Opening statement from judge.",
    sequence: 1,
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

describe("HearingRoom", () => {
  afterEach(() => {
    cleanup();
  });

  // ── Pre-hearing state ─────────────────────────────────────────────

  it("shows pre-hearing state when no hearing has started", () => {
    render(<HearingRoom {...defaultProps()} />);

    expect(
      screen.getByText(/ready to begin the hearing/i)
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /start hearing/i })
    ).toBeInTheDocument();
  });

  it("shows 'Go back to case review' link", () => {
    render(<HearingRoom {...defaultProps()} />);
    expect(
      screen.getByRole("button", { name: /go back to case review/i })
    ).toBeInTheDocument();
  });

  it("calls onBegin when 'Start hearing' is clicked", () => {
    const onBegin = vi.fn();
    render(<HearingRoom {...defaultProps({ onBegin })} />);

    fireEvent.click(screen.getByRole("button", { name: /start hearing/i }));
    expect(onBegin).toHaveBeenCalledTimes(1);
  });

  it("disables start button and shows spinner while starting", () => {
    render(<HearingRoom {...defaultProps({ isStarting: true })} />);

    const btn = screen.getByRole("button", { name: /starting hearing/i });
    expect(btn).toBeDisabled();
  });

  // ── Judge info ────────────────────────────────────────────────────

  it("displays judge name and description", () => {
    render(<HearingRoom {...defaultProps({ judgeId: "strict" })} />);
    expect(screen.getByText("The Strict Judge")).toBeInTheDocument();
  });

  it("shows connection status indicator", () => {
    render(
      <HearingRoom {...defaultProps({ isConnected: true, hasHearingRecord: true })} />
    );
    expect(screen.getByText("Live connection")).toBeInTheDocument();
  });

  it("shows HTTP mode when not connected but has hearing record", () => {
    render(
      <HearingRoom
        {...defaultProps({ isConnected: false, hasHearingRecord: true })}
      />
    );
    expect(screen.getByText("HTTP mode")).toBeInTheDocument();
  });

  // ── Active hearing with messages ──────────────────────────────────

  it("renders messages from all parties", () => {
    const messages = [
      makeMessage({
        id: "1",
        role: "judge",
        content: "Tell me what happened.",
        sequence: 1,
      }),
      makeMessage({
        id: "2",
        role: "plaintiff",
        content: "I paid the deposit.",
        sequence: 2,
      }),
      makeMessage({
        id: "3",
        role: "defendant",
        content: "The apartment was damaged.",
        sequence: 3,
      }),
    ];

    render(
      <HearingRoom
        {...defaultProps({
          messages,
          hasHearingRecord: true,
        })}
      />
    );

    expect(screen.getByText("Tell me what happened.")).toBeInTheDocument();
    expect(screen.getByText("I paid the deposit.")).toBeInTheDocument();
    expect(screen.getByText("The apartment was damaged.")).toBeInTheDocument();
  });

  it("uses party names in message headers", () => {
    const messages = [
      makeMessage({
        id: "1",
        role: "plaintiff",
        content: "My statement.",
        sequence: 1,
      }),
    ];

    render(
      <HearingRoom
        {...defaultProps({
          messages,
          hasHearingRecord: true,
          plaintiffName: "Alice",
        })}
      />
    );

    expect(screen.getByText("Alice")).toBeInTheDocument();
  });

  // ── Input & sending ───────────────────────────────────────────────

  it("calls onInputChange when typing", () => {
    const onInputChange = vi.fn();
    const messages = [makeMessage()];

    render(
      <HearingRoom
        {...defaultProps({ onInputChange, messages, hasHearingRecord: true })}
      />
    );

    const input = screen.getByPlaceholderText(/respond to the judge/i);
    fireEvent.change(input, { target: { value: "My response" } });
    expect(onInputChange).toHaveBeenCalledWith("My response");
  });

  it("calls onSend when Send button is clicked", () => {
    const onSend = vi.fn();
    const messages = [makeMessage()];

    render(
      <HearingRoom
        {...defaultProps({
          onSend,
          input: "Some response",
          messages,
          hasHearingRecord: true,
        })}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /^send$/i }));
    expect(onSend).toHaveBeenCalledTimes(1);
  });

  it("disables Send button when input is empty", () => {
    const messages = [makeMessage()];

    render(
      <HearingRoom
        {...defaultProps({
          input: "",
          messages,
          hasHearingRecord: true,
        })}
      />
    );

    expect(screen.getByRole("button", { name: /^send$/i })).toBeDisabled();
  });

  it("disables Send button while sending", () => {
    const messages = [makeMessage()];

    render(
      <HearingRoom
        {...defaultProps({
          input: "Some text",
          isSending: true,
          messages,
          hasHearingRecord: true,
        })}
      />
    );

    expect(screen.getByRole("button", { name: "..." })).toBeDisabled();
  });

  it("shows thinking indicator when judge is responding", () => {
    const messages = [makeMessage()];

    render(
      <HearingRoom
        {...defaultProps({
          isSending: true,
          messages,
          hasHearingRecord: true,
        })}
      />
    );

    // The thinking animation should be present (bounce dots)
    const { container } = render(
      <HearingRoom
        {...defaultProps({
          isSending: true,
          messages,
          hasHearingRecord: true,
        })}
      />
    );
    const dots = container.querySelectorAll(".animate-bounce");
    expect(dots.length).toBeGreaterThanOrEqual(3);
  });

  // ── Role selection ────────────────────────────────────────────────

  it("shows role selector with party names", () => {
    const messages = [makeMessage()];

    render(
      <HearingRoom
        {...defaultProps({
          messages,
          hasHearingRecord: true,
          plaintiffName: "Alice",
          defendantName: "Bob",
        })}
      />
    );

    const select = screen.getByRole("combobox");
    expect(select).toBeInTheDocument();
    expect(screen.getByText(/as alice/i)).toBeInTheDocument();
    expect(screen.getByText(/as bob/i)).toBeInTheDocument();
  });

  // ── Concluded state ───────────────────────────────────────────────

  it("shows concluded banner when hearing is over", () => {
    const messages = [makeMessage()];

    render(
      <HearingRoom
        {...defaultProps({
          messages,
          hasHearingRecord: true,
          concluded: true,
        })}
      />
    );

    expect(
      screen.getByText(/the hearing has concluded/i)
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /get my judgment/i })
    ).toBeInTheDocument();
  });

  it("hides input area when hearing concluded", () => {
    const messages = [makeMessage()];

    render(
      <HearingRoom
        {...defaultProps({
          messages,
          hasHearingRecord: true,
          concluded: true,
        })}
      />
    );

    expect(
      screen.queryByPlaceholderText(/respond to the judge/i)
    ).not.toBeInTheDocument();
  });

  it("calls onProceedToJudgment when 'Get my judgment' is clicked", () => {
    const onProceedToJudgment = vi.fn();
    const messages = [makeMessage()];

    render(
      <HearingRoom
        {...defaultProps({
          messages,
          hasHearingRecord: true,
          concluded: true,
          onProceedToJudgment,
        })}
      />
    );

    fireEvent.click(
      screen.getByRole("button", { name: /get my judgment/i })
    );
    expect(onProceedToJudgment).toHaveBeenCalledTimes(1);
  });

  it("calls onBack when 'Back to case review' is clicked", () => {
    const onBack = vi.fn();
    const messages = [makeMessage()];

    render(
      <HearingRoom
        {...defaultProps({
          messages,
          hasHearingRecord: true,
          onBack,
        })}
      />
    );

    fireEvent.click(
      screen.getByRole("button", { name: /back to case review/i })
    );
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
