# Wyoming AI Judge

AI-powered small claims court simulation for Wyoming jurisdiction. An educational tool that lets users explore how a small claims case might be decided by presenting both sides of a dispute to an AI judge.

**This is a simulation for educational purposes only. It does not constitute legal advice.**

## Features

- Multi-step case intake with both plaintiff and defendant perspectives
- **20 example case templates** spanning 10 dispute categories (security deposit, landlord-tenant, property damage, contract, consumer, loan/debt, wages/services, neighbor, pet/animal) with searchable combobox and keyword filtering
- Four distinct judge archetypes with different judicial temperaments
- Interactive hearing simulation with AI judge questions
- Formal judgment documents with findings of fact, conclusions of law, and citations
- Evidence scoring and reasoning transparency
- Multi-judge comparison to see how different temperaments affect outcomes
- **Wyoming state-branded UI** — navy blue, gold, and warm cream color palette derived from the Wyoming state flag and symbols
- Phone number auto-formatting as (XXX) XXX-XXXX

## Tech Stack

- **Backend:** Python 3.12 + FastAPI
- **Frontend:** Next.js 16 + React 19 + TypeScript + Tailwind CSS 4
- **Database:** PostgreSQL + pgvector
- **AI:** Claude (reasoning) + GPT-4o (extraction) + OpenAI embeddings

## Getting Started

### Quick Start (Docker)

The easiest way to run everything — Postgres with pgvector, the backend, and the frontend — is with Docker Compose:

```bash
cp .env.example .env          # Add your API keys (see below)
docker compose up --build
```

You **must** set at minimum:

- `OPENAI_API_KEY` and `ANTHROPIC_API_KEY` — required for AI functionality
- `POSTGRES_PASSWORD` — change the default before any deployment
- `FIELD_ENCRYPTION_KEY` — required for PII encryption at rest (generate with the command in `.env.example`)

- Frontend: http://localhost:3000
- Backend API: http://localhost:8000
- API docs: http://localhost:8000/docs (debug mode only — disabled in production)

On first launch, run the database migration:

```bash
docker compose exec backend alembic upgrade head
```

### Manual Setup

#### Prerequisites

- Python 3.12+
- Node.js 20+
- PostgreSQL 16+ with [pgvector](https://github.com/pgvector/pgvector) extension **v0.5.0+** (required for HNSW indexes)

#### Backend

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate        # Windows
# source .venv/bin/activate   # macOS/Linux
pip install -r requirements.txt
cp ../.env.example .env       # Edit with your API keys, DB credentials, and encryption key
alembic upgrade head          # Create database tables
uvicorn main:app --reload
```

Backend runs at http://localhost:8000. API docs at http://localhost:8000/docs (requires `DEBUG=true`).

#### Frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend runs at http://localhost:3000.

#### Database

```sql
CREATE DATABASE ai_judge;
\c ai_judge
CREATE EXTENSION vector;   -- requires pgvector >= 0.5.0 for HNSW index support
```

> **Note:** The HNSW vector index used for corpus similarity search requires
> pgvector **v0.5.0 or later**. Run `SELECT extversion FROM pg_extension WHERE extname = 'vector';`
> to verify your installed version. Docker Compose uses `pgvector/pgvector:pg16`
> which ships with a compatible version.

Then run `alembic upgrade head` from the `backend/` directory to create all tables.

### Database Migrations

This project uses [Alembic](https://alembic.sqlalchemy.org/) for database schema migrations.

```bash
cd backend

# Apply all pending migrations
alembic upgrade head

# Create a new migration after changing models/database.py
alembic revision --autogenerate -m "description of change"

# Roll back the last migration
alembic downgrade -1
```

## Project Structure

```
backend/           Python/FastAPI backend
  alembic/         Database migration scripts
  api/             API route handlers
  engine/          Judicial reasoning pipeline
  personas/        Judge archetype configurations
  corpus/          Legal corpus ingestion and RAG
  models/          Database models and Pydantic schemas
  prompts/         System prompts and templates
  db/              Database connection and encrypted column types
  crypto.py        Fernet encryption helpers for PII and file at-rest encryption
frontend/          Next.js frontend application (Wyoming-branded UI)
  src/app/         Root layout, global styles, and page component
  src/components/  Step components, hearing room, judgment view
  src/lib/         API client, mock simulation, case templates, hooks
nginx/             Nginx reverse-proxy configuration and security headers
docs/              API contract and developer documentation
docker-compose.yml Docker orchestration (Postgres + Backend + Frontend)
```

## Testing

The project has **326 automated tests** (137 backend + 189 frontend) covering API endpoints, the judicial reasoning pipeline, UI components, custom hooks, and error handling.

### Running Tests

```bash
# Backend (requires DATABASE_URL env var — tests mock the actual DB)
cd backend
$env:DATABASE_URL="postgresql+asyncpg://test:test@localhost:5432/test"  # PowerShell
python -m pytest

# Frontend
cd frontend
npm test
```

### Backend Tests (137 tests across 12 files)

| Area | File | What it covers |
|------|------|----------------|
| Pipeline | `test_pipeline.py` | Full 7-step judicial reasoning pipeline (fact extraction → advisory) |
| Auth & roles | `test_auth_role_integration.py` | Session creation, admin login, role enforcement, corpus endpoints |
| Ownership | `test_ownership_enforcement.py` | Case ownership validation, session header requirements |
| Hearings | `test_hearing_service.py`, `test_hearing_http_fallback.py`, `test_hearing_websocket_auth.py` | Hearing lifecycle, HTTP fallback messaging, WebSocket auth |
| CRUD | `test_case_update.py`, `test_party_hearing_duplicates.py` | Case updates, duplicate party/hearing prevention |
| Security | `test_crypto.py`, `test_file_download_security.py`, `test_upload_validation.py` | Fernet encryption, file download auth, upload size/type checks |
| Rate limiting | `test_rate_limiting.py` | Per-session rate limits on judgment, corpus, and admin endpoints |

### Frontend Tests (189 tests across 20 files)

| Area | Files | What it covers |
|------|-------|----------------|
| Step components | `PartiesStep`, `EvidenceStep`, `TimelineStep`, `StoryStep`, `ReviewStep` | Form rendering, validation, save/clear flows, navigation |
| Core components | `HearingRoom`, `JudgmentView`, `ErrorBoundary`, `SectionErrorBoundary` | Hearing UI, judgment display, error recovery |
| UI components | `ProgressBar`, `ToastContainer` | Step progress, toast notifications |
| Custom hooks | `useHearing`, `useToasts`, `useFormPersistence`, `useUnsavedChangesWarning` | WebSocket/HTTP hearing, toast lifecycle, sessionStorage persistence, beforeunload |
| API client | `api.test.ts` | Fetch wrapper, retries, timeouts, session management, error parsing |
| Simulation | `simulationService.test.ts`, `mockSimulation.test.ts` | Backend/mock mode switching, mock scoring logic |
| Integration | `page.integration.test.tsx` | Full wizard flow: intake → hearing → judgment → multi-judge comparison |
| Error paths | `page.error-paths.test.tsx` | API failures at each wizard step (case creation, parties, evidence, timeline, hearing) |

## Security

This application includes several security hardening measures:

### PII Encryption at Rest

Party names, addresses, and phone numbers are encrypted in the database using Fernet symmetric encryption (AES-128-CBC). Evidence files uploaded by users are also encrypted on disk before storage. Set the `FIELD_ENCRYPTION_KEY` environment variable to enable encryption (see `.env.example` for generation instructions). If the key is not set, encryption is silently skipped (development only — **always set a key in production**).

### Session Management

Sessions use **httpOnly, SameSite=Strict cookies** as the primary credential transport. The `X-Session-Id` header is still accepted as a fallback for non-browser clients. The frontend sends `credentials: "include"` on all requests so the cookie is attached automatically.

### Input Validation

All user-supplied text fields enforce `max_length` constraints at the API layer:

- Narratives: 50,000 characters
- Evidence/timeline descriptions: 5,000 characters
- Hearing messages: 10,000 characters (also enforced on WebSocket)
- Corpus search queries: 1,000 characters

### Rate Limiting & Brute-Force Protection

- Judgment, comparison, corpus search, and corpus ingest endpoints are rate-limited per session (see `docs/api-contract.md` for details).
- Admin login is limited to **5 attempts per 15 minutes** per session with a deliberate 1-second delay on failed attempts.

### HTTP Security Headers (nginx)

The nginx reverse proxy adds:

- `Content-Security-Policy` — restrictive policy allowing `'self'`, inline scripts/styles (Next.js), `data:`/`blob:` images, and `ws:`/`wss:` WebSockets.
- `Permissions-Policy` — disables camera, microphone, geolocation, and payment APIs.
- `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy` — standard protections.
- `Strict-Transport-Security` — pre-configured and ready to enable when HTTPS is active.

### Production Hardening

- **Swagger/ReDoc disabled** — API documentation endpoints are only served when `DEBUG=true`.
- **CORS tightened** — Explicit method and header allowlists replace wildcards.
- **Health endpoint** — Returns minimal info by default; detailed diagnostics require `?detail=true`.
- **No internal path leakage** — Evidence responses return a `has_file` boolean instead of the server file path.
