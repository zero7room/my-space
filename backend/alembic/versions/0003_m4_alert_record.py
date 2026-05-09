"""Create M4 alert record schema.

Revision ID: 0003_m4_alert_record
Revises: 0002_m1_data_domain
Create Date: 2026-05-09 00:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "0003_m4_alert_record"
down_revision: str | None = "0002_m1_data_domain"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

SCHEMA = "app"


def upgrade() -> None:
    op.create_table(
        "alert_record",
        sa.Column(
            "alert_id",
            sa.String(36),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()::text"),
        ),
        sa.Column("rule_id", sa.String(120), nullable=False),
        sa.Column("alert_type", sa.String(120), nullable=False),
        sa.Column("subject_type", sa.String(40), nullable=False),
        sa.Column("subject_id", sa.String(120), nullable=False),
        sa.Column("subject_name", sa.String(255)),
        sa.Column("priority", sa.String(16), nullable=False),
        sa.Column("state", sa.String(24), nullable=False, server_default="active"),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("summary", sa.Text(), nullable=False),
        sa.Column(
            "evidence",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
        sa.Column("artifact_run_id", sa.String(120)),
        sa.Column("open_chat_thread_id", sa.String(120)),
        sa.Column("parent_alert_id", sa.String(36)),
        sa.Column(
            "channels",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
        sa.Column(
            "ctx",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
        sa.Column(
            "follow_up",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
        sa.Column("reason", sa.String(120)),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column("sent_at", sa.DateTime(timezone=True)),
        sa.CheckConstraint(
            "priority in ('high', 'medium', 'low')",
            name="ck_alert_record_priority",
        ),
        sa.CheckConstraint(
            "state in ('active', 'capped', 'deferred', 'suppressed', 'sent', 'merged')",
            name="ck_alert_record_state",
        ),
        sa.ForeignKeyConstraint(["parent_alert_id"], [f"{SCHEMA}.alert_record.alert_id"]),
        schema=SCHEMA,
    )
    op.create_index(
        "ix_alert_record_rule_id_created_at",
        "alert_record",
        ["rule_id", sa.text("created_at DESC")],
        schema=SCHEMA,
    )
    op.create_index(
        "ix_alert_record_subject_created_at",
        "alert_record",
        ["subject_type", "subject_id", sa.text("created_at DESC")],
        schema=SCHEMA,
    )
    op.create_index(
        "ix_alert_record_state_created_at",
        "alert_record",
        ["state", sa.text("created_at DESC")],
        schema=SCHEMA,
    )


def downgrade() -> None:
    op.drop_index("ix_alert_record_state_created_at", table_name="alert_record", schema=SCHEMA)
    op.drop_index("ix_alert_record_subject_created_at", table_name="alert_record", schema=SCHEMA)
    op.drop_index("ix_alert_record_rule_id_created_at", table_name="alert_record", schema=SCHEMA)
    op.drop_table("alert_record", schema=SCHEMA)
