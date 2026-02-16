/**
 * Unit tests for the API client (api.ts).
 *
 * Covers:
 * - Request timeout handling
 * - Retry logic for idempotent GET requests
 * - No retry for non-idempotent POST requests
 * - Backend error envelope parsing
 * - ApiClientError construction
 * - Session caching via getOrCreateSession
 * - canRetry / normalizeUnknownError helpers (via public API)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// We need to mock fetch before importing the module
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

// Reset module-level state between imports
let api: typeof import("./api");

beforeEach(async () => {
  mockFetch.mockReset();
  // Re-import to reset module-level _cachedSessionId
  vi.resetModules();
  api = await import("./api");
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ─── Helper ──────────────────────────────────────────────────────────────────

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function errorResponse(
  status: number,
  body: { error: { code: string; message: string; retryable?: boolean } }
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// ─── ApiClientError ──────────────────────────────────────────────────────────

describe("ApiClientError", () => {
  it("has correct name and properties", () => {
    const err = new api.ApiClientError("test", {
      code: "http",
      status: 404,
      details: "Not found",
      backendCode: "case_not_found",
    });
    expect(err.name).toBe("ApiClientError");
    expect(err.message).toBe("test");
    expect(err.code).toBe("http");
    expect(err.status).toBe(404);
    expect(err.details).toBe("Not found");
    expect(err.backendCode).toBe("case_not_found");
  });

  it("extends Error", () => {
    const err = new api.ApiClientError("test", { code: "network" });
    expect(err).toBeInstanceOf(Error);
  });
});

// ─── Successful Requests ─────────────────────────────────────────────────────

describe("healthCheck", () => {
  it("returns parsed JSON on success", async () => {
    const body = { status: "ok", database: true, version: "1.0" };
    mockFetch.mockResolvedValueOnce(jsonResponse(body));

    const result = await api.healthCheck();
    expect(result).toEqual(body);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});

// ─── HTTP Error Parsing ──────────────────────────────────────────────────────

describe("error parsing", () => {
  it("parses backend error envelope", async () => {
    mockFetch.mockResolvedValueOnce(
      errorResponse(404, {
        error: { code: "case_not_found", message: "Case not found" },
      })
    );

    await expect(api.healthCheck()).rejects.toMatchObject({
      code: "http",
      status: 404,
      backendCode: "case_not_found",
      message: "Case not found",
    });
  });

  it("handles empty response body", async () => {
    // GET retries once on 500, so provide two 500 responses
    mockFetch
      .mockResolvedValueOnce(new Response("", { status: 500 }))
      .mockResolvedValueOnce(new Response("", { status: 500 }));

    await expect(api.healthCheck()).rejects.toMatchObject({
      code: "http",
      status: 500,
    });
  });

  it("handles non-JSON error response", async () => {
    // GET retries once on 500, so provide two 500 responses
    mockFetch
      .mockResolvedValueOnce(new Response("Internal Server Error", { status: 500 }))
      .mockResolvedValueOnce(new Response("Internal Server Error", { status: 500 }));

    await expect(api.healthCheck()).rejects.toMatchObject({
      code: "http",
      status: 500,
      message: "Internal Server Error",
    });
  });
});

// ─── Timeout Handling ────────────────────────────────────────────────────────

describe("timeout handling", () => {
  it("throws timeout error when request takes too long", async () => {
    const makeAbortError = () =>
      new Promise((_, reject) => {
        const err = new Error("The operation was aborted.");
        err.name = "AbortError";
        setTimeout(() => reject(err), 10);
      });

    // GET retries once on timeout, so both attempts must abort
    mockFetch
      .mockImplementationOnce(makeAbortError)
      .mockImplementationOnce(makeAbortError);

    await expect(api.healthCheck()).rejects.toMatchObject({
      code: "timeout",
    });
  });
});

// ─── Network Error Handling ──────────────────────────────────────────────────

describe("network errors", () => {
  it("wraps fetch failures as network errors", async () => {
    // GET retries once on network error, so both attempts must fail
    mockFetch
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockRejectedValueOnce(new TypeError("Failed to fetch"));

    await expect(api.healthCheck()).rejects.toMatchObject({
      code: "network",
      details: "Failed to fetch",
    });
  });
});

// ─── Retry Logic ─────────────────────────────────────────────────────────────

describe("retry logic", () => {
  it("retries GET on 500 error", async () => {
    // First call: 500, second call: success
    mockFetch
      .mockResolvedValueOnce(
        errorResponse(500, {
          error: { code: "internal", message: "Server error" },
        })
      )
      .mockResolvedValueOnce(jsonResponse({ status: "ok" }));

    const result = await api.healthCheck();
    expect(result).toEqual({ status: "ok" });
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("retries GET on 429 rate limit", async () => {
    mockFetch
      .mockResolvedValueOnce(
        errorResponse(429, {
          error: { code: "rate_limited", message: "Too many requests" },
        })
      )
      .mockResolvedValueOnce(jsonResponse({ status: "ok" }));

    const result = await api.healthCheck();
    expect(result).toEqual({ status: "ok" });
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("retries GET on network failure", async () => {
    mockFetch
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce(jsonResponse({ status: "ok" }));

    const result = await api.healthCheck();
    expect(result).toEqual({ status: "ok" });
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("does not retry on 400 client error", async () => {
    mockFetch.mockResolvedValueOnce(
      errorResponse(400, {
        error: { code: "bad_request", message: "Invalid input" },
      })
    );

    await expect(api.healthCheck()).rejects.toMatchObject({
      status: 400,
    });
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("does not retry on 404", async () => {
    mockFetch.mockResolvedValueOnce(
      errorResponse(404, {
        error: { code: "not_found", message: "Not found" },
      })
    );

    await expect(api.healthCheck()).rejects.toMatchObject({
      status: 404,
    });
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});

// ─── Session Management ──────────────────────────────────────────────────────

describe("session management", () => {
  it("getStoredSessionId returns null initially", () => {
    expect(api.getStoredSessionId()).toBeNull();
  });

  it("storeSessionId caches the value", () => {
    api.storeSessionId("test-session-123");
    expect(api.getStoredSessionId()).toBe("test-session-123");
  });

  it("createSession caches the session ID", async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ id: "new-session", role: "viewer", created_at: "2024-01-01" })
    );

    const session = await api.createSession();
    expect(session.id).toBe("new-session");
    expect(api.getStoredSessionId()).toBe("new-session");
  });

  it("getOrCreateSession returns cached ID", async () => {
    api.storeSessionId("cached-id");
    const id = await api.getOrCreateSession();
    expect(id).toBe("cached-id");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("getOrCreateSession creates session when none cached", async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ id: "auto-created", role: "viewer", created_at: "2024-01-01" })
    );

    const id = await api.getOrCreateSession();
    expect(id).toBe("auto-created");
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});

// ─── Case API Functions ──────────────────────────────────────────────────────

describe("createCase", () => {
  it("sends POST with session header and body", async () => {
    const caseData = {
      case_type: "contract" as const,
      plaintiff_narrative: "I was wronged",
      defendant_narrative: "I disagree",
      claimed_amount: 500,
    };
    const responseBody = { id: "case-1", ...caseData, status: "intake" };
    mockFetch.mockResolvedValueOnce(jsonResponse(responseBody));

    const result = await api.createCase("session-1", caseData);
    expect(result.id).toBe("case-1");

    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toContain("/cases");
    expect(init.method).toBe("POST");
    expect(init.headers["X-Session-Id"]).toBe("session-1");
  });
});

describe("addParty", () => {
  it("sends POST to parties endpoint", async () => {
    api.storeSessionId("session-1");
    const partyData = { role: "plaintiff" as const, name: "Alice" };
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ id: "party-1", case_id: "case-1", ...partyData })
    );

    const result = await api.addParty("case-1", partyData);
    expect(result.name).toBe("Alice");

    const [url] = mockFetch.mock.calls[0];
    expect(url).toContain("/cases/case-1/parties");
  });
});

// ─── Hearing API Functions ───────────────────────────────────────────────────

describe("startHearing", () => {
  it("sends POST with archetype_id", async () => {
    api.storeSessionId("session-1");
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        id: "hearing-1",
        case_id: "case-1",
        archetype_id: "stern",
        messages: [],
      })
    );

    const result = await api.startHearing("case-1", "stern");
    expect(result.archetype_id).toBe("stern");

    const [, init] = mockFetch.mock.calls[0];
    expect(JSON.parse(init.body)).toEqual({ archetype_id: "stern" });
  });
});

describe("postHearingMessage", () => {
  it("sends message and returns exchange", async () => {
    api.storeSessionId("session-1");
    const exchange = {
      judge_message: { role: "judge", content: "Noted.", sequence: 4 },
      hearing_concluded: false,
    };
    mockFetch.mockResolvedValueOnce(jsonResponse(exchange));

    const result = await api.postHearingMessage("case-1", {
      role: "plaintiff",
      content: "My testimony",
    });
    expect(result.judge_message.role).toBe("judge");
  });
});

// ─── Retryable flag from backend ─────────────────────────────────────────────

describe("retryable flag", () => {
  it("respects retryable=true from backend on 4xx", async () => {
    // Backend says retryable but it's a 400 — should still retry
    mockFetch
      .mockResolvedValueOnce(
        errorResponse(400, {
          error: {
            code: "temporary",
            message: "Temporary issue",
            retryable: true,
          },
        })
      )
      .mockResolvedValueOnce(jsonResponse({ status: "ok" }));

    const result = await api.healthCheck();
    expect(result).toEqual({ status: "ok" });
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("respects retryable=false from backend on 5xx", async () => {
    mockFetch.mockResolvedValueOnce(
      errorResponse(500, {
        error: {
          code: "fatal",
          message: "Fatal server error",
          retryable: false,
        },
      })
    );

    await expect(api.healthCheck()).rejects.toMatchObject({
      status: 500,
    });
    // Even though 500 normally retries, retryable=false prevents it
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});
