"""add_audio_generation_indexes

Revision ID: f2a98b1f3c99
Revises: de1e4b4e1227
Create Date: 2026-05-20 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = 'f2a98b1f3c99'
down_revision = 'de1e4b4e1227'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_index('ix_audio_generations_user_id', 'audio_generations', ['user_id'])
    op.create_index('ix_audio_generations_created_at', 'audio_generations', ['created_at'])
    op.create_index('ix_audio_generations_user_id_created_at', 'audio_generations', ['user_id', 'created_at'])
    op.create_index('ix_audio_generations_user_id_job_id', 'audio_generations', ['user_id', 'job_id'])


def downgrade() -> None:
    op.drop_index('ix_audio_generations_user_id_job_id', table_name='audio_generations')
    op.drop_index('ix_audio_generations_user_id_created_at', table_name='audio_generations')
    op.drop_index('ix_audio_generations_created_at', table_name='audio_generations')
    op.drop_index('ix_audio_generations_user_id', table_name='audio_generations')
