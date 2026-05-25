"""Add progress fields to video_downloads

Revision ID: d4e5f6a7b8c9
Revises: 41c3e7165fd0
Create Date: 2026-05-25 14:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'd4e5f6a7b8c9'
down_revision: Union[str, Sequence[str], None] = '41c3e7165fd0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('video_downloads', sa.Column('progress_percent', sa.Integer(), nullable=True))
    op.add_column('video_downloads', sa.Column('downloaded_bytes', sa.Integer(), nullable=True))
    op.add_column('video_downloads', sa.Column('total_bytes', sa.Integer(), nullable=True))
    op.add_column('video_downloads', sa.Column('download_speed', sa.Float(), nullable=True))
    op.add_column('video_downloads', sa.Column('eta_seconds', sa.Integer(), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('video_downloads', 'eta_seconds')
    op.drop_column('video_downloads', 'download_speed')
    op.drop_column('video_downloads', 'total_bytes')
    op.drop_column('video_downloads', 'downloaded_bytes')
    op.drop_column('video_downloads', 'progress_percent')
