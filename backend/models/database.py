"""SQLAlchemy models for the Wyoming AI Judge database."""

import enum
import uuid

from pgvector.sqlalchemy import Vector
from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Column,
    DateTime,
    Enum,
    Float,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import DeclarativeBase, relationship
from sqlalchemy.ext.hybrid import hybrid_property

from db.encrypted_type import EncryptedString


class Base(DeclarativeBase):
    pass


# ─── Enums ────────────────────────────────────────────────────────────────────


class PartyRole(str, enum.Enum):
    plaintiff = "plaintiff"
    defendant = "defendant"


class CaseStatus(str, enum.Enum):
    intake = "intake"
    ready = "ready"
    hearing = "hearing"
    decided = "decided"


class CaseType(str, enum.Enum):
    contract = "contract"
    property_damage = "property_damage"
    security_deposit = "security_deposit"
    loan_debt = "loan_debt"
    consumer = "consumer"
    other = "other"


class EvidenceType(str, enum.Enum):
    document = "document"
    photo = "photo"
    receipt = "receipt"
    text_message = "text_message"
    email = "email"
    contract = "contract"
    other = "other"


class OperatorRole(str, enum.Enum):
    viewer = "viewer"
    admin = "admin"


class HearingMessageRole(str, enum.Enum):
    judge = "judge"
    plaintiff = "plaintiff"
    defendant = "defendant"


# ─── Models ───────────────────────────────────────────────────────────────────


class Session(Base):
    """Anonymous session for case ownership. No auth required."""

    __tablename__ = "sessions"
    __table_args__ = (
        Index("ix_sessions_last_active", "last_active"),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    role = Column(
        Enum(OperatorRole),
        nullable=False,
        default=OperatorRole.viewer,
        server_default=OperatorRole.viewer.value,
    )
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    last_active = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    cases = relationship("Case", back_populates="session", cascade="all, delete-orphan")


class Case(Base):
    """A small claims case with both plaintiff and defendant perspectives."""

    __tablename__ = "cases"
    __table_args__ = (
        Index("ix_cases_session_id", "session_id"),
        Index("ix_cases_status", "status"),
        Index("ix_cases_session_status", "session_id", "status"),
        CheckConstraint("claimed_amount >= 0 AND claimed_amount <= 6000", name="ck_cases_claimed_amount_range"),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    session_id = Column(UUID(as_uuid=True), ForeignKey("sessions.id", ondelete="CASCADE"), nullable=False)
    status = Column(Enum(CaseStatus), default=CaseStatus.intake, server_default=CaseStatus.intake.value, nullable=False)
    case_type = Column(Enum(CaseType), nullable=True)
    case_type_confidence = Column(Float, nullable=True)
    plaintiff_narrative = Column(Text, nullable=True)
    defendant_narrative = Column(Text, nullable=True)
    claimed_amount = Column(Numeric(10, 2), nullable=True)
    damages_breakdown = Column(JSONB, nullable=True)
    archetype_id = Column(String(50), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    session = relationship("Session", back_populates="cases")
    parties = relationship("Party", back_populates="case", cascade="all, delete-orphan")
    evidence = relationship("Evidence", back_populates="case", cascade="all, delete-orphan")
    timeline_events = relationship("TimelineEvent", back_populates="case", cascade="all, delete-orphan")
    hearing = relationship("Hearing", back_populates="case", uselist=False, cascade="all, delete-orphan")
    judgment = relationship("Judgment", back_populates="case", uselist=False, cascade="all, delete-orphan")
    comparison_runs = relationship(
        "ComparisonRun",
        back_populates="case",
        cascade="all, delete-orphan",
        order_by="ComparisonRun.created_at.desc()",
    )


class Party(Base):
    """A party (plaintiff or defendant) in a case."""

    __tablename__ = "parties"
    __table_args__ = (
        UniqueConstraint("case_id", "role", name="uq_parties_case_role"),
        Index("ix_parties_case_id", "case_id"),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    case_id = Column(UUID(as_uuid=True), ForeignKey("cases.id", ondelete="CASCADE"), nullable=False)
    role = Column(Enum(PartyRole), nullable=False)
    name = Column(EncryptedString, nullable=False)
    address = Column(EncryptedString, nullable=True)
    phone = Column(EncryptedString, nullable=True)

    case = relationship("Case", back_populates="parties")


class Evidence(Base):
    """A piece of evidence submitted by one party."""

    __tablename__ = "evidence"
    __table_args__ = (
        Index("ix_evidence_case_id", "case_id"),
        CheckConstraint("score >= 0 AND score <= 3", name="ck_evidence_score_range"),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    case_id = Column(UUID(as_uuid=True), ForeignKey("cases.id", ondelete="CASCADE"), nullable=False)
    submitted_by = Column(Enum(PartyRole), nullable=False)
    evidence_type = Column(Enum(EvidenceType), nullable=False)
    title = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    file_path = Column(String(500), nullable=True)
    score = Column(Integer, nullable=True)  # 0-3 evidence strength scale
    score_explanation = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    case = relationship("Case", back_populates="evidence")

    @hybrid_property
    def has_file(self) -> bool:
        return self.file_path is not None


class TimelineEvent(Base):
    """A key event in the case timeline, potentially disputed."""

    __tablename__ = "case_timeline"
    __table_args__ = (
        Index("ix_case_timeline_case_id", "case_id"),
        Index("ix_case_timeline_case_date", "case_id", "event_date"),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    case_id = Column(UUID(as_uuid=True), ForeignKey("cases.id", ondelete="CASCADE"), nullable=False)
    event_date = Column(DateTime(timezone=True), nullable=False)
    description = Column(Text, nullable=False)
    source = Column(Enum(PartyRole), nullable=True)  # who claims this happened
    disputed = Column(Boolean, default=False, server_default="false", nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    case = relationship("Case", back_populates="timeline_events")


class Hearing(Base):
    """A hearing simulation session for a case."""

    __tablename__ = "hearings"

    # case_id unique constraint already creates an implicit index
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    case_id = Column(UUID(as_uuid=True), ForeignKey("cases.id", ondelete="CASCADE"), nullable=False, unique=True)
    archetype_id = Column(String(50), nullable=False)
    started_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    completed_at = Column(DateTime(timezone=True), nullable=True)

    case = relationship("Case", back_populates="hearing")
    messages = relationship(
        "HearingMessage",
        back_populates="hearing",
        cascade="all, delete-orphan",
        order_by="HearingMessage.sequence",
    )


class HearingMessage(Base):
    """A single message in a hearing simulation (judge question or party response)."""

    __tablename__ = "hearing_messages"
    __table_args__ = (
        Index("ix_hearing_messages_hearing_id", "hearing_id"),
        UniqueConstraint("hearing_id", "sequence", name="uq_hearing_messages_hearing_seq"),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    hearing_id = Column(UUID(as_uuid=True), ForeignKey("hearings.id", ondelete="CASCADE"), nullable=False)
    role = Column(Enum(HearingMessageRole), nullable=False)
    content = Column(Text, nullable=False)
    sequence = Column(Integer, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    hearing = relationship("Hearing", back_populates="messages")


class JudgmentColumnsMixin:
    """Columns shared between Judgment and ComparisonResult.

    Keeps the judgment schema DRY — any column added here is automatically
    available in both single-judge judgments and multi-judge comparison results.
    """

    findings_of_fact = Column(JSONB, nullable=False)
    conclusions_of_law = Column(JSONB, nullable=False)
    judgment_text = Column(Text, nullable=False)
    rationale = Column(Text, nullable=False)
    awarded_amount = Column(Numeric(10, 2), nullable=True)
    in_favor_of = Column(Enum(PartyRole), nullable=False)
    evidence_scores = Column(JSONB, nullable=True)
    reasoning_chain = Column(JSONB, nullable=True)


class Judgment(JudgmentColumnsMixin, Base):
    """AI-generated judgment with full reasoning chain and formal document."""

    __tablename__ = "judgments"
    __table_args__ = (
        CheckConstraint("awarded_amount >= 0", name="ck_judgments_awarded_amount_positive"),
    )

    # case_id unique constraint already creates an implicit index
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    case_id = Column(UUID(as_uuid=True), ForeignKey("cases.id", ondelete="CASCADE"), nullable=False, unique=True)
    archetype_id = Column(String(50), nullable=False)
    advisory = Column(JSONB, nullable=True)  # case strategy and recommendations
    prompt_version_id = Column(UUID(as_uuid=True), ForeignKey("prompt_versions.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    case = relationship("Case", back_populates="judgment")
    prompt_version = relationship("PromptVersion")


class ComparisonRun(Base):
    """Persisted multi-judge comparison execution for a case snapshot."""

    __tablename__ = "comparison_runs"
    __table_args__ = (
        UniqueConstraint("case_id", "run_key", name="uq_comparison_case_run_key"),
        Index("ix_comparison_runs_case_id", "case_id"),
        Index("ix_comparison_runs_case_created", "case_id", "created_at"),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    case_id = Column(UUID(as_uuid=True), ForeignKey("cases.id", ondelete="CASCADE"), nullable=False)
    run_key = Column(String(128), nullable=False)
    archetype_ids = Column(JSONB, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    case = relationship("Case", back_populates="comparison_runs")
    results = relationship(
        "ComparisonResult",
        back_populates="run",
        cascade="all, delete-orphan",
        order_by="ComparisonResult.archetype_id",
    )


class ComparisonResult(JudgmentColumnsMixin, Base):
    """Single judge output stored under a comparison run."""

    __tablename__ = "comparison_results"
    __table_args__ = (
        UniqueConstraint("run_id", "archetype_id", name="uq_comparison_run_archetype"),
        Index("ix_comparison_results_run_id", "run_id"),
        CheckConstraint("awarded_amount >= 0", name="ck_comparison_results_awarded_amount_positive"),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    run_id = Column(UUID(as_uuid=True), ForeignKey("comparison_runs.id", ondelete="CASCADE"), nullable=False)
    archetype_id = Column(String(50), nullable=False)
    metadata_ = Column("metadata", JSONB, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    run = relationship("ComparisonRun", back_populates="results")


class CorpusChunk(Base):
    """A chunk of the Wyoming legal corpus with vector embedding for RAG."""

    __tablename__ = "corpus_chunks"
    __table_args__ = (
        Index("ix_corpus_chunks_source_type", "source_type"),
        Index("ix_corpus_chunks_topic", "topic"),
        # HNSW index for fast approximate nearest-neighbor search on embeddings.
        # vector_cosine_ops matches the <=> (cosine distance) operator used in queries.
        # m=16 and ef_construction=64 are good defaults for moderate corpus sizes.
        Index(
            "ix_corpus_chunks_embedding_hnsw",
            "embedding",
            postgresql_using="hnsw",
            postgresql_with={"m": 16, "ef_construction": 64},
            postgresql_ops={"embedding": "vector_cosine_ops"},
        ),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    source_type = Column(String(50), nullable=False)  # "statute", "rule", "guide"
    source_title = Column(String(255), nullable=False)
    section_number = Column(String(50), nullable=True)
    topic = Column(String(100), nullable=True)
    content = Column(Text, nullable=False)
    embedding = Column(Vector(1536))  # text-embedding-3-small dimensions
    metadata_ = Column("metadata", JSONB, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class LLMCall(Base):
    """Tracks every LLM API call for cost monitoring and debugging."""

    __tablename__ = "llm_calls"
    __table_args__ = (
        Index("ix_llm_calls_case_id", "case_id"),
        Index("ix_llm_calls_created_at", "created_at"),
        Index("ix_llm_calls_pipeline_step", "pipeline_step"),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    case_id = Column(UUID(as_uuid=True), ForeignKey("cases.id", ondelete="SET NULL"), nullable=True)
    pipeline_step = Column(String(50), nullable=False)
    model = Column(String(50), nullable=False)
    input_tokens = Column(Integer, nullable=False)
    output_tokens = Column(Integer, nullable=False)
    cost_usd = Column(Numeric(10, 6), nullable=False)
    latency_ms = Column(Integer, nullable=False)
    prompt_version_id = Column(UUID(as_uuid=True), ForeignKey("prompt_versions.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class ClaimMatter(Base):
    """A security-deposit file. Not a wizard case."""

    __tablename__ = "claim_matters"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    step = Column(String(40), nullable=False, default="welcome", server_default="welcome")
    owner = Column(String(16), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    sides = relationship("ClaimSide", back_populates="matter", cascade="all, delete-orphan")


class ClaimSide(Base):
    """One person's header on a deposit file. Claims hang off this row."""

    __tablename__ = "claim_sides"
    __table_args__ = (
        UniqueConstraint("matter_id", "owner", name="uq_claim_sides_matter_owner"),
        Index("ix_claim_sides_matter_id", "matter_id"),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    matter_id = Column(UUID(as_uuid=True), ForeignKey("claim_matters.id", ondelete="CASCADE"), nullable=False)
    owner = Column(String(16), nullable=False)
    name = Column(String(200), nullable=False, default="", server_default="")
    other_name = Column(String(200), nullable=False, default="", server_default="")
    amount = Column(String(32), nullable=False, default="", server_default="")
    wants = Column(Text, nullable=False, default="", server_default="")
    private_gaps = Column(JSONB, nullable=False, default=list, server_default="[]")
    disputes = Column(JSONB, nullable=False, default=list, server_default="[]")

    matter = relationship("ClaimMatter", back_populates="sides")
    claims = relationship(
        "ClaimEntry",
        back_populates="side",
        cascade="all, delete-orphan",
        order_by="ClaimEntry.position",
    )


class ClaimEntry(Base):
    """One claim on the page: text, date, and the documents under it."""

    __tablename__ = "claim_entries"
    __table_args__ = (
        UniqueConstraint("side_id", "client_id", name="uq_claim_entries_side_client"),
        Index("ix_claim_entries_side_id", "side_id"),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    side_id = Column(UUID(as_uuid=True), ForeignKey("claim_sides.id", ondelete="CASCADE"), nullable=False)
    client_id = Column(String(120), nullable=False)
    text = Column(Text, nullable=False, default="", server_default="")
    claim_date = Column(String(10), nullable=False)
    position = Column(Integer, nullable=False, default=0, server_default="0")

    side = relationship("ClaimSide", back_populates="claims")
    files = relationship(
        "ClaimDocument",
        back_populates="entry",
        cascade="all, delete-orphan",
        order_by="ClaimDocument.position",
    )


class ClaimDocument(Base):
    """A document attached to one claim."""

    __tablename__ = "claim_documents"
    __table_args__ = (
        UniqueConstraint("entry_id", "client_id", name="uq_claim_documents_entry_client"),
        Index("ix_claim_documents_entry_id", "entry_id"),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    entry_id = Column(UUID(as_uuid=True), ForeignKey("claim_entries.id", ondelete="CASCADE"), nullable=False)
    client_id = Column(String(400), nullable=False)
    title = Column(String(300), nullable=False, default="", server_default="")
    kind = Column(String(120), nullable=False, default="", server_default="")
    lines = Column(JSONB, nullable=False, default=list, server_default="[]")
    position = Column(Integer, nullable=False, default=0, server_default="0")

    entry = relationship("ClaimEntry", back_populates="files")


class PromptVersion(Base):
    """Versioned prompt for reproducibility and A/B testing."""

    __tablename__ = "prompt_versions"
    __table_args__ = (
        UniqueConstraint("step", "version", name="uq_prompt_versions_step_version"),
        Index("ix_prompt_versions_step_active", "step", "is_active"),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(100), nullable=False)
    step = Column(String(50), nullable=False)  # which pipeline step this prompt is for
    version = Column(Integer, nullable=False)
    content = Column(Text, nullable=False)
    is_active = Column(Boolean, default=True, server_default="true", nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
