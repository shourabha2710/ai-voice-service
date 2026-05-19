"""Update user model for oauth

Revision ID: 32808c74af58
Revises: de1e4b4e1227
Create Date: 2026-05-19 21:30:21.963398

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.engine.reflection import Inspector


# revision identifiers, used by Alembic.
revision: str = '32808c74af58'
down_revision: Union[str, Sequence[str], None] = 'de1e4b4e1227'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _get_column_names(table_name: str) -> list[str]:
    """Return all column names for a given table (safe introspection)."""
    bind = op.get_bind()
    inspector = Inspector.from_engine(bind)
    return [col["name"] for col in inspector.get_columns(table_name)]


def upgrade() -> None:
    """
    1. Rename the legacy 'provider' column to 'auth_provider' (idempotent).
    2. Make 'password_hash' nullable so Google OAuth users have NULL password.
    3. Ensure 'auth_provider' has a server-side default of 'local' for
       backward-compatible rows.
    """
    columns = _get_column_names("users")

    # Step 1: Rename 'provider' → 'auth_provider' only if still old name
    if "provider" in columns and "auth_provider" not in columns:
        op.alter_column(
            "users",
            "provider",
            new_column_name="auth_provider",
            existing_type=sa.String(length=50),
            existing_nullable=False,
            existing_server_default="local",
        )

    # Step 2: Add 'auth_provider' column from scratch if neither column exists
    # (e.g. a very old schema that never had 'provider')
    if "provider" not in columns and "auth_provider" not in columns:
        op.add_column(
            "users",
            sa.Column(
                "auth_provider",
                sa.String(length=50),
                nullable=False,
                server_default="local",
            ),
        )

    # Step 3: Make password_hash nullable (Google users have no password)
    # Introspect current nullable state to avoid a no-op error on some backends
    bind = op.get_bind()
    inspector = Inspector.from_engine(bind)
    col_info = {c["name"]: c for c in inspector.get_columns("users")}

    if "password_hash" in col_info and not col_info["password_hash"]["nullable"]:
        op.alter_column(
            "users",
            "password_hash",
            existing_type=sa.VARCHAR(length=255),
            existing_nullable=False,
            nullable=True,
        )


def downgrade() -> None:
    """Reverse: rename auth_provider back to provider and restore NOT NULL."""
    columns = _get_column_names("users")

    if "auth_provider" in columns and "provider" not in columns:
        op.alter_column(
            "users",
            "auth_provider",
            new_column_name="provider",
            existing_type=sa.String(length=50),
            existing_nullable=False,
            existing_server_default="local",
        )

    op.alter_column(
        "users",
        "password_hash",
        existing_type=sa.VARCHAR(length=255),
        existing_nullable=True,
        nullable=False,
    )
