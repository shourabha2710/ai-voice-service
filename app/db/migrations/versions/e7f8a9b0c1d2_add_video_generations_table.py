"""add video_generations table

Revision ID: e7f8a9b0c1d2
Revises: 9a3b2c1d4e5f
Create Date: 2026-05-26 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID


revision: str = 'e7f8a9b0c1d2'
down_revision: Union[str, Sequence[str], None] = '9a3b2c1d4e5f'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'video_generations',
        sa.Column('id', UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column('user_id', UUID(as_uuid=True), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('prompt', sa.String(2048), nullable=False),
        sa.Column('status', sa.String(50), nullable=False, server_default=sa.text("'pending'")),
        sa.Column('video_path', sa.String(1024), nullable=True),
        sa.Column('thumbnail_path', sa.String(1024), nullable=True),
        sa.Column('duration_seconds', sa.Integer(), nullable=True),
        sa.Column('aspect_ratio', sa.String(20), nullable=False, server_default=sa.text("'16:9'")),
        sa.Column('resolution', sa.String(20), nullable=False, server_default=sa.text("'720p'")),
        sa.Column('progress_percent', sa.Integer(), nullable=True, server_default=sa.text("0")),
        sa.Column('error_message', sa.String(1024), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text("timezone('utc', now())")),
        sa.Column('completed_at', sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index('ix_video_generations_user_id', 'video_generations', ['user_id'])
    op.create_index('ix_video_generations_created_at', 'video_generations', ['created_at'])
    op.create_index('ix_video_generations_user_id_created_at', 'video_generations', ['user_id', 'created_at'])
    op.create_index('ix_video_generations_status', 'video_generations', ['status'])


def downgrade() -> None:
    op.drop_index('ix_video_generations_status')
    op.drop_index('ix_video_generations_user_id_created_at')
    op.drop_index('ix_video_generations_created_at')
    op.drop_index('ix_video_generations_user_id')
    op.drop_table('video_generations')
