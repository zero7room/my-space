"""Initialize database extensions and application schema.

Revision ID: 0001_init
Revises:
Create Date: 2026-05-08 00:00:00.000000
"""

from collections.abc import Sequence

from alembic import op

revision: str = "0001_init"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute('CREATE EXTENSION IF NOT EXISTS "pgcrypto"')
    op.execute('CREATE SCHEMA IF NOT EXISTS "app"')


def downgrade() -> None:
    op.execute('DROP SCHEMA IF EXISTS "app" CASCADE')
    op.execute('DROP EXTENSION IF EXISTS "pgcrypto"')
