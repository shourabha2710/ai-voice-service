import uuid
from typing import Optional
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.db.models.user import User
from app.db.repositories.user import UserRepository
from app.db.repositories.token import RefreshTokenRepository
from app.auth.jwt import decode_access_token
from app.auth.service import AuthService

security = HTTPBearer()
optional_security = HTTPBearer(auto_error=False)

def get_user_repository(db: AsyncSession = Depends(get_db)) -> UserRepository:
    return UserRepository(db)

def get_token_repository(db: AsyncSession = Depends(get_db)) -> RefreshTokenRepository:
    return RefreshTokenRepository(db)

def get_auth_service(
    user_repo: UserRepository = Depends(get_user_repository),
    token_repo: RefreshTokenRepository = Depends(get_token_repository)
) -> AuthService:
    return AuthService(user_repo=user_repo, token_repo=token_repo)

async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    user_repo: UserRepository = Depends(get_user_repository)
) -> User:
    token = credentials.credentials
    payload = decode_access_token(token)
    if not payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    user_id_str: str = payload.get("sub")
    if user_id_str is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    try:
        user_id = uuid.UUID(user_id_str)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid user id",
            headers={"WWW-Authenticate": "Bearer"},
        )
        
    user = await user_repo.get(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
        
    if not user.is_active:
        raise HTTPException(status_code=400, detail="Inactive user")
        
    return user

async def get_current_user_optional(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(optional_security),
    user_repo: UserRepository = Depends(get_user_repository)
) -> Optional[User]:
    if not credentials:
        return None
        
    token = credentials.credentials
    payload = decode_access_token(token)
    if not payload:
        return None
        
    user_id_str: str = payload.get("sub")
    if user_id_str is None:
        return None
        
    try:
        user_id = uuid.UUID(user_id_str)
    except ValueError:
        return None
        
    user = await user_repo.get(user_id)
    if user and not user.is_active:
        return None
        
    return user
