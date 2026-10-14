"""snapshot production zone on records

Revision ID: d9164a70be21
Revises: c83d1f2a6b90
Create Date: 2026-10-13
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "d9164a70be21"
down_revision: Union[str, Sequence[str], None] = "c83d1f2a6b90"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("production_events", sa.Column("zone", sa.String(length=50), nullable=True))
    op.add_column("detections", sa.Column("zone", sa.String(length=50), nullable=True))
    op.create_index("ix_production_events_zone", "production_events", ["zone"], unique=False)
    op.create_index("ix_detections_zone", "detections", ["zone"], unique=False)
    op.execute(
        "UPDATE production_events AS event SET zone = camera.zone "
        "FROM cameras AS camera WHERE event.camera_id = camera.id AND event.zone IS NULL"
    )
    op.execute(
        "UPDATE detections AS detection SET zone = camera.zone "
        "FROM cameras AS camera WHERE detection.camera_id = camera.id AND detection.zone IS NULL"
    )


def downgrade() -> None:
    op.drop_index("ix_detections_zone", table_name="detections")
    op.drop_index("ix_production_events_zone", table_name="production_events")
    op.drop_column("detections", "zone")
    op.drop_column("production_events", "zone")
