"""Split a claim file into side, claim, and document rows.

Revision ID: 0004
Revises: 0003
Create Date: 2026-11-16
"""
import json
import uuid
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0004"
down_revision: Union[str, None] = "0003"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("claim_matters", sa.Column("step", sa.String(length=40), nullable=True))
    op.add_column("claim_matters", sa.Column("owner", sa.String(length=16), nullable=True))
    op.create_table(
        "claim_sides",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("matter_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("claim_matters.id", ondelete="CASCADE"), nullable=False),
        sa.Column("owner", sa.String(length=16), nullable=False),
        sa.Column("name", sa.String(length=200), nullable=False, server_default=""),
        sa.Column("other_name", sa.String(length=200), nullable=False, server_default=""),
        sa.Column("amount", sa.String(length=32), nullable=False, server_default=""),
        sa.Column("wants", sa.Text(), nullable=False, server_default=""),
        sa.Column("private_gaps", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.Column("disputes", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.UniqueConstraint("matter_id", "owner", name="uq_claim_sides_matter_owner"),
    )
    op.create_index("ix_claim_sides_matter_id", "claim_sides", ["matter_id"])
    op.create_table(
        "claim_entries",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("side_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("claim_sides.id", ondelete="CASCADE"), nullable=False),
        sa.Column("client_id", sa.String(length=120), nullable=False),
        sa.Column("text", sa.Text(), nullable=False, server_default=""),
        sa.Column("claim_date", sa.String(length=10), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False, server_default="0"),
        sa.UniqueConstraint("side_id", "client_id", name="uq_claim_entries_side_client"),
    )
    op.create_index("ix_claim_entries_side_id", "claim_entries", ["side_id"])
    op.create_table(
        "claim_documents",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("entry_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("claim_entries.id", ondelete="CASCADE"), nullable=False),
        sa.Column("client_id", sa.String(length=400), nullable=False),
        sa.Column("title", sa.String(length=300), nullable=False, server_default=""),
        sa.Column("kind", sa.String(length=120), nullable=False, server_default=""),
        sa.Column("lines", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.Column("position", sa.Integer(), nullable=False, server_default="0"),
        sa.UniqueConstraint("entry_id", "client_id", name="uq_claim_documents_entry_client"),
    )
    op.create_index("ix_claim_documents_entry_id", "claim_documents", ["entry_id"])

    bind = op.get_bind()
    matters = bind.execute(sa.text("SELECT id, payload FROM claim_matters")).mappings().all()
    for matter in matters:
        payload = matter["payload"] or {}
        if isinstance(payload, str):
            payload = json.loads(payload)
        bind.execute(
            sa.text("UPDATE claim_matters SET step = :step, owner = :owner WHERE id = :id"),
            {"id": matter["id"], "step": payload.get("step") or "welcome", "owner": payload.get("owner")},
        )
        for owner, side in (payload.get("sides") or {}).items():
            if owner not in ("alex", "jordan") or not isinstance(side, dict):
                continue
            side_id = uuid.uuid4()
            bind.execute(
                sa.text(
                    """
                    INSERT INTO claim_sides
                      (id, matter_id, owner, name, other_name, amount, wants, private_gaps, disputes)
                    VALUES
                      (:id, :matter_id, :owner, :name, :other_name, :amount, :wants, CAST(:private_gaps AS jsonb), CAST(:disputes AS jsonb))
                    """
                ),
                {
                    "id": side_id,
                    "matter_id": matter["id"],
                    "owner": owner,
                    "name": side.get("name") or "",
                    "other_name": side.get("otherName") or "",
                    "amount": str(side.get("amount") or ""),
                    "wants": side.get("wants") or "",
                    "private_gaps": json.dumps(side.get("privateGaps") or []),
                    "disputes": json.dumps(side.get("disputes") or []),
                },
            )
            for index, claim in enumerate(side.get("claims") or []):
                if not isinstance(claim, dict) or not claim.get("id"):
                    continue
                entry_id = uuid.uuid4()
                bind.execute(
                    sa.text(
                        """
                        INSERT INTO claim_entries (id, side_id, client_id, text, claim_date, position)
                        VALUES (:id, :side_id, :client_id, :text, :claim_date, :position)
                        """
                    ),
                    {
                        "id": entry_id,
                        "side_id": side_id,
                        "client_id": str(claim["id"])[:120],
                        "text": claim.get("text") or "",
                        "claim_date": str(claim.get("date") or "")[:10],
                        "position": index,
                    },
                )
                for file_index, file in enumerate(claim.get("files") or []):
                    if not isinstance(file, dict) or not file.get("id"):
                        continue
                    bind.execute(
                        sa.text(
                            """
                            INSERT INTO claim_documents
                              (id, entry_id, client_id, title, kind, lines, position)
                            VALUES
                              (:id, :entry_id, :client_id, :title, :kind, CAST(:lines AS jsonb), :position)
                            """
                        ),
                        {
                            "id": uuid.uuid4(),
                            "entry_id": entry_id,
                            "client_id": str(file["id"])[:400],
                            "title": str(file.get("title") or "")[:300],
                            "kind": str(file.get("kind") or "")[:120],
                            "lines": json.dumps(file.get("lines") or []),
                            "position": file_index,
                        },
                    )

    op.execute("UPDATE claim_matters SET step = 'welcome' WHERE step IS NULL")
    op.alter_column("claim_matters", "step", nullable=False, server_default="welcome")
    op.drop_column("claim_matters", "payload")


def downgrade() -> None:
    op.add_column(
        "claim_matters",
        sa.Column("payload", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    )
    op.execute("UPDATE claim_matters SET payload = '{}'::jsonb WHERE payload IS NULL")
    op.alter_column("claim_matters", "payload", nullable=False)
    op.drop_index("ix_claim_documents_entry_id", table_name="claim_documents")
    op.drop_table("claim_documents")
    op.drop_index("ix_claim_entries_side_id", table_name="claim_entries")
    op.drop_table("claim_entries")
    op.drop_index("ix_claim_sides_matter_id", table_name="claim_sides")
    op.drop_table("claim_sides")
    op.drop_column("claim_matters", "owner")
    op.drop_column("claim_matters", "step")
