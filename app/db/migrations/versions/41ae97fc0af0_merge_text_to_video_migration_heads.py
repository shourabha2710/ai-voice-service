"""merge text_to_video migration heads

Revision ID: 41ae97fc0af0
Revises: d4e5f6a7b8c9, e7f8a9b0c1d2
Create Date: 2026-05-26 12:23:54.132219

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '41ae97fc0af0'
down_revision: Union[str, Sequence[str], None] = ('d4e5f6a7b8c9', 'e7f8a9b0c1d2')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
