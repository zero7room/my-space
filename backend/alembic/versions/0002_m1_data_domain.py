"""Create M1 data and domain schema.

Revision ID: 0002_m1_data_domain
Revises: 0001_init
Create Date: 2026-05-09 00:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "0002_m1_data_domain"
down_revision: str | None = "0001_init"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

SCHEMA = "app"


def uuid_pk() -> sa.Column[str]:
    return sa.Column(
        "id",
        sa.String(36),
        primary_key=True,
        server_default=sa.text("gen_random_uuid()::text"),
    )


def jsonb_default() -> sa.Column[dict[str, object]]:
    return sa.Column(
        "extra",
        postgresql.JSONB(astext_type=sa.Text()),
        nullable=False,
        server_default=sa.text("'{}'::jsonb"),
    )


def jsonb_list_column(name: str) -> sa.Column[list[object]]:
    return sa.Column(
        name,
        postgresql.JSONB(astext_type=sa.Text()),
        nullable=False,
        server_default=sa.text("'[]'::jsonb"),
    )


def upgrade() -> None:
    op.create_table(
        "company",
        uuid_pk(),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("country", sa.String(16)),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.UniqueConstraint("name"),
        schema=SCHEMA,
    )
    op.create_table(
        "stock",
        uuid_pk(),
        sa.Column("symbol", sa.String(32), nullable=False),
        sa.Column("exchange", sa.String(32), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("company_id", sa.String(36), nullable=False),
        sa.Column("currency", sa.String(8)),
        sa.Column(
            "raw", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default="{}"
        ),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.ForeignKeyConstraint(["company_id"], [f"{SCHEMA}.company.id"]),
        sa.UniqueConstraint("symbol", "exchange"),
        schema=SCHEMA,
    )
    op.create_table(
        "product",
        sa.Column("id", sa.String(80), primary_key=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("category", sa.String(80)),
        sa.Column(
            "raw", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default="{}"
        ),
        sa.UniqueConstraint("name"),
        schema=SCHEMA,
    )
    op.create_table(
        "commodity",
        sa.Column("id", sa.String(80), primary_key=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("unit", sa.String(32)),
        sa.Column("currency", sa.String(8)),
        sa.Column(
            "raw", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default="{}"
        ),
        sa.UniqueConstraint("name"),
        schema=SCHEMA,
    )
    op.create_table(
        "market_variable",
        sa.Column("id", sa.String(80), primary_key=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("source", sa.String(80), nullable=False),
        sa.Column("unit", sa.String(32)),
        sa.Column(
            "raw", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default="{}"
        ),
        schema=SCHEMA,
    )
    op.create_table(
        "market_event",
        sa.Column("id", sa.String(80), primary_key=True),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("occurred_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("source", sa.String(80), nullable=False),
        sa.Column(
            "raw", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default="{}"
        ),
        schema=SCHEMA,
    )
    op.create_table(
        "sector_canonical",
        sa.Column("id", sa.String(80), primary_key=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("type", sa.String(32), nullable=False),
        sa.Column("profile", sa.String(32)),
        sa.Column(
            "raw", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default="{}"
        ),
        sa.CheckConstraint(
            "type in ('industry', 'concept', 'index', 'region', 'theme')",
            name="ck_sector_canonical_sector_canonical_type",
        ),
        sa.UniqueConstraint("name"),
        schema=SCHEMA,
    )
    op.create_table(
        "sector_provider",
        uuid_pk(),
        sa.Column("provider", sa.String(80), nullable=False),
        sa.Column("provider_code", sa.String(80), nullable=False),
        sa.Column("provider_name", sa.String(255), nullable=False),
        sa.Column(
            "raw", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default="{}"
        ),
        sa.UniqueConstraint("provider", "provider_code"),
        schema=SCHEMA,
    )
    op.create_table(
        "sector_mapping",
        uuid_pk(),
        sa.Column("provider_sector_id", sa.String(36), nullable=False),
        sa.Column("canonical_sector_id", sa.String(80), nullable=False),
        sa.Column("relevance", sa.Numeric(6, 4), nullable=False),
        sa.Column("as_of", sa.Date(), nullable=False),
        jsonb_list_column("evidence"),
        sa.CheckConstraint("relevance >= 0 and relevance <= 1", name="ck_sector_mapping_relevance"),
        sa.ForeignKeyConstraint(["provider_sector_id"], [f"{SCHEMA}.sector_provider.id"]),
        sa.ForeignKeyConstraint(["canonical_sector_id"], [f"{SCHEMA}.sector_canonical.id"]),
        sa.UniqueConstraint("provider_sector_id", "canonical_sector_id", "as_of"),
        schema=SCHEMA,
    )
    op.create_table(
        "sector_membership",
        uuid_pk(),
        sa.Column("stock_id", sa.String(36), nullable=False),
        sa.Column("sector_id", sa.String(80), nullable=False),
        sa.Column("relevance", sa.Numeric(6, 4), nullable=False, server_default="0.7000"),
        sa.Column("confidence", sa.Numeric(6, 4), nullable=False, server_default="0.8000"),
        sa.Column(
            "eligible",
            sa.Boolean(),
            sa.Computed("(relevance * confidence) >= 0.5", persisted=True),
            nullable=False,
        ),
        sa.Column("as_of", sa.Date(), nullable=False),
        jsonb_list_column("evidence"),
        sa.CheckConstraint(
            "relevance >= 0 and relevance <= 1", name="ck_sector_membership_relevance"
        ),
        sa.CheckConstraint(
            "confidence >= 0 and confidence <= 1", name="ck_sector_membership_confidence"
        ),
        sa.ForeignKeyConstraint(["stock_id"], [f"{SCHEMA}.stock.id"]),
        sa.ForeignKeyConstraint(["sector_id"], [f"{SCHEMA}.sector_canonical.id"]),
        sa.UniqueConstraint("stock_id", "sector_id", "as_of"),
        schema=SCHEMA,
    )
    op.create_table(
        "evidence",
        uuid_pk(),
        sa.Column("type", sa.String(40), nullable=False),
        sa.Column("source", sa.String(120), nullable=False),
        sa.Column("url_or_path", sa.Text()),
        sa.Column("title", sa.String(255)),
        sa.Column("excerpt", sa.String(200)),
        sa.Column("observed_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("hash", sa.String(128), nullable=False),
        sa.Column("lang", sa.String(8)),
        sa.Column(
            "extra", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default="{}"
        ),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.UniqueConstraint("hash"),
        schema=SCHEMA,
    )
    op.create_index(
        "ix_evidence_type_observed_at",
        "evidence",
        ["type", sa.text("observed_at DESC")],
        schema=SCHEMA,
    )
    op.create_table(
        "edge",
        uuid_pk(),
        sa.Column("type", sa.String(80), nullable=False),
        sa.Column("from_entity_type", sa.String(40), nullable=False),
        sa.Column("from_entity_id", sa.String(80), nullable=False),
        sa.Column("to_entity_type", sa.String(40), nullable=False),
        sa.Column("to_entity_id", sa.String(80), nullable=False),
        sa.Column("direction", sa.String(24), nullable=False),
        sa.Column("strength", sa.Numeric(6, 4), nullable=False),
        sa.Column("confidence", sa.Numeric(6, 4), nullable=False),
        sa.Column("relation_class", sa.String(24), nullable=False),
        jsonb_list_column("evidence"),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.Column("expires_hint", sa.DateTime(timezone=True)),
        sa.Column("revoked_at", sa.DateTime(timezone=True)),
        sa.Column("revoked_reason", sa.Text()),
        sa.Column("revoked_by", sa.String(36)),
        sa.Column(
            "extra", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default="{}"
        ),
        sa.CheckConstraint(
            "relation_class in ('fact', 'statistical', 'inferred')",
            name="ck_edge_edge_relation_class",
        ),
        sa.CheckConstraint(
            "direction in ('positive', 'negative', 'nonlinear', 'uncertain')",
            name="ck_edge_edge_direction",
        ),
        sa.CheckConstraint("strength >= 0 and strength <= 1", name="ck_edge_strength"),
        sa.CheckConstraint("confidence >= 0 and confidence <= 1", name="ck_edge_confidence"),
        sa.ForeignKeyConstraint(["revoked_by"], [f"{SCHEMA}.evidence.id"]),
        schema=SCHEMA,
    )
    op.create_index(
        "uq_edge_active_identity",
        "edge",
        [
            "type",
            "from_entity_type",
            "from_entity_id",
            "to_entity_type",
            "to_entity_id",
            "relation_class",
        ],
        unique=True,
        schema=SCHEMA,
        postgresql_where=sa.text("revoked_at IS NULL"),
    )
    for table_name in ("financial_metric", "market_metric"):
        op.create_table(
            table_name,
            uuid_pk(),
            sa.Column("subject_type", sa.String(40), nullable=False),
            sa.Column("subject_id", sa.String(80), nullable=False),
            sa.Column("metric_name", sa.String(120), nullable=False),
            sa.Column("value", sa.Numeric(24, 8), nullable=False),
            sa.Column("currency", sa.String(8)),
            sa.Column("as_of", sa.Date(), nullable=False),
            sa.Column("source", sa.String(120), nullable=False),
            sa.Column(
                "extra",
                postgresql.JSONB(astext_type=sa.Text()),
                nullable=False,
                server_default="{}",
            ),
            sa.UniqueConstraint("subject_type", "subject_id", "metric_name", "as_of", "source"),
            schema=SCHEMA,
        )
    op.create_table(
        "sector_metric",
        uuid_pk(),
        sa.Column("sector_id", sa.String(80), nullable=False),
        sa.Column("metric_name", sa.String(120), nullable=False),
        sa.Column("value", sa.Numeric(24, 8), nullable=False),
        sa.Column("as_of", sa.Date(), nullable=False),
        sa.Column("source", sa.String(120), nullable=False),
        sa.Column(
            "extra", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default="{}"
        ),
        sa.UniqueConstraint("sector_id", "metric_name", "as_of", "source"),
        schema=SCHEMA,
    )
    op.create_table(
        "leader_score",
        uuid_pk(),
        sa.Column("subject_type", sa.String(40), nullable=False),
        sa.Column("subject_id", sa.String(80), nullable=False),
        sa.Column("sector_id", sa.String(80), nullable=False),
        sa.Column("score_type", sa.String(80), nullable=False),
        sa.Column("score", sa.Numeric(8, 6), nullable=False),
        sa.Column("weight_template_version", sa.String(80), nullable=False),
        sa.Column("baseline", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("relation_class", sa.String(24), nullable=False),
        jsonb_list_column("evidence"),
        sa.Column("as_of", sa.Date(), nullable=False),
        sa.Column("source", sa.String(120), nullable=False),
        sa.Column(
            "extra", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default="{}"
        ),
        sa.CheckConstraint(
            "relation_class in ('fact', 'statistical', 'inferred')",
            name="ck_leader_score_relation_class",
        ),
        sa.UniqueConstraint(
            "subject_type", "subject_id", "score_type", "weight_template_version", "as_of"
        ),
        schema=SCHEMA,
    )
    op.create_table(
        "impact_score",
        uuid_pk(),
        sa.Column("subject_type", sa.String(40), nullable=False),
        sa.Column("subject_id", sa.String(80), nullable=False),
        sa.Column("event_id", sa.String(80), nullable=False),
        sa.Column("score", sa.Numeric(8, 6), nullable=False),
        sa.Column("direction", sa.String(24), nullable=False),
        sa.Column("relation_class", sa.String(24), nullable=False),
        jsonb_list_column("evidence"),
        sa.Column("as_of", sa.Date(), nullable=False),
        sa.Column("source", sa.String(120), nullable=False),
        sa.Column(
            "extra", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default="{}"
        ),
        sa.CheckConstraint(
            "relation_class in ('fact', 'statistical', 'inferred')",
            name="ck_impact_score_relation_class",
        ),
        sa.UniqueConstraint("subject_type", "subject_id", "event_id", "as_of", "source"),
        schema=SCHEMA,
    )
    op.create_table(
        "run",
        uuid_pk(),
        sa.Column("skill", sa.String(120), nullable=False),
        sa.Column("parent_run_id", sa.String(36)),
        sa.Column("trigger_source", sa.String(80), nullable=False),
        sa.Column("status", sa.String(40), nullable=False),
        sa.Column(
            "started_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.Column("finished_at", sa.DateTime(timezone=True)),
        sa.Column(
            "usage", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default="{}"
        ),
        sa.ForeignKeyConstraint(["parent_run_id"], [f"{SCHEMA}.run.id"]),
        schema=SCHEMA,
    )
    op.create_table(
        "trace_event",
        uuid_pk(),
        sa.Column("run_id", sa.String(36), nullable=False),
        sa.Column("idx", sa.Integer(), nullable=False),
        sa.Column("kind", sa.String(80), nullable=False),
        sa.Column(
            "payload", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default="{}"
        ),
        sa.Column("ts", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["run_id"], [f"{SCHEMA}.run.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("run_id", "idx"),
        schema=SCHEMA,
    )
    op.create_index("ix_trace_event_run_id_idx", "trace_event", ["run_id", "idx"], schema=SCHEMA)
    op.create_table(
        "run_artifact",
        sa.Column("run_id", sa.String(36), primary_key=True),
        sa.Column("artifact_path", sa.Text(), nullable=False),
        sa.Column("summary", sa.Text()),
        sa.ForeignKeyConstraint(["run_id"], [f"{SCHEMA}.run.id"], ondelete="CASCADE"),
        schema=SCHEMA,
    )
    op.create_table(
        "conversation_thread",
        uuid_pk(),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column(
            "subject_ref",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default="{}",
        ),
        jsonb_list_column("tags"),
        sa.Column("pinned", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.Column("last_message_at", sa.DateTime(timezone=True)),
        sa.Column("archived_at", sa.DateTime(timezone=True)),
        schema=SCHEMA,
    )
    op.create_table(
        "conversation_reference",
        uuid_pk(),
        sa.Column("thread_id", sa.String(36), nullable=False),
        sa.Column("run_id", sa.String(36), nullable=False),
        sa.Column("evidence_id", sa.String(36)),
        sa.Column("message_idx", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(
            ["thread_id"], [f"{SCHEMA}.conversation_thread.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(["run_id"], [f"{SCHEMA}.run.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["evidence_id"], [f"{SCHEMA}.evidence.id"]),
        sa.UniqueConstraint("thread_id", "run_id", "evidence_id", "message_idx"),
        schema=SCHEMA,
    )
    op.create_table(
        "evidence_link",
        sa.Column("owner_type", sa.String(80), primary_key=True),
        sa.Column("owner_id", sa.String(80), primary_key=True),
        sa.Column("evidence_id", sa.String(36), primary_key=True),
        sa.ForeignKeyConstraint(["evidence_id"], [f"{SCHEMA}.evidence.id"], ondelete="CASCADE"),
        schema=SCHEMA,
    )
    op.execute(
        f"""
        CREATE VIEW {SCHEMA}.v_active_edge AS
        SELECT id, type, from_entity_type, from_entity_id, to_entity_type, to_entity_id,
               direction, strength, confidence, relation_class, evidence
        FROM {SCHEMA}.edge
        WHERE revoked_at IS NULL
        """
    )
    op.execute(
        f"""
        CREATE VIEW {SCHEMA}.v_latest_metric AS
        SELECT DISTINCT ON (metric_family, subject_type, subject_id, metric_name)
               id, metric_family, subject_type, subject_id, metric_name, value, as_of, source
        FROM (
          SELECT id, 'financial' AS metric_family, subject_type, subject_id,
                 metric_name, value, as_of, source
          FROM {SCHEMA}.financial_metric
          UNION ALL
          SELECT id, 'market' AS metric_family, subject_type, subject_id,
                 metric_name, value, as_of, source
          FROM {SCHEMA}.market_metric
          UNION ALL
          SELECT id, 'sector' AS metric_family, 'sector' AS subject_type, sector_id AS subject_id,
                 metric_name, value, as_of, source
          FROM {SCHEMA}.sector_metric
        ) metric_union
        ORDER BY metric_family, subject_type, subject_id, metric_name, as_of DESC
        """
    )


def downgrade() -> None:
    op.execute(f"DROP VIEW IF EXISTS {SCHEMA}.v_latest_metric")
    op.execute(f"DROP VIEW IF EXISTS {SCHEMA}.v_active_edge")
    for table_name in (
        "evidence_link",
        "conversation_reference",
        "conversation_thread",
        "run_artifact",
        "trace_event",
        "run",
        "impact_score",
        "leader_score",
        "sector_metric",
        "market_metric",
        "financial_metric",
        "edge",
        "evidence",
        "sector_membership",
        "sector_mapping",
        "sector_provider",
        "sector_canonical",
        "market_event",
        "market_variable",
        "commodity",
        "product",
        "stock",
        "company",
    ):
        op.drop_table(table_name, schema=SCHEMA)
