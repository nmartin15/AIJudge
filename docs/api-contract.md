# API Error Contract & Comparison Runs

## Unified Error Envelope

**Every** non-2xx response from the backend now returns a consistent JSON shape.
The frontend `ApiClientError` class parses `backendCode` and `retryable` from it automatically.

```json
{
  "error": {
    "code": "judgment_rate_limited",
    "message": "Judgment generation rate limit exceeded. Please retry shortly.",
    "retryable": true,
    "details": { "limit": 30, "window_seconds": 60 }
  }
}
```

### Fields

| Field               | Type                | Always present | Description                                                   |
|---------------------|---------------------|:--------------:|---------------------------------------------------------------|
| `error.code`        | `string`            | yes            | Machine-readable error identifier (snake_case)                |
| `error.message`     | `string`            | yes            | Human-readable description safe to show in UI                 |
| `error.retryable`   | `boolean`           | yes            | `true` if the client should retry (429, 5xx, transient LLM)  |
| `error.details`     | `object\|list\|str` | no             | Extra context (rate-limit params, validation errors, etc.)    |

### Known Error Codes

| Code                            | HTTP | Retryable | When                                                  |
|---------------------------------|------|:---------:|-------------------------------------------------------|
| `bad_request`                   | 400  | no        | Generic invalid request                               |
| `unauthorized`                  | 401  | no        | Missing session identifier (cookie or `X-Session-Id` header) |
| `forbidden`                     | 403  | no        | Non-admin session tried an admin endpoint             |
| `not_found`                     | 404  | no        | Resource does not exist                               |
| `conflict`                      | 409  | no        | Duplicate party, existing judgment, etc.              |
| `payload_too_large`             | 413  | no        | File exceeds `max_upload_size_mb`                     |
| `validation_error`              | 422  | no        | Pydantic validation failure (`details` has field list) |
| `rate_limited`                  | 429  | yes       | Generic rate limit (catch-all)                        |
| `judgment_rate_limited`         | 429  | yes       | Per-session judgment generation limit hit             |
| `comparison_rate_limited`       | 429  | yes       | Per-session comparison run limit hit                  |
| `corpus_search_rate_limited`    | 429  | yes       | Per-session corpus search limit hit                   |
| `corpus_ingest_rate_limited`    | 429  | yes       | Per-session corpus ingest limit hit                   |
| `judgment_missing_narratives`   | 400  | no        | Both narratives required before judgment              |
| `judgment_exists`               | 409  | no        | Judgment already exists on case                       |
| `judgment_not_found`            | 404  | no        | No judgment saved yet                                 |
| `judgment_metadata_not_found`   | 404  | no        | No LLM call records for case                         |
| `comparison_missing_narratives` | 400  | no        | Both narratives required before comparison            |
| `comparison_archetypes_required`| 400  | no        | Empty archetype list in request                       |
| `comparison_run_not_found`      | 404  | no        | Run ID does not belong to this case                   |
| `admin_login_rate_limited`      | 429  | yes       | Admin login brute-force limit hit (5 per 15 min)      |
| `corpus_ingest_failed`          | 500  | yes       | Zero chunks produced during ingest                    |
| `internal_error`                | 500  | yes       | Unhandled server exception                            |

---

## Frontend Retry Behavior

The `ApiClientError` now exposes:

```ts
class ApiClientError extends Error {
  readonly code: "http" | "timeout" | "network";
  readonly status?: number;
  readonly details?: string;
  readonly backendCode?: string;   // ← from error.code
  readonly retryable?: boolean;    // ← from error.retryable
}
```

The `canRetry()` helper uses `retryable` first (if present), then falls back to status-code heuristics.
Expensive POST endpoints (`generateJudgment`, `ingestCorpus`, `searchCorpus`) now have `retries: 1` configured by default.

---

## Rate Limits (configurable via env)

| Setting                              | Default | Scope       | Window    |
|--------------------------------------|---------|-------------|-----------|
| `JUDGMENT_REQUESTS_PER_MINUTE`       | 30      | per session | 60 s      |
| `CORPUS_SEARCH_REQUESTS_PER_MINUTE`  | 120     | per session | 60 s      |
| `CORPUS_INGEST_REQUESTS_PER_HOUR`    | 4       | per session | 3600 s    |
| Admin login                          | 5       | per session | 900 s     |

Comparison runs share the judgment limiter (each `POST /comparison-runs` counts as one check against it).

> **Brute-force protection:** Failed admin login attempts also incur a deliberate 1-second server-side delay before the 403 response is returned.

---

## LLM Retry Policy

All OpenAI and Anthropic calls (`call_openai`, `call_anthropic`, `generate_embedding`) use automatic retry with exponential backoff for transient failures (429, 5xx, timeouts, connection errors).

| Setting                     | Default | Description                          |
|-----------------------------|---------|--------------------------------------|
| `LLM_MAX_RETRIES`           | 2       | Max retry attempts per LLM call      |
| `LLM_RETRY_BASE_DELAY_MS`   | 300     | Initial delay between retries        |
| `LLM_RETRY_MAX_DELAY_MS`    | 3000    | Cap on exponential backoff delay     |

---

## Comparison Run Endpoints

### `POST /cases/{case_id}/comparison-runs`

Run a multi-judge comparison. Results are persisted and keyed by a hash of the case snapshot + archetype list, so identical requests are reused automatically.

**Request:**

```json
{
  "archetype_ids": ["strict", "common_sense", "evidence_heavy", "practical"],
  "force_refresh": false
}
```

| Field            | Type       | Required | Description                                                 |
|------------------|------------|:--------:|-------------------------------------------------------------|
| `archetype_ids`  | `string[]` | yes      | 1-8 judge archetype IDs to run                              |
| `force_refresh`  | `boolean`  | no       | `true` = delete cached run and re-execute (costs LLM calls) |

**Response** (`ComparisonRunResponse`):

```json
{
  "id": "uuid",
  "case_id": "uuid",
  "archetype_ids": ["strict", "common_sense", "evidence_heavy", "practical"],
  "reused": true,
  "created_at": "2026-02-14T12:00:00Z",
  "results": [
    {
      "archetype_id": "strict",
      "findings_of_fact": ["..."],
      "conclusions_of_law": [{ "text": "...", "citation": "..." }],
      "judgment_text": "...",
      "rationale": "...",
      "awarded_amount": 2400.0,
      "in_favor_of": "plaintiff",
      "evidence_scores": { "..." : "..." },
      "reasoning_chain": { "..." : "..." },
      "metadata": { "pipeline_metadata": { "..." : "..." } },
      "created_at": "2026-02-14T12:00:00Z"
    }
  ]
}
```

Key fields:
- `reused: true` means an existing run matched the case snapshot (no new LLM calls).
- `reused: false` means the pipeline ran fresh for every archetype.
- `metadata` on each result contains `pipeline_metadata` and `classification` from the pipeline run.

### `GET /cases/{case_id}/comparison-runs`

List all persisted comparison runs for a case, newest first.

**Response:** `ComparisonRunResponse[]`

### `GET /cases/{case_id}/comparison-runs/{run_id}`

Fetch a single persisted comparison run by ID.

**Response:** `ComparisonRunResponse`

---

## Run-Key Deduplication

The run key is a SHA-256 hash of:

```
case_id + sorted(archetype_ids) + plaintiff_narrative + defendant_narrative
+ claimed_amount + case.updated_at + hearing.completed_at + hearing message count
```

This means a cached run is invalidated automatically if:
- The user edits either narrative or the claimed amount
- The hearing progresses (new messages or completion)
- Different archetypes are selected

To force re-execution even when the key matches, send `force_refresh: true`.

---

## Session Authentication

Sessions are identified by an **httpOnly, SameSite=Strict cookie** named `session_id`. The cookie is set automatically when a session is created (`POST /sessions`) or on successful admin login (`POST /auth/admin-login`).

For non-browser clients, the `X-Session-Id` header is still accepted as a fallback. When both are present, the cookie takes precedence.

| Transport        | Mechanism                        | Notes                                         |
|------------------|----------------------------------|-----------------------------------------------|
| Browser (fetch)  | `credentials: "include"` cookie  | Primary — httpOnly, SameSite=Strict, Secure*  |
| Non-browser / WS | `X-Session-Id` header            | Fallback — also accepted on WebSocket upgrade |

\* The `Secure` flag is enabled when the app is not running in debug mode.

---

## Evidence Endpoints

### `POST /cases/{case_id}/evidence`

Upload evidence for a case. Files are **encrypted at rest** using Fernet (AES-128-CBC) before being written to disk.

**Response** (`EvidenceResponse`):

```json
{
  "id": "uuid",
  "case_id": "uuid",
  "party": "plaintiff",
  "evidence_type": "document",
  "description": "Signed contract",
  "has_file": true,
  "created_at": "2026-02-15T12:00:00Z"
}
```

> **Breaking change:** The `file_path` field has been replaced with `has_file` (boolean). Internal server paths are no longer exposed in API responses.

### `GET /cases/{case_id}/evidence/{evidence_id}/download`

Download an evidence file. The file is decrypted on the fly and returned as `application/octet-stream`. Requires ownership — the requesting session must own the case.

**Response:** Binary file stream with `Content-Disposition: attachment`.

**Errors:**
- `404` if the evidence record or file does not exist.
- `403` if the session does not own the case.

---

## Input Validation Constraints

All user-supplied text fields enforce `max_length` at the Pydantic schema layer. Requests exceeding these limits receive a `422 validation_error` response.

| Field                                  | Max Length |
|----------------------------------------|------------|
| `PartyCreate.name`                     | 255        |
| `PartyCreate.address`                  | 500        |
| `PartyCreate.phone`                    | 20         |
| `EvidenceCreate.description`           | 5,000      |
| `TimelineEventCreate.description`      | 5,000      |
| `CaseCreate.plaintiff_narrative`       | 50,000     |
| `CaseCreate.defendant_narrative`       | 50,000     |
| `CaseUpdate.plaintiff_narrative`       | 50,000     |
| `CaseUpdate.defendant_narrative`       | 50,000     |
| `CaseUpdate.archetype_id`             | 50         |
| `HearingMessageCreate.content`         | 10,000     |
| `CorpusSearchRequest.query`            | 1,000      |

---

## WebSocket Message Limits

Hearing WebSocket connections enforce a maximum message length of **10,000 characters**. Messages exceeding this limit are rejected with an error JSON payload on the WebSocket and are not processed.

```json
{
  "type": "error",
  "message": "Message too long (max 10000 characters)"
}
```
