import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockApi = vi.hoisted(() => ({
  API_BASE_URL: "http://localhost:8000",
  ApiClientError: class extends Error {
    code: string;
    status?: number;
    constructor(message: string, opts: { code: string; status?: number }) {
      super(message);
      this.code = opts.code;
      this.status = opts.status;
    }
  },
  getOrCreateSession: vi.fn(),
  startHearing: vi.fn(),
  getHearing: vi.fn(),
  postHearingMessage: vi.fn(),
}));

const mockSim = vi.hoisted(() => ({
  SIMULATION_MODE: "backend" as const,
}));

vi.mock("@/lib/api", () => mockApi);
vi.mock("@/lib/simulationService", () => mockSim);

import { useHearing } from "./useHearing";

class FakeWebSocket {
  static readonly OPEN = 1;
  static readonly CLOSED = 3;
  readyState = FakeWebSocket.CLOSED;
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
  send() {}
  close() {
    this.readyState = FakeWebSocket.CLOSED;
    this.onclose?.();
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("WebSocket", FakeWebSocket);
  mockApi.getOrCreateSession.mockResolvedValue("session-1");
  mockApi.getHearing.mockRejectedValue(
    new mockApi.ApiClientError("not found", { code: "http", status: 404 })
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useHearing", () => {
  it("initialises with default state", () => {
    const { result } = renderHook(() =>
      useHearing({
        caseId: null,
        judgeId: "common_sense",
        ensureCase: vi.fn().mockResolvedValue("case-1"),
      })
    );

    expect(result.current.messages).toEqual([]);
    expect(result.current.concluded).toBe(false);
    expect(result.current.isStarting).toBe(false);
    expect(result.current.isSending).toBe(false);
    expect(result.current.hasHearingRecord).toBe(false);
  });

  it("beginHearing creates hearing and sets messages", async () => {
    mockApi.startHearing.mockResolvedValue({
      id: "hearing-1",
      case_id: "case-1",
      archetype_id: "common_sense",
      started_at: new Date().toISOString(),
      completed_at: null,
      messages: [
        {
          id: "msg-1",
          hearing_id: "hearing-1",
          role: "judge",
          content: "Opening statement.",
          sequence: 1,
          created_at: new Date().toISOString(),
        },
      ],
    });

    const ensureCase = vi.fn().mockResolvedValue("case-1");
    const { result } = renderHook(() =>
      useHearing({ caseId: null, judgeId: "common_sense", ensureCase })
    );

    await act(() => result.current.beginHearing());

    expect(mockApi.startHearing).toHaveBeenCalledWith("case-1", "common_sense");
    expect(result.current.messages).toHaveLength(1);
    expect(result.current.messages[0].role).toBe("judge");
    expect(result.current.hasHearingRecord).toBe(true);
  });

  it("beginHearing handles 409 by fetching existing hearing", async () => {
    mockApi.startHearing.mockRejectedValue(
      new mockApi.ApiClientError("conflict", { code: "http", status: 409 })
    );
    mockApi.getHearing.mockResolvedValueOnce({
      id: "hearing-1",
      case_id: "case-1",
      archetype_id: "common_sense",
      started_at: new Date().toISOString(),
      completed_at: null,
      messages: [
        {
          id: "msg-1",
          hearing_id: "hearing-1",
          role: "judge",
          content: "Existing opening.",
          sequence: 1,
          created_at: new Date().toISOString(),
        },
      ],
    });

    const ensureCase = vi.fn().mockResolvedValue("case-1");
    const { result } = renderHook(() =>
      useHearing({ caseId: null, judgeId: "common_sense", ensureCase })
    );

    await act(() => result.current.beginHearing());
    expect(result.current.messages[0].content).toBe("Existing opening.");
  });

  it("sendMessage falls back to HTTP when websocket is unavailable", async () => {
    mockApi.postHearingMessage.mockResolvedValue({
      judge_message: { role: "judge", content: "Noted.", sequence: 2 },
      hearing_concluded: false,
    });

    const { result } = renderHook(() =>
      useHearing({
        caseId: "case-1",
        judgeId: "common_sense",
        ensureCase: vi.fn().mockResolvedValue("case-1"),
      })
    );

    await act(() => result.current.sendMessage("plaintiff", "My deposit."));

    await waitFor(() =>
      expect(mockApi.postHearingMessage).toHaveBeenCalledWith("case-1", {
        role: "plaintiff",
        content: "My deposit.",
      })
    );
  });

  it("sendMessage does nothing when concluded", async () => {
    mockApi.startHearing.mockResolvedValue({
      id: "hearing-1",
      case_id: "case-1",
      archetype_id: "common_sense",
      started_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
      messages: [],
    });

    const ensureCase = vi.fn().mockResolvedValue("case-1");
    const { result } = renderHook(() =>
      useHearing({ caseId: null, judgeId: "common_sense", ensureCase })
    );

    await act(() => result.current.beginHearing());
    expect(result.current.concluded).toBe(true);

    await act(() => result.current.sendMessage("plaintiff", "Test"));
    expect(mockApi.postHearingMessage).not.toHaveBeenCalled();
  });

  it("calls onError when beginHearing fails", async () => {
    mockApi.startHearing.mockRejectedValue(new Error("Network error"));
    const onError = vi.fn();
    const ensureCase = vi.fn().mockResolvedValue("case-1");

    const { result } = renderHook(() =>
      useHearing({ caseId: null, judgeId: "common_sense", ensureCase, onError })
    );

    await act(() => result.current.beginHearing());
    expect(onError).toHaveBeenCalledWith("Failed to start hearing");
  });
});
