import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockApi = vi.hoisted(() => {
  class ApiClientError extends Error {
    code: "http" | "timeout" | "network";
    status?: number;
    details?: string;
    backendCode?: string;

    constructor(
      message: string,
      options: {
        code: "http" | "timeout" | "network";
        status?: number;
        details?: string;
        backendCode?: string;
      }
    ) {
      super(message);
      this.code = options.code;
      this.status = options.status;
      this.details = options.details;
      this.backendCode = options.backendCode;
    }
  }

  return {
    API_BASE_URL: "http://localhost:8000",
    ApiClientError,
    addEvidence: vi.fn(),
    addParty: vi.fn(),
    addTimelineEvent: vi.fn(),
    createCase: vi.fn(),
    generateJudgment: vi.fn(),
    getCase: vi.fn(),
    getCorpusStats: vi.fn(),
    getHearing: vi.fn(),
    getJudgment: vi.fn(),
    getJudgmentMetadata: vi.fn(),
    getOrCreateSession: vi.fn(),
    getSessionAuth: vi.fn(),
    ingestCorpus: vi.fn(),
    postHearingMessage: vi.fn(),
    runComparison: vi.fn(),
    searchCorpus: vi.fn(),
    startHearing: vi.fn(),
    updateCase: vi.fn(),
    claimAdminRole: vi.fn(),
  };
});

const mockSimulationService = vi.hoisted(() => ({
  SIMULATION_MODE: "backend" as const,
  checkBackendCapabilities: vi.fn(),
  executeSimulation: vi.fn(),
  mapJudgmentToSimulationOutput: vi.fn(),
}));

vi.mock("@/lib/api", () => mockApi);
vi.mock("@/lib/simulationService", () => mockSimulationService);

import Home from "@/app/page";

type MockCase = {
  id: string;
  session_id: string;
  status: string;
  case_type: string | null;
  case_type_confidence: number | null;
  plaintiff_narrative: string | null;
  defendant_narrative: string | null;
  claimed_amount: number | null;
  damages_breakdown: Record<string, number> | null;
  archetype_id: string | null;
  created_at: string;
  updated_at: string;
  parties: Array<Record<string, string | null>>;
  evidence: Array<Record<string, string | number | boolean | null>>;
  timeline_events: Array<Record<string, string | boolean | null>>;
};

class FailingWebSocket {
  static readonly OPEN = 1;
  static readonly CLOSED = 3;
  readyState = FailingWebSocket.CLOSED;
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  constructor() {
    queueMicrotask(() => {
      this.onerror?.();
      this.onclose?.();
    });
  }
  send(): void {}
  close(): void {
    this.readyState = FailingWebSocket.CLOSED;
    this.onclose?.();
  }
}

describe("Error path integration tests", () => {
  let caseCounter = 0;
  const sessionId = "session-err";
  const cases = new Map<string, MockCase>();

  function nowIso(): string {
    return new Date().toISOString();
  }

  /**
   * Navigate through the wizard from step 0 to the given step number.
   * Each step's validation requirements are satisfied before advancing.
   */
  async function navigateToStep(target: number): Promise<void> {
    // Step 0 → 1: Click Continue (fires background createCase)
    if (target >= 1) {
      fireEvent.click(screen.getByRole("button", { name: /^continue$/i }));
      await waitFor(() => expect(mockApi.createCase).toHaveBeenCalledTimes(1));
    }

    // Step 1 → 2: Save both parties, then Continue
    if (target >= 2) {
      fireEvent.click(
        screen.getByRole("button", { name: /save plaintiff/i })
      );
      await waitFor(() => expect(mockApi.addParty).toHaveBeenCalledTimes(1));
      // Wait for isSaving to clear so the defendant button text reappears
      await waitFor(() =>
        expect(
          screen.getByRole("button", { name: /save defendant/i })
        ).toBeInTheDocument()
      );

      fireEvent.click(
        screen.getByRole("button", { name: /save defendant/i })
      );
      await waitFor(() => expect(mockApi.addParty).toHaveBeenCalledTimes(2));

      fireEvent.click(screen.getByRole("button", { name: /^continue$/i }));
    }

    // Step 2 → 3: Add evidence, then Continue
    if (target >= 3) {
      await waitFor(() =>
        expect(
          screen.getByText(/what evidence do you have/i)
        ).toBeInTheDocument()
      );
      fireEvent.change(
        screen.getByPlaceholderText(/signed lease agreement/i),
        { target: { value: "Test evidence" } }
      );
      fireEvent.click(
        screen.getByRole("button", { name: /add evidence/i })
      );
      await waitFor(() =>
        expect(mockApi.addEvidence).toHaveBeenCalledTimes(1)
      );
      fireEvent.click(screen.getByRole("button", { name: /^continue$/i }));
    }

    // Step 3 → 4: Add timeline event, then Continue
    if (target >= 4) {
      await waitFor(() =>
        expect(
          screen.getByText(/what happened, and when/i)
        ).toBeInTheDocument()
      );
      const dateInput = document.querySelector(
        'input[type="datetime-local"]'
      ) as HTMLInputElement;
      fireEvent.change(dateInput, { target: { value: "2025-01-15T10:00" } });
      fireEvent.change(screen.getByPlaceholderText(/describe the event/i), {
        target: { value: "Test event" },
      });
      fireEvent.click(screen.getByRole("button", { name: /add event/i }));
      await waitFor(() =>
        expect(mockApi.addTimelineEvent).toHaveBeenCalledTimes(1)
      );
      fireEvent.click(screen.getByRole("button", { name: /^continue$/i }));
      await waitFor(() =>
        expect(screen.getByText(/review your case/i)).toBeInTheDocument()
      );
    }
  }

  beforeEach(() => {
    vi.clearAllMocks();
    caseCounter = 0;
    cases.clear();
    vi.stubGlobal("WebSocket", FailingWebSocket);
    Element.prototype.scrollIntoView = vi.fn();
    sessionStorage.clear();

    mockSimulationService.checkBackendCapabilities.mockResolvedValue({
      status: "ready",
      detail: "Backend ready.",
    });
    mockSimulationService.executeSimulation.mockResolvedValue({
      output: {},
      modeUsed: "mock",
    });
    mockSimulationService.mapJudgmentToSimulationOutput.mockReturnValue({
      winner: "plaintiff",
      awardAmount: 0,
      confidence: 0.8,
      rationale: "Mapped",
      citedAuthorities: [],
      findingsOfFact: [],
      conclusionsOfLaw: [],
      judgmentText: "",
      evidenceScoreSummary: [],
      reasoningChain: {},
    });

    mockApi.getOrCreateSession.mockResolvedValue(sessionId);
    mockApi.getSessionAuth.mockRejectedValue(new Error("Not mocked"));
    mockApi.getJudgment.mockResolvedValue(null);
    mockApi.getJudgmentMetadata.mockResolvedValue({
      total_cost_usd: 0,
      total_latency_ms: 0,
      total_input_tokens: 0,
      total_output_tokens: 0,
      calls: [],
    });
    mockApi.getCorpusStats.mockResolvedValue({
      total_chunks: 0,
      by_source_type: {},
    });
    mockApi.searchCorpus.mockResolvedValue([]);
    mockApi.ingestCorpus.mockResolvedValue({ status: "ok", chunks_ingested: 0 });

    mockApi.createCase.mockImplementation(
      async (_sid: string, payload: Record<string, unknown>) => {
        caseCounter += 1;
        const id = `case-${caseCounter}`;
        const ts = nowIso();
        const record: MockCase = {
          id,
          session_id: sessionId,
          status: "intake",
          case_type: (payload.case_type as string) ?? null,
          case_type_confidence: null,
          plaintiff_narrative: (payload.plaintiff_narrative as string) ?? null,
          defendant_narrative: (payload.defendant_narrative as string) ?? null,
          claimed_amount: (payload.claimed_amount as number) ?? null,
          damages_breakdown: null,
          archetype_id: null,
          created_at: ts,
          updated_at: ts,
          parties: [],
          evidence: [],
          timeline_events: [],
        };
        cases.set(id, record);
        return record;
      }
    );
    mockApi.updateCase.mockImplementation(
      async (caseId: string, payload: Record<string, unknown>) => {
        const current = cases.get(caseId);
        if (!current) throw new Error("Case not found");
        Object.assign(current, payload, { updated_at: nowIso() });
        return current;
      }
    );
    mockApi.getCase.mockImplementation(async (caseId: string) => {
      const current = cases.get(caseId);
      if (!current) throw new Error("Case not found");
      return current;
    });
    mockApi.addParty.mockImplementation(
      async (caseId: string, payload: Record<string, string>) => {
        const current = cases.get(caseId);
        if (!current) throw new Error("Case not found");
        current.parties.push({
          id: `party-${current.parties.length + 1}`,
          case_id: caseId,
          role: payload.role ?? "plaintiff",
          name: payload.name ?? "",
          address: null,
          phone: null,
        });
        current.updated_at = nowIso();
        return current.parties.at(-1);
      }
    );
    mockApi.addEvidence.mockImplementation(async (caseId: string) => {
      const current = cases.get(caseId);
      if (!current) throw new Error("Case not found");
      current.evidence.push({
        id: `ev-${current.evidence.length + 1}`,
        case_id: caseId,
        submitted_by: "plaintiff",
        evidence_type: "document",
        title: "Evidence",
        description: null,
        has_file: false,
        score: null,
        score_explanation: null,
        created_at: nowIso(),
      });
      current.updated_at = nowIso();
      return current.evidence.at(-1);
    });
    mockApi.addTimelineEvent.mockImplementation(async (caseId: string) => {
      const current = cases.get(caseId);
      if (!current) throw new Error("Case not found");
      current.timeline_events.push({
        id: `tl-${current.timeline_events.length + 1}`,
        case_id: caseId,
        event_date: nowIso(),
        description: "Event",
        source: "plaintiff",
        disputed: false,
        created_at: nowIso(),
      });
      current.updated_at = nowIso();
      return current.timeline_events.at(-1);
    });
    mockApi.getHearing.mockRejectedValue(
      new mockApi.ApiClientError("not found", { code: "http", status: 404 })
    );
  });

  afterEach(cleanup);

  it("shows error toast when case creation fails on continue", async () => {
    mockApi.createCase.mockRejectedValue(
      new mockApi.ApiClientError("Database unavailable", {
        code: "http",
        status: 500,
        backendCode: "internal_error",
      })
    );

    render(<Home />);
    fireEvent.click(screen.getByRole("button", { name: /^continue$/i }));

    await waitFor(() => expect(mockApi.createCase).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(screen.getByText(/database unavailable/i)).toBeInTheDocument()
    );
  });

  it("shows error when addParty fails", async () => {
    render(<Home />);
    await navigateToStep(1);

    mockApi.addParty.mockRejectedValue(
      new mockApi.ApiClientError("Validation failed", {
        code: "http",
        status: 422,
        backendCode: "validation_error",
      })
    );

    fireEvent.click(
      screen.getByRole("button", { name: /save plaintiff/i })
    );

    await waitFor(() =>
      expect(screen.getByText(/validation failed/i)).toBeInTheDocument()
    );
  });

  it("shows error when addEvidence fails", async () => {
    render(<Home />);
    await navigateToStep(2);

    await waitFor(() =>
      expect(
        screen.getByText(/what evidence do you have/i)
      ).toBeInTheDocument()
    );

    mockApi.addEvidence.mockRejectedValue(
      new mockApi.ApiClientError("File too large", {
        code: "http",
        status: 413,
        backendCode: "payload_too_large",
      })
    );

    fireEvent.change(screen.getByPlaceholderText(/signed lease agreement/i), {
      target: { value: "Large file" },
    });
    fireEvent.click(screen.getByRole("button", { name: /add evidence/i }));

    await waitFor(() =>
      expect(screen.getByText(/file too large/i)).toBeInTheDocument()
    );
  });

  it("shows error when addTimelineEvent fails", async () => {
    render(<Home />);
    await navigateToStep(3);

    await waitFor(() =>
      expect(
        screen.getByText(/what happened, and when/i)
      ).toBeInTheDocument()
    );

    mockApi.addTimelineEvent.mockRejectedValue(
      new mockApi.ApiClientError("Rate limit exceeded", {
        code: "http",
        status: 429,
        backendCode: "rate_limited",
      })
    );

    const dateInput = document.querySelector(
      'input[type="datetime-local"]'
    ) as HTMLInputElement;
    fireEvent.change(dateInput, { target: { value: "2025-01-15T10:00" } });
    fireEvent.change(screen.getByPlaceholderText(/describe the event/i), {
      target: { value: "Lease ended" },
    });
    fireEvent.click(screen.getByRole("button", { name: /add event/i }));

    await waitFor(() =>
      expect(screen.getByText(/rate limit exceeded/i)).toBeInTheDocument()
    );
  });

  it("shows error when hearing start fails", async () => {
    render(<Home />);
    await navigateToStep(4);

    mockApi.startHearing.mockRejectedValue(
      new mockApi.ApiClientError("Service overloaded", {
        code: "http",
        status: 503,
      })
    );

    fireEvent.click(
      screen.getByRole("button", { name: /begin hearing/i })
    );

    await waitFor(() => expect(mockApi.startHearing).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(
        screen.getByText(/failed to start hearing/i)
      ).toBeInTheDocument()
    );
  });

  it("handles network timeout errors gracefully", async () => {
    mockApi.createCase.mockRejectedValue(
      new mockApi.ApiClientError("Request timed out after 30s", {
        code: "timeout",
      })
    );

    render(<Home />);
    fireEvent.click(screen.getByRole("button", { name: /^continue$/i }));

    await waitFor(() =>
      expect(screen.getByText(/request timed out/i)).toBeInTheDocument()
    );
  });
});
