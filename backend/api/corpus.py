"""Corpus search and management API endpoints."""

from fastapi import APIRouter, Depends
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from api.guardrails import FixedWindowRateLimiter, api_error
from api.security import require_admin_session
from config import get_settings
from corpus.ingest import embed_and_prepare_chunks
from corpus.retriever import search_corpus
from db.connection import get_db
from models.database import CorpusChunk, Session
from models.schemas import CorpusSearchRequest, CorpusSearchResult
from personas.archetypes import list_archetypes
from models.schemas import ArchetypeResponse

settings = get_settings()
router = APIRouter()
search_limiter = FixedWindowRateLimiter(
    max_requests=settings.corpus_search_requests_per_minute,
    window_seconds=60,
)
ingest_limiter = FixedWindowRateLimiter(
    max_requests=settings.corpus_ingest_requests_per_hour,
    window_seconds=3600,
)


@router.post("/corpus/search", response_model=list[CorpusSearchResult])
async def search_legal_corpus(
    body: CorpusSearchRequest,
    _admin_session: Session = Depends(require_admin_session),
    db: AsyncSession = Depends(get_db),
):
    """Search the Wyoming legal corpus by semantic similarity."""
    await search_limiter.check(
        key=str(_admin_session.id),
        code="corpus_search_rate_limited",
        message="Corpus search rate limit exceeded. Please retry shortly.",
    )
    results = await search_corpus(db, body.query, limit=body.limit)
    return results


@router.post("/corpus/ingest")
async def ingest_corpus(
    _admin_session: Session = Depends(require_admin_session),
    db: AsyncSession = Depends(get_db),
):
    """
    Ingest (or re-ingest) the Wyoming legal corpus.
    Clears existing chunks and re-embeds everything.
    """
    await ingest_limiter.check(
        key=str(_admin_session.id),
        code="corpus_ingest_rate_limited",
        message="Corpus ingest is rate limited to protect model costs.",
    )

    # Clear existing chunks
    await db.execute(delete(CorpusChunk))
    await db.flush()

    # Generate embeddings and prepare chunks
    prepared = await embed_and_prepare_chunks()
    if not prepared:
        raise api_error(
            status_code=500,
            code="corpus_ingest_failed",
            message="No corpus chunks were prepared during ingest.",
            retryable=True,
        )

    # Insert into database
    for chunk_data in prepared:
        chunk = CorpusChunk(**chunk_data)
        db.add(chunk)

    await db.flush()

    return {
        "status": "success",
        "chunks_ingested": len(prepared),
    }


@router.get("/corpus/stats")
async def corpus_stats(
    _admin_session: Session = Depends(require_admin_session),
    db: AsyncSession = Depends(get_db),
):
    """Get statistics about the ingested corpus."""
    result = await db.execute(
        select(CorpusChunk.source_type, func.count())
        .group_by(CorpusChunk.source_type)
    )
    rows = result.all()

    stats = {source_type: count for source_type, count in rows}
    total = sum(stats.values())

    return {
        "total_chunks": total,
        "by_source_type": stats,
    }


# ─── Archetype Endpoints ──────────────────────────────────────────────────────


@router.get("/archetypes", response_model=list[ArchetypeResponse])
async def get_archetypes():
    """List all available judge archetypes."""
    archetypes = list_archetypes()
    return [
        ArchetypeResponse(
            id=a["id"],
            name=a["name"],
            description=a["description"],
            tone=a["tone"],
            icon=a["icon"],
        )
        for a in archetypes
    ]
