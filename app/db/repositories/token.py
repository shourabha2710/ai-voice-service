from typing import Optional
import uuid
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.db.models.token import RefreshToken
from app.db.repositories.base import BaseRepository

class RefreshTokenRepository(BaseRepository[RefreshToken]):
    def __init__(self, db: AsyncSession):
        super().__init__(RefreshToken, db)

    async def get_by_token_hash(self, token_hash: str) -> Optional[RefreshToken]:
        result = await self.db.execute(select(RefreshToken).filter(RefreshToken.token_hash == token_hash))
        return result.scalar_one_or_none()

    async def delete_by_token_hash(self, token_hash: str) -> bool:
        token = await self.get_by_token_hash(token_hash)
        if not token:
            return False
        await self.db.delete(token)
        await self.db.commit()
        return True
