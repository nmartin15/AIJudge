"""RAG retriever for Wyoming legal corpus using pgvector similarity search."""

from uuid import UUID

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from engine.llm_client import generate_embedding


async def search_corpus(
    db: AsyncSession,
    query: str,
    limit: int = 5,
    source_type: str | None = None,
    topic: str | None = None,
) -> list[dict]:
    """
    Search the Wyoming legal corpus by semantic similarity.

    Args:
        db: Async database session
        query: Natural language query
        limit: Max number of results
        source_type: Optional filter ("statute", "rule", "guide")
        topic: Optional filter by topic

    Returns:
        List of matching corpus chunks with similarity scores
    """
    query_embedding = await generate_embedding(query)

    # Build the query with optional filters
    filters = []
    params: dict = {"embedding": str(query_embedding), "limit": limit}

    if source_type:
        filters.append("source_type = :source_type")
        params["source_type"] = source_type

    if topic:
        filters.append("topic = :topic")
        params["topic"] = topic

    where_clause = ""
    if filters:
        where_clause = "WHERE " + " AND ".join(filters)

    sql = text(f"""
        SELECT
            id, source_type, source_title, section_number, topic, content,
            1 - (embedding <=> :embedding::vector) AS similarity
        FROM corpus_chunks
        {where_clause}
        ORDER BY embedding <=> :embedding::vector
        LIMIT :limit
    """)

    result = await db.execute(sql, params)
    rows = result.fetchall()

    return [
        {
            "id": str(row.id),
            "source_type": row.source_type,
            "source_title": row.source_title,
            "section_number": row.section_number,
            "topic": row.topic,
            "content": row.content,
            "similarity": round(float(row.similarity), 4),
        }
        for row in rows
    ]


async def get_relevant_rules(
    db: AsyncSession,
    case_type: str,
    claim_description: str,
    limit: int = 8,
) -> list[dict]:
    """
    Retrieve rules relevant to a specific case type and claim.
    Used by the reasoning pipeline to build the legal basis.
    """
    # Combine case type with description for better retrieval
    query = f"Wyoming small claims {case_type}: {claim_description}"
    return await search_corpus(db, query, limit=limit)
