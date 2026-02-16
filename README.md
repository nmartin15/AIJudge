# Wyoming AI Judge

AI-powered small claims court simulation for Wyoming jurisdiction. An educational tool that lets users explore how a small claims case might be decided by presenting both sides of a dispute to an AI judge.

**This is a simulation for educational purposes only. It does not constitute legal advice.**

## Features

- Multi-step case intake with both plaintiff and defendant perspectives
- Four distinct judge archetypes with different judicial temperaments
- Interactive hearing simulation with AI judge questions
- Formal judgment documents with findings of fact, conclusions of law, and citations
- Evidence scoring and reasoning transparency
- Multi-judge comparison to see how different temperaments affect outcomes

## Tech Stack

- **Backend:** Python 3.12 + FastAPI
- **Frontend:** Next.js + TypeScript + Tailwind CSS + shadcn/ui
- **Database:** PostgreSQL + pgvector
- **AI:** Claude (reasoning) + GPT-4o (extraction) + OpenAI embeddings

## Getting Started

### Quick Start (Docker)

The easiest way to run everything — Postgres with pgvector, the backend, and the frontend — is with Docker Compose:

```bash
cp .env.example .env          # Add your OPENAI_API_KEY and ANTHROPIC_API_KEY
docker compose up --build
```

- Frontend: http://localhost:3000
- Backend API: http://localhost:8000
- API docs: http://localhost:8000/docs

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
cp ../.env.example .env       # Edit with your API keys and DB credentials
alembic upgrade head          # Create database tables
uvicorn main:app --reload
```

Backend runs at http://localhost:8000. API docs at http://localhost:8000/docs.

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
  db/              Database connection
frontend/          Next.js frontend application
docker-compose.yml Docker orchestration (Postgres + Backend + Frontend)
```
