from sqlalchemy.orm import DeclarativeBase

class Base(DeclarativeBase):
    pass

# Import models to ensure they are registered on the Base metadata for Alembic
from app.db.models.user import User
from app.db.models.audio import AudioGeneration
from app.db.models.token import RefreshToken
