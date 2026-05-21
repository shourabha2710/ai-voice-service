"""merge_heads

Revision ID: 9a3b2c1d4e5f
Revises: 32808c74af58, f2a98b1f3c99
Create Date: 2026-05-20 00:00:00.000000
"""

from alembic import op
from typing import Sequence, Union

# revision identifiers, used by Alembic.
revision = '9a3b2c1d4e5f'
down_revision = ('32808c74af58', 'f2a98b1f3c99')
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Merge existing heads without schema changes."""
    pass


def downgrade() -> None:
    """Downgrade is not supported for merge-only revisions."""
    pass
