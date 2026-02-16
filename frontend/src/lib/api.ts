/**
 * API client for the Wyoming AI Judge backend.
 * All functions call the FastAPI backend at the configured base URL.
 */

import type {
  Archetype,
  Case,
  CaseCreate,
  CaseUpdate,
  ComparisonRun,
  EvidenceCreate,
  Evidence,
  HealthCheck,
  Hearing,
  HearingMessageCreate,
  HearingMessageExchange,
  JudgmentMetadata,
  Judgment,
  OperatorRole,
  SessionAuth,
  CorpusSearchResult,
  CorpusStats,
  Party,
  PartyCreate,
  Session,
  TimelineEvent,
  TimelineEventCreate,
} from "./types";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
export const API_BASE_URL = API_BASE;
const DEFAULT_TIMEOUT_MS = parsePositiveInt(
  process.env.NEXT_PUBLIC_API_TIMEOUT_MS,
  8000
);

type ApiErrorCode = "http" | "timeout" | "network";

interface BackendErrorEnvelope {
  error?: {
    code?: string;
    message?: string;
    retryable?: boolean;
    details?: unknown;
  };
}

export class ApiClientError extends Error {
  readonly code: ApiErrorCode;
  readonly status?: number;
  readonly details?: string;
  readonly backendCode?: string;
  readonly retryable?: boolean;

  constructor(
    message: string,
    options: {
      code: ApiErrorCode;
      status?: number;
      details?: string;
      backendCode?: string;
      retryable?: boolean;
    }
  ) {
    super(message);
    this.name = "ApiClientError";
    this.code = options.code;
    this.status = options.status;
    this.details = options.details;
    this.backendCode = options.backendCode;
    this.retryable = options.retryable;
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizeUnknownError(error: unknown): ApiClientError {
  if (error instanceof ApiClientError) return error;
  if (isAbortError(error)) {
    return new ApiClientError("Request timed out", { code: "timeout" });
  }
  return new ApiClientError("Network request failed", {
    code: "network",
    details: error instanceof Error ? error.message : String(error),
  });
}

function isIdempotentMethod(method: string): boolean {
  return method === "GET" || method === "HEAD" || method === "OPTIONS";
}

function canRetry(error: ApiClientError): boolean {
  if (error.retryable === true) return true;
  if (error.retryable === false) return false;
  if (error.code === "network" || error.code === "timeout") return true;
  return Boolean(error.status && (error.status >= 500 || error.status === 429));
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function requestWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeoutHandle);
  }
}

async function parseErrorResponse(
  response: Response
): Promise<{ message: string; details: string; backendCode?: string; retryable?: boolean }> {
  const text = await response.text();
  if (!text) {
    return {
      message: `API error ${response.status}`,
      details: "No response body",
    };
  }

  try {
    const parsed = JSON.parse(text) as BackendErrorEnvelope;
    const message = parsed.error?.message ?? text;
    const details =
      typeof parsed.error?.details === "string"
        ? parsed.error.details
        : JSON.stringify(parsed.error?.details ?? parsed);
    return {
      message,
      details,
      backendCode: parsed.error?.code,
      retryable: parsed.error?.retryable,
    };
  } catch {
    return {
      message: text,
      details: text,
    };
  }
}

interface RequestConfig {
  timeoutMs?: number;
  retries?: number;
}

async function request<T>(
  path: string,
  options: RequestInit = {},
  config: RequestConfig = {}
): Promise<T> {
  const url = `${API_BASE}${path}`;
  const method = (options.method ?? "GET").toUpperCase();
  const retries =
    config.retries ??
    (isIdempotentMethod(method)
      ? parsePositiveInt(process.env.NEXT_PUBLIC_API_RETRIES, 1)
      : 0);
  const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const fetchOptions: RequestInit = {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
    ...options,
  };

  let lastError: ApiClientError | null = null;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const res = await requestWithTimeout(url, fetchOptions, timeoutMs);
      if (!res.ok) {
        const parsed = await parseErrorResponse(res);
        const apiError = new ApiClientError(
          parsed.message || `API error ${res.status}`,
          {
            code: "http",
            status: res.status,
            details: parsed.details,
            backendCode: parsed.backendCode,
            retryable: parsed.retryable,
          }
        );
        if (attempt < retries && canRetry(apiError)) {
          await sleep(200 * (attempt + 1));
          continue;
        }
        throw apiError;
      }
      return res.json() as Promise<T>;
    } catch (error) {
      const apiError = normalizeUnknownError(error);
      lastError = apiError;
      if (attempt < retries && canRetry(apiError)) {
        await sleep(200 * (attempt + 1));
        continue;
      }
      throw apiError;
    }
  }

  throw lastError ?? new ApiClientError("Unknown API client failure", { code: "network" });
}

// ─── Session ──────────────────────────────────────────────────────────────────
// Session IDs are managed via httpOnly cookies set by the backend.
// We keep a lightweight in-memory copy of the session ID (from API responses)
// so the frontend can reference it for display and WebSocket query params.
// The cookie is the authoritative auth credential — never stored in localStorage.

let _cachedSessionId: string | null = null;

export function getStoredSessionId(): string | null {
  return _cachedSessionId;
}

export function storeSessionId(id: string): void {
  _cachedSessionId = id;
}

export async function createSession(): Promise<Session> {
  const session = await request<Session>("/sessions", { method: "POST" });
  _cachedSessionId = session.id;
  return session;
}

export async function getOrCreateSession(): Promise<string> {
  if (_cachedSessionId) return _cachedSessionId;
  const session = await createSession();
  return session.id;
}

export async function getSessionAuth(sessionId?: string): Promise<SessionAuth> {
  const activeSessionId = sessionId ?? (await getOrCreateSession());
  return request<SessionAuth>("/auth/me", {
    headers: { "X-Session-Id": activeSessionId },
  });
}

export async function claimAdminRole(
  adminKey: string,
  sessionId?: string
): Promise<OperatorRole> {
  const activeSessionId = sessionId ?? (await getOrCreateSession());
  const session = await request<Session>("/auth/admin-login", {
    method: "POST",
    headers: { "X-Session-Id": activeSessionId },
    body: JSON.stringify({ admin_key: adminKey }),
  });
  return session.role;
}

// ─── Health ───────────────────────────────────────────────────────────────────

export async function healthCheck(): Promise<HealthCheck> {
  return request<HealthCheck>("/health");
}

// ─── Cases ────────────────────────────────────────────────────────────────────

export async function createCase(
  sessionId: string,
  data: CaseCreate
): Promise<Case> {
  return request<Case>("/cases", {
    method: "POST",
    headers: { "X-Session-Id": sessionId },
    body: JSON.stringify(data),
  });
}

export async function getCase(caseId: string): Promise<Case> {
  const sessionId = await getOrCreateSession();
  return request<Case>(`/cases/${caseId}`, {
    headers: { "X-Session-Id": sessionId },
  });
}

export async function updateCase(
  caseId: string,
  data: CaseUpdate
): Promise<Case> {
  const sessionId = await getOrCreateSession();
  return request<Case>(`/cases/${caseId}`, {
    method: "PUT",
    headers: { "X-Session-Id": sessionId },
    body: JSON.stringify(data),
  });
}

// ─── Parties ──────────────────────────────────────────────────────────────────

export async function addParty(
  caseId: string,
  data: PartyCreate
): Promise<Party> {
  const sessionId = await getOrCreateSession();
  return request<Party>(`/cases/${caseId}/parties`, {
    method: "POST",
    headers: { "X-Session-Id": sessionId },
    body: JSON.stringify(data),
  });
}

// ─── Evidence ─────────────────────────────────────────────────────────────────

export async function addEvidence(
  caseId: string,
  data: EvidenceCreate,
  file?: File
): Promise<Evidence> {
  const sessionId = await getOrCreateSession();
  const formData = new FormData();
  formData.append("submitted_by", data.submitted_by);
  formData.append("evidence_type", data.evidence_type);
  formData.append("title", data.title);
  formData.append("description", data.description ?? "");
  if (file) {
    formData.append("file", file);
  }

  const url = `${API_BASE}/cases/${caseId}/evidence`;
  let res: Response;
  try {
    res = await requestWithTimeout(
      url,
      {
        method: "POST",
        credentials: "include",
        headers: { "X-Session-Id": sessionId },
        body: formData,
      },
      DEFAULT_TIMEOUT_MS
    );
  } catch (error) {
    throw normalizeUnknownError(error);
  }

  if (!res.ok) {
    const parsed = await parseErrorResponse(res);
    throw new ApiClientError(parsed.message || `API error ${res.status}`, {
      code: "http",
      status: res.status,
      details: parsed.details,
      backendCode: parsed.backendCode,
      retryable: parsed.retryable,
    });
  }
  return res.json() as Promise<Evidence>;
}

// ─── Timeline ─────────────────────────────────────────────────────────────────

export async function addTimelineEvent(
  caseId: string,
  data: TimelineEventCreate
): Promise<TimelineEvent> {
  const sessionId = await getOrCreateSession();
  return request<TimelineEvent>(`/cases/${caseId}/timeline`, {
    method: "POST",
    headers: { "X-Session-Id": sessionId },
    body: JSON.stringify(data),
  });
}

// ─── Hearing ──────────────────────────────────────────────────────────────────

export async function startHearing(
  caseId: string,
  archetypeId: string
): Promise<Hearing> {
  const sessionId = await getOrCreateSession();
  return request<Hearing>(`/cases/${caseId}/hearing`, {
    method: "POST",
    headers: { "X-Session-Id": sessionId },
    body: JSON.stringify({ archetype_id: archetypeId }),
  });
}

export async function getHearing(caseId: string): Promise<Hearing> {
  const sessionId = await getOrCreateSession();
  return request<Hearing>(`/cases/${caseId}/hearing`, {
    headers: { "X-Session-Id": sessionId },
  });
}

export async function postHearingMessage(
  caseId: string,
  data: HearingMessageCreate
): Promise<HearingMessageExchange> {
  const sessionId = await getOrCreateSession();
  return request<HearingMessageExchange>(`/cases/${caseId}/hearing/message`, {
    method: "POST",
    headers: { "X-Session-Id": sessionId },
    body: JSON.stringify(data),
  });
}

// ─── Judgment ─────────────────────────────────────────────────────────────────

export async function generateJudgment(
  caseId: string,
  archetypeId: string
): Promise<Judgment> {
  const sessionId = await getOrCreateSession();
  return request<Judgment>(`/cases/${caseId}/judgment`, {
    method: "POST",
    headers: { "X-Session-Id": sessionId },
    body: JSON.stringify({ archetype_id: archetypeId }),
  }, { retries: 1 });
}

export async function getJudgment(caseId: string): Promise<Judgment> {
  const sessionId = await getOrCreateSession();
  return request<Judgment>(`/cases/${caseId}/judgment`, {
    headers: { "X-Session-Id": sessionId },
  });
}

export async function getJudgmentMetadata(caseId: string): Promise<JudgmentMetadata> {
  const sessionId = await getOrCreateSession();
  return request<JudgmentMetadata>(`/cases/${caseId}/judgment/metadata`, {
    headers: { "X-Session-Id": sessionId },
  });
}

// ─── Archetypes ───────────────────────────────────────────────────────────────

export async function getArchetypes(): Promise<Archetype[]> {
  return request<Archetype[]>("/archetypes");
}

// ─── Corpus/Admin ─────────────────────────────────────────────────────────────

export async function ingestCorpus(): Promise<{ status: string; chunks_ingested: number }> {
  return request<{ status: string; chunks_ingested: number }>("/corpus/ingest", {
    method: "POST",
  }, { retries: 1, timeoutMs: Math.max(DEFAULT_TIMEOUT_MS, 30_000) });
}

export async function getCorpusStats(): Promise<CorpusStats> {
  return request<CorpusStats>("/corpus/stats");
}

export async function searchCorpus(
  query: string,
  limit = 5
): Promise<CorpusSearchResult[]> {
  return request<CorpusSearchResult[]>("/corpus/search", {
    method: "POST",
    body: JSON.stringify({ query, limit }),
  }, { retries: 1 });
}

export async function runComparison(
  caseId: string,
  archetypeIds: string[],
  forceRefresh = false
): Promise<ComparisonRun> {
  const sessionId = await getOrCreateSession();
  return request<ComparisonRun>(`/cases/${caseId}/comparison-runs`, {
    method: "POST",
    headers: { "X-Session-Id": sessionId },
    body: JSON.stringify({ archetype_ids: archetypeIds, force_refresh: forceRefresh }),
  });
}

export async function listComparisonRuns(caseId: string): Promise<ComparisonRun[]> {
  const sessionId = await getOrCreateSession();
  return request<ComparisonRun[]>(`/cases/${caseId}/comparison-runs`, {
    headers: { "X-Session-Id": sessionId },
  });
}
