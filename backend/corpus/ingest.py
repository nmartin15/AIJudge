"""
Wyoming Small Claims Corpus Ingestion Pipeline.

Loads, chunks, embeds, and stores Wyoming legal materials for RAG retrieval.
Sources include statutes, court rules, bench guides, and self-help materials.
"""

import json
import uuid
from pathlib import Path

from config import get_settings
from engine.llm_client import generate_embedding

settings = get_settings()

SOURCES_DIR = Path(__file__).parent / "sources"


def _load_corpus_data() -> dict:
    corpus_path = SOURCES_DIR / "wyoming_corpus.json"
    with open(corpus_path, encoding="utf-8") as f:
        return json.load(f)


def get_all_corpus_chunks() -> list[dict]:
    """Return all corpus chunks ready for embedding and storage."""
    data = _load_corpus_data()
    chunks: list[dict] = []
    chunks.extend(data.get("statutes", []))
    chunks.extend(data.get("court_rules", []))
    chunks.extend(data.get("judicial_guides", []))
    return chunks


async def embed_and_prepare_chunks() -> list[dict]:
    """Generate embeddings for all corpus chunks. Returns list ready for DB insert."""
    chunks = get_all_corpus_chunks()
    prepared = []

    for chunk in chunks:
        embed_text = f"{chunk['source_title']} {chunk.get('section_number', '')} {chunk.get('topic', '')}\n\n{chunk['content']}"
        embedding = await generate_embedding(embed_text)

        prepared.append(
            {
                "id": uuid.uuid4(),
                "source_type": chunk["source_type"],
                "source_title": chunk["source_title"],
                "section_number": chunk.get("section_number"),
                "topic": chunk.get("topic"),
                "content": chunk["content"],
                "embedding": embedding,
                "metadata_": {
                    "source_type": chunk["source_type"],
                    "topic": chunk.get("topic"),
                },
            }
        )

    return prepared
