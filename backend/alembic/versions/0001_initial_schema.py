"""Initial schema — all tables from models.database.

Revision ID: 0001
Revises:
Create Date: 2026-02-14
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "0001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Enable pgvector extension
    op.execute("CREATE EXTENSION IF NOT EXISTS vector")

    # ── sessions ─────────────────────────────────────────────────────
    op.create_table(
        "sessions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "role",
            sa.Enum("viewer", "admin", name="operatorrole", create_type=True),
            nullable=False,
            server_default="viewer",
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "last_active",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )
    op.create_index("ix_sessions_last_active", "sessions", ["last_active"])

    # ── prompt_versions ──────────────────────────────────────────────
    op.create_table(
        "prompt_versions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("step", sa.String(50), nullable=False),
        sa.Column("version", sa.Integer, nullable=False),
        sa.Column("content", sa.Text, nullable=False),
        sa.Column(
            "is_active",
            sa.Boolean,
            nullable=False,
            server_default="true",
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.UniqueConstraint("step", "version", name="uq_prompt_versions_step_version"),
    )
    op.create_index(
        "ix_prompt_versions_step_active",
        "prompt_versions",
        ["step", "is_active"],
    )

    # ── cases ────────────────────────────────────────────────────────
    op.create_table(
        "cases",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "session_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("sessions.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "status",
            sa.Enum(
                "intake",
                "ready",
                "hearing",
                "decided",
                name="casestatus",
                create_type=True,
            ),
            nullable=False,
            server_default="intake",
        ),
        sa.Column(
            "case_type",
            sa.Enum(
                "contract",
                "property_damage",
                "security_deposit",
                "loan_debt",
                "consumer",
                "other",
                name="casetype",
                create_type=True,
            ),
            nullable=True,
        ),
        sa.Column("case_type_confidence", sa.Float, nullable=True),
        sa.Column("plaintiff_narrative", sa.Text, nullable=True),
        sa.Column("defendant_narrative", sa.Text, nullable=True),
        sa.Column("claimed_amount", sa.Numeric(10, 2), nullable=True),
        sa.Column("damages_breakdown", postgresql.JSONB, nullable=True),
        sa.Column("archetype_id", sa.String(50), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.CheckConstraint(
            "claimed_amount >= 0 AND claimed_amount <= 6000",
            name="ck_cases_claimed_amount_range",
        ),
    )
    op.create_index("ix_cases_session_id", "cases", ["session_id"])
    op.create_index("ix_cases_status", "cases", ["status"])
    op.create_index("ix_cases_session_status", "cases", ["session_id", "status"])

    # ── parties ──────────────────────────────────────────────────────
    op.create_table(
        "parties",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "case_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("cases.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "role",
            sa.Enum("plaintiff", "defendant", name="partyrole", create_type=True),
            nullable=False,
        ),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("address", sa.Text, nullable=True),
        sa.Column("phone", sa.String(20), nullable=True),
        sa.UniqueConstraint("case_id", "role", name="uq_parties_case_role"),
    )
    op.create_index("ix_parties_case_id", "parties", ["case_id"])

    # ── evidence ─────────────────────────────────────────────────────
    op.create_table(
        "evidence",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "case_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("cases.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "submitted_by",
            sa.Enum("plaintiff", "defendant", name="partyrole", create_type=False),
            nullable=False,
        ),
        sa.Column(
            "evidence_type",
            sa.Enum(
                "document",
                "photo",
                "receipt",
                "text_message",
                "email",
                "contract",
                "other",
                name="evidencetype",
                create_type=True,
            ),
            nullable=False,
        ),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("file_path", sa.String(500), nullable=True),
        sa.Column("score", sa.Integer, nullable=True),
        sa.Column("score_explanation", sa.Text, nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.CheckConstraint("score >= 0 AND score <= 3", name="ck_evidence_score_range"),
    )
    op.create_index("ix_evidence_case_id", "evidence", ["case_id"])

    # ── case_timeline ────────────────────────────────────────────────
    op.create_table(
        "case_timeline",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "case_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("cases.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("event_date", sa.DateTime(timezone=True), nullable=False),
        sa.Column("description", sa.Text, nullable=False),
        sa.Column(
            "source",
            sa.Enum("plaintiff", "defendant", name="partyrole", create_type=False),
            nullable=True,
        ),
        sa.Column(
            "disputed",
            sa.Boolean,
            nullable=False,
            server_default="false",
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )
    op.create_index("ix_case_timeline_case_id", "case_timeline", ["case_id"])
    op.create_index(
        "ix_case_timeline_case_date",
        "case_timeline",
        ["case_id", "event_date"],
    )

    # ── hearings ─────────────────────────────────────────────────────
    op.create_table(
        "hearings",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "case_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("cases.id", ondelete="CASCADE"),
            nullable=False,
            unique=True,
        ),
        sa.Column("archetype_id", sa.String(50), nullable=False),
        sa.Column(
            "started_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
    )

    # ── hearing_messages ─────────────────────────────────────────────
    op.create_table(
        "hearing_messages",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "hearing_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("hearings.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "role",
            sa.Enum(
                "judge",
                "plaintiff",
                "defendant",
                name="hearingmessagerole",
                create_type=True,
            ),
            nullable=False,
        ),
        sa.Column("content", sa.Text, nullable=False),
        sa.Column("sequence", sa.Integer, nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )
    op.create_index(
        "ix_hearing_messages_hearing_id",
        "hearing_messages",
        ["hearing_id"],
    )
    op.execute(
        "ALTER TABLE hearing_messages "
        "ADD CONSTRAINT uq_hearing_messages_hearing_seq UNIQUE (hearing_id, sequence)"
    )

    # ── judgments ─────────────────────────────────────────────────────
    op.create_table(
        "judgments",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "case_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("cases.id", ondelete="CASCADE"),
            nullable=False,
            unique=True,
        ),
        sa.Column("archetype_id", sa.String(50), nullable=False),
        sa.Column("findings_of_fact", postgresql.JSONB, nullable=False),
        sa.Column("conclusions_of_law", postgresql.JSONB, nullable=False),
        sa.Column("judgment_text", sa.Text, nullable=False),
        sa.Column("rationale", sa.Text, nullable=False),
        sa.Column("awarded_amount", sa.Numeric(10, 2), nullable=True),
        sa.Column(
            "in_favor_of",
            sa.Enum("plaintiff", "defendant", name="partyrole", create_type=False),
            nullable=False,
        ),
        sa.Column("evidence_scores", postgresql.JSONB, nullable=True),
        sa.Column("reasoning_chain", postgresql.JSONB, nullable=True),
        sa.Column(
            "prompt_version_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("prompt_versions.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.CheckConstraint("awarded_amount >= 0", name="ck_judgments_awarded_amount_positive"),
    )

    # ── comparison_runs ──────────────────────────────────────────────
    op.create_table(
        "comparison_runs",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "case_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("cases.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("run_key", sa.String(128), nullable=False),
        sa.Column("archetype_ids", postgresql.JSONB, nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.UniqueConstraint(
            "case_id", "run_key", name="uq_comparison_case_run_key"
        ),
    )
    op.create_index("ix_comparison_runs_case_id", "comparison_runs", ["case_id"])
    op.create_index(
        "ix_comparison_runs_case_created",
        "comparison_runs",
        ["case_id", "created_at"],
    )

    # ── comparison_results ───────────────────────────────────────────
    op.create_table(
        "comparison_results",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "run_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("comparison_runs.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("archetype_id", sa.String(50), nullable=False),
        sa.Column("findings_of_fact", postgresql.JSONB, nullable=False),
        sa.Column("conclusions_of_law", postgresql.JSONB, nullable=False),
        sa.Column("judgment_text", sa.Text, nullable=False),
        sa.Column("rationale", sa.Text, nullable=False),
        sa.Column("awarded_amount", sa.Numeric(10, 2), nullable=True),
        sa.Column(
            "in_favor_of",
            sa.Enum("plaintiff", "defendant", name="partyrole", create_type=False),
            nullable=False,
        ),
        sa.Column("evidence_scores", postgresql.JSONB, nullable=True),
        sa.Column("reasoning_chain", postgresql.JSONB, nullable=True),
        sa.Column("metadata", postgresql.JSONB, nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.UniqueConstraint(
            "run_id", "archetype_id", name="uq_comparison_run_archetype"
        ),
        sa.CheckConstraint("awarded_amount >= 0", name="ck_comparison_results_awarded_amount_positive"),
    )
    op.create_index(
        "ix_comparison_results_run_id",
        "comparison_results",
        ["run_id"],
    )

    # ── corpus_chunks ────────────────────────────────────────────────
    op.create_table(
        "corpus_chunks",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("source_type", sa.String(50), nullable=False),
        sa.Column("source_title", sa.String(255), nullable=False),
        sa.Column("section_number", sa.String(50), nullable=True),
        sa.Column("topic", sa.String(100), nullable=True),
        sa.Column("content", sa.Text, nullable=False),
        # embedding column added via raw SQL (pgvector type)
        sa.Column("metadata", postgresql.JSONB, nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )
    # The embedding column needs the vector type — add via raw SQL
    op.execute(
        "ALTER TABLE corpus_chunks ADD COLUMN embedding vector(1536)"
    )
    op.create_index("ix_corpus_chunks_source_type", "corpus_chunks", ["source_type"])
    op.create_index("ix_corpus_chunks_topic", "corpus_chunks", ["topic"])
    # HNSW index for vector similarity search
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS ix_corpus_chunks_embedding_hnsw
        ON corpus_chunks
        USING hnsw (embedding vector_cosine_ops)
        WITH (m = 16, ef_construction = 64)
        """
    )

    # ── llm_calls ────────────────────────────────────────────────────
    op.create_table(
        "llm_calls",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "case_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("cases.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("pipeline_step", sa.String(50), nullable=False),
        sa.Column("model", sa.String(50), nullable=False),
        sa.Column("input_tokens", sa.Integer, nullable=False),
        sa.Column("output_tokens", sa.Integer, nullable=False),
        sa.Column("cost_usd", sa.Numeric(10, 6), nullable=False),
        sa.Column("latency_ms", sa.Integer, nullable=False),
        sa.Column(
            "prompt_version_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("prompt_versions.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )
    op.create_index("ix_llm_calls_case_id", "llm_calls", ["case_id"])
    op.create_index("ix_llm_calls_created_at", "llm_calls", ["created_at"])
    op.create_index("ix_llm_calls_pipeline_step", "llm_calls", ["pipeline_step"])


def downgrade() -> None:
    op.drop_table("llm_calls")
    op.drop_table("corpus_chunks")
    op.drop_table("comparison_results")
    op.drop_table("comparison_runs")
    op.drop_table("judgments")
    op.drop_table("hearing_messages")
    op.drop_table("hearings")
    op.drop_table("case_timeline")
    op.drop_table("evidence")
    op.drop_table("parties")
    op.drop_table("cases")
    op.drop_table("prompt_versions")
    op.drop_table("sessions")

    # Drop enum types
    op.execute("DROP TYPE IF EXISTS hearingmessagerole")
    op.execute("DROP TYPE IF EXISTS evidencetype")
    op.execute("DROP TYPE IF EXISTS casetype")
    op.execute("DROP TYPE IF EXISTS casestatus")
    op.execute("DROP TYPE IF EXISTS partyrole")
    op.execute("DROP TYPE IF EXISTS operatorrole")

    op.execute("DROP EXTENSION IF EXISTS vector")
