import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type MockCase = {
  id: string;
  session_id: string;
  status: "intake" | "ready" | "hearing" | "decided";
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
  evidence: Array<Record<string, string | number | null>>;
  timeline_events: Array<Record<string, string | boolean | null>>;
};

type MockHearing = {
  id: string;
  case_id: string;
  archetype_id: string;
  started_at: string;
  completed_at: string | null;
  messages: Array<{
    id: string;
    hearing_id: string;
    role: string;
    content: string;
    sequence: number;
    created_at: string;
  }>;
};

const mockApi = vi.hoisted(() => {
  class ApiClientError extends Error {
    code: "http" | "timeout" | "network";
    status?: number;
    details?: string;

    constructor(
      message: string,
      options: {
        code: "http" | "timeout" | "network";
        status?: number;
        details?: string;
      }
    ) {
      super(message);
      this.code = options.code;
      this.status = options.status;
      this.details = options.details;
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

class FailingWebSocket {
  static readonly OPEN = 1;
  static readonly CLOSED = 3;
  readyState = FailingWebSocket.CLOSED;
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;

  constructor(url: string) {
    void url;
    queueMicrotask(() => {
      this.onerror?.();
      this.onclose?.();
    });
  }

  send(data: string): void {
    void data;
  }

  close(): void {
    this.readyState = FailingWebSocket.CLOSED;
    this.onclose?.();
  }
}

describe("Home page integration flows", () => {
  let caseCounter = 0;
  let hearingCounter = 0;
  let messageCounter = 0;
  const sessionId = "session-1";
  const cases = new Map<string, MockCase>();
  const hearings = new Map<string, MockHearing>();

  function nowIso(): string {
    return new Date().toISOString();
  }

  function buildCase(caseId: string, payload: Record<string, unknown>): MockCase {
    const ts = nowIso();
    return {
      id: caseId,
      session_id: sessionId,
      status: "intake",
      case_type: (payload.case_type as string | undefined) ?? null,
      case_type_confidence: null,
      plaintiff_narrative: (payload.plaintiff_narrative as string | undefined) ?? null,
      defendant_narrative: (payload.defendant_narrative as string | undefined) ?? null,
      claimed_amount: (payload.claimed_amount as number | undefined) ?? null,
      damages_breakdown: null,
      archetype_id: null,
      created_at: ts,
      updated_at: ts,
      parties: [],
      evidence: [],
      timeline_events: [],
    };
  }

  /**
   * Navigates the multi-step wizard through all intake steps,
   * then enters the hearing phase and starts the hearing.
   */
  async function navigateToHearing(): Promise<void> {
    // Step 0 → 1: Click "Continue" (non-blocking save fires in background)
    fireEvent.click(screen.getByRole("button", { name: /^continue$/i }));
    await waitFor(() => expect(mockApi.createCase).toHaveBeenCalledTimes(1));

    // Step 1: Save both parties, then continue
    const savePlaintiffBtn = screen.getByRole("button", {
      name: /save plaintiff/i,
    });
    fireEvent.click(savePlaintiffBtn);
    await waitFor(() =>
      expect(mockApi.addParty).toHaveBeenCalledTimes(1)
    );

    // Wait for isSaving to clear so the defendant button text reappears
    const saveDefendantBtn = await waitFor(() =>
      screen.getByRole("button", { name: /save defendant/i })
    );
    fireEvent.click(saveDefendantBtn);
    await waitFor(() =>
      expect(mockApi.addParty).toHaveBeenCalledTimes(2)
    );

    fireEvent.click(screen.getByRole("button", { name: /^continue$/i }));

    // Step 2: Add evidence, then continue
    await waitFor(() =>
      expect(screen.getByText(/what evidence do you have/i)).toBeInTheDocument()
    );
    const titleInput = screen.getByPlaceholderText(/signed lease agreement/i);
    fireEvent.change(titleInput, { target: { value: "Test evidence" } });
    fireEvent.click(
      screen.getByRole("button", { name: /add evidence/i })
    );
    await waitFor(() =>
      expect(mockApi.addEvidence).toHaveBeenCalledTimes(1)
    );
    fireEvent.click(screen.getByRole("button", { name: /^continue$/i }));

    // Step 3: Add timeline event, then continue
    await waitFor(() =>
      expect(screen.getByText(/what happened, and when/i)).toBeInTheDocument()
    );
    const dateInput = document.querySelector('input[type="datetime-local"]') as HTMLInputElement;
    fireEvent.change(dateInput, { target: { value: "2025-01-15T10:00" } });
    const descInput = screen.getByPlaceholderText(/describe the event/i);
    fireEvent.change(descInput, { target: { value: "Test event" } });
    fireEvent.click(
      screen.getByRole("button", { name: /add event/i })
    );
    await waitFor(() =>
      expect(mockApi.addTimelineEvent).toHaveBeenCalledTimes(1)
    );
    fireEvent.click(screen.getByRole("button", { name: /^continue$/i }));

    // Step 4: Review → Begin hearing
    await waitFor(() =>
      expect(screen.getByText(/review your case/i)).toBeInTheDocument()
    );
    fireEvent.click(
      screen.getByRole("button", { name: /begin hearing/i })
    );
    await waitFor(() =>
      expect(mockApi.startHearing).toHaveBeenCalledTimes(1)
    );
  }

  beforeEach(() => {
    vi.clearAllMocks();
    caseCounter = 0;
    hearingCounter = 0;
    messageCounter = 0;
    cases.clear();
    hearings.clear();
    vi.stubGlobal("WebSocket", FailingWebSocket);

    // jsdom doesn't implement scrollIntoView
    Element.prototype.scrollIntoView = vi.fn();

    // Clear sessionStorage so form persistence doesn't bleed between tests
    sessionStorage.clear();

    mockSimulationService.checkBackendCapabilities.mockResolvedValue({
      status: "ready",
      detail: "Backend ready with 4 judge archetypes.",
    });
    mockSimulationService.executeSimulation.mockResolvedValue({
      output: {},
      modeUsed: "mock",
    });
    mockSimulationService.mapJudgmentToSimulationOutput.mockImplementation(
      (judgment: Record<string, unknown>) => ({
        winner: (judgment.in_favor_of as "plaintiff" | "defendant") ?? "plaintiff",
        awardAmount: (judgment.awarded_amount as number) ?? 0,
        confidence: 0.8,
        rationale: (judgment.rationale as string) ?? "Mapped rationale",
        citedAuthorities: ["Wyo. Stat. 1-1-109"],
        findingsOfFact: ["Mapped finding"],
        conclusionsOfLaw: [
          { text: "Mapped conclusion", citation: "Wyo. Stat. 1-1-109" },
        ],
        judgmentText: (judgment.judgment_text as string) ?? "Mapped judgment text",
        evidenceScoreSummary: [{ item: "Mapped evidence", score: 85 }],
        reasoningChain: { source: "test" },
      })
    );

    mockApi.getOrCreateSession.mockResolvedValue(sessionId);
    mockApi.getSessionAuth.mockRejectedValue(new Error("Not mocked"));
    mockApi.createCase.mockImplementation(
      async (_providedSessionId: string, payload: Record<string, unknown>) => {
        caseCounter += 1;
        const caseId = `case-${caseCounter}`;
        const record = buildCase(caseId, payload);
        cases.set(caseId, record);
        return record;
      }
    );
    mockApi.updateCase.mockImplementation(
      async (caseId: string, payload: Record<string, unknown>) => {
        const current = cases.get(caseId);
        if (!current) throw new Error("Case not found in test harness");
        const updated = {
          ...current,
          ...payload,
          updated_at: nowIso(),
        };
        cases.set(caseId, updated);
        return updated;
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
          address: payload.address ?? null,
          phone: payload.phone ?? null,
        });
        current.updated_at = nowIso();
        return current.parties.at(-1);
      }
    );
    mockApi.addEvidence.mockImplementation(async (caseId: string) => {
      const current = cases.get(caseId);
      if (!current) throw new Error("Case not found");
      current.evidence.push({
        id: `evidence-${current.evidence.length + 1}`,
        case_id: caseId,
        submitted_by: "plaintiff",
        evidence_type: "document",
        title: "Evidence title",
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
        id: `timeline-${current.timeline_events.length + 1}`,
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
    mockApi.startHearing.mockImplementation(async (caseId: string, judgeId: string) => {
      const existing = hearings.get(caseId);
      if (existing) {
        throw new mockApi.ApiClientError("already exists", {
          code: "http",
          status: 409,
        });
      }
      hearingCounter += 1;
      const hearingId = `hearing-${hearingCounter}`;
      const openingMessage = {
        id: `msg-${++messageCounter}`,
        hearing_id: hearingId,
        role: "judge",
        content: "Opening statement",
        sequence: 1,
        created_at: nowIso(),
      };
      const hearing: MockHearing = {
        id: hearingId,
        case_id: caseId,
        archetype_id: judgeId,
        started_at: nowIso(),
        completed_at: null,
        messages: [openingMessage],
      };
      hearings.set(caseId, hearing);
      return hearing;
    });
    mockApi.getHearing.mockImplementation(async (caseId: string) => {
      const hearing = hearings.get(caseId);
      if (!hearing) {
        throw new mockApi.ApiClientError("not found", { code: "http", status: 404 });
      }
      return hearing;
    });
    mockApi.postHearingMessage.mockImplementation(
      async (caseId: string, payload: { role: "plaintiff" | "defendant"; content: string }) => {
        const hearing = hearings.get(caseId);
        if (!hearing) {
          throw new mockApi.ApiClientError("not found", { code: "http", status: 404 });
        }
        const maxSeq = hearing.messages.at(-1)?.sequence ?? 0;
        hearing.messages.push({
          id: `msg-${++messageCounter}`,
          hearing_id: hearing.id,
          role: payload.role,
          content: payload.content,
          sequence: maxSeq + 1,
          created_at: nowIso(),
        });
        const conclude = payload.content.toLowerCase().includes("conclude");
        const judgeMessage = {
          role: "judge" as const,
          content: conclude ? "The hearing is now concluded." : "Please continue.",
          sequence: maxSeq + 2,
        };
        hearing.messages.push({
          id: `msg-${++messageCounter}`,
          hearing_id: hearing.id,
          role: "judge",
          content: judgeMessage.content,
          sequence: judgeMessage.sequence,
          created_at: nowIso(),
        });
        if (conclude) {
          hearing.completed_at = nowIso();
        }
        return { judge_message: judgeMessage, hearing_concluded: conclude };
      }
    );
    mockApi.generateJudgment.mockImplementation(async (caseId: string, archetypeId: string) => ({
      id: `judgment-${caseId}-${archetypeId}`,
      case_id: caseId,
      archetype_id: archetypeId,
      findings_of_fact: ["Finding"],
      conclusions_of_law: [{ text: "Conclusion", citation: "Wyo. Stat. 1-1-109" }],
      judgment_text: "Judgment text",
      rationale: "Judgment rationale",
      awarded_amount: 1200,
      in_favor_of: "plaintiff",
      evidence_scores: { doc: 80 },
      reasoning_chain: { step: "done" },
      advisory: null,
      created_at: nowIso(),
    }));
    mockApi.getJudgment.mockResolvedValue(null);
    mockApi.runComparison.mockImplementation(async (caseId: string, archetypeIds: string[]) => ({
      id: `run-${caseId}`,
      case_id: caseId,
      archetype_ids: archetypeIds,
      reused: false,
      created_at: nowIso(),
      comparison_insights: null,
      results: archetypeIds.map((archetypeId) => ({
        archetype_id: archetypeId,
        findings_of_fact: ["Finding"],
        conclusions_of_law: [
          { text: "Conclusion", citation: "Wyo. Stat. 1-1-109" },
        ],
        judgment_text: "Judgment text",
        rationale: "Judgment rationale",
        awarded_amount: 1200,
        in_favor_of: "plaintiff",
        evidence_scores: { doc: 80 },
        reasoning_chain: { step: "done" },
        created_at: nowIso(),
      })),
    }));
    mockApi.getJudgmentMetadata.mockResolvedValue({
      total_cost_usd: 0.02,
      total_latency_ms: 2000,
      total_input_tokens: 100,
      total_output_tokens: 120,
      calls: [],
    });
    mockApi.getCorpusStats.mockResolvedValue({
      total_chunks: 0,
      by_source_type: {},
    });
    mockApi.searchCorpus.mockResolvedValue([]);
    mockApi.ingestCorpus.mockResolvedValue({
      status: "ok",
      chunks_ingested: 0,
    });
  });

  afterEach(() => {
    cleanup();
  });

  it("covers intake -> hearing -> judgment critical path", async () => {
    render(<Home />);

    await navigateToHearing();

    // In HearingRoom: send a message to conclude
    const hearingInput = screen.getByPlaceholderText(/respond to the judge/i);
    fireEvent.change(hearingInput, {
      target: { value: "Please conclude this hearing now." },
    });
    fireEvent.click(screen.getByRole("button", { name: /^send$/i }));

    await waitFor(() => expect(mockApi.postHearingMessage).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(screen.getByText(/hearing has concluded/i)).toBeInTheDocument()
    );

    // Proceed to judgment
    fireEvent.click(
      screen.getByRole("button", { name: /get my judgment/i })
    );

    await waitFor(() => expect(mockApi.generateJudgment).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(screen.getByText(/finding for the/i)).toBeInTheDocument()
    );
    expect(screen.getByText("plaintiff")).toBeInTheDocument();
  });

  it("uses HTTP hearing message fallback when websocket is unavailable", async () => {
    render(<Home />);

    await navigateToHearing();

    // WebSocket fails → should still be able to send via HTTP
    const hearingInput = screen.getByPlaceholderText(/respond to the judge/i);
    fireEvent.change(hearingInput, {
      target: { value: "Fallback path message." },
    });
    fireEvent.click(screen.getByRole("button", { name: /^send$/i }));

    await waitFor(() => expect(mockApi.postHearingMessage).toHaveBeenCalledTimes(1));
  });

  it("runs the multi-judge comparison path across all judges", async () => {
    render(<Home />);

    await navigateToHearing();

    // Conclude hearing
    const hearingInput = screen.getByPlaceholderText(/respond to the judge/i);
    fireEvent.change(hearingInput, {
      target: { value: "Please conclude hearing for comparison." },
    });
    fireEvent.click(screen.getByRole("button", { name: /^send$/i }));
    await waitFor(() => expect(mockApi.postHearingMessage).toHaveBeenCalledTimes(1));

    // Proceed to judgment first
    await waitFor(() =>
      expect(screen.getByText(/hearing has concluded/i)).toBeInTheDocument()
    );
    fireEvent.click(
      screen.getByRole("button", { name: /get my judgment/i })
    );
    await waitFor(() => expect(mockApi.generateJudgment).toHaveBeenCalledTimes(1));

    // Now run comparison
    mockApi.createCase.mockClear();
    mockApi.generateJudgment.mockClear();
    mockApi.runComparison.mockClear();

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /compare judges/i })).toBeInTheDocument()
    );
    fireEvent.click(screen.getByRole("button", { name: /compare judges/i }));

    await waitFor(() => expect(mockApi.runComparison).toHaveBeenCalledTimes(1));
    expect(mockApi.generateJudgment).toHaveBeenCalledTimes(0);
  });
});
