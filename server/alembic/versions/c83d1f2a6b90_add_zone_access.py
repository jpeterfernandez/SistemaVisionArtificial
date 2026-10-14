"""add zone access controls

Revision ID: c83d1f2a6b90
Revises: 9a5c1e4f7b20
Create Date: 2026-10-13
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "c83d1f2a6b90"
down_revision: Union[str, Sequence[str], None] = "9a5c1e4f7b20"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("allowed_zones", sa.JSON(), nullable=False, server_default=sa.text("'[]'::json")),
    )
    op.alter_column("users", "allowed_zones", server_default=None)
    op.add_column("production_orders", sa.Column("zone", sa.String(length=50), nullable=True))
    op.create_index("ix_production_orders_zone", "production_orders", ["zone"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_production_orders_zone", table_name="production_orders")
    op.drop_column("production_orders", "zone")
    op.drop_column("users", "allowed_zones")
