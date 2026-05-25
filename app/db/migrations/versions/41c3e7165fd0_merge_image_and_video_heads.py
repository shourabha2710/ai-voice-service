"""merge image and video heads

Revision ID: 41c3e7165fd0
Revises: b58d2fcae844, c9f8e2b1d3a6
Create Date: 2026-05-25 12:29:10.123301

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '41c3e7165fd0'
down_revision: Union[str, Sequence[str], None] = ('b58d2fcae844', 'c9f8e2b1d3a6')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
