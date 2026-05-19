import uuid
import hashlib
from datetime import datetime
from fastapi import HTTPException, status
from google.oauth2 import id_token
from google.auth.transport import requests as google_requests
from app.config.settings import settings
from app.auth.schemas import UserCreate, UserLogin, GoogleLogin, TokenResponse
from app.auth.utils import get_password_hash, verify_password
from app.auth.jwt import create_access_token, create_refresh_token, decode_refresh_token
from app.db.repositories.user import UserRepository
from app.db.repositories.token import RefreshTokenRepository
from app.db.models.token import RefreshToken

def hash_refresh_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()

class AuthService:
    def __init__(self, user_repo: UserRepository, token_repo: RefreshTokenRepository):
        self.user_repo = user_repo
        self.token_repo = token_repo

    async def signup(self, user_create: UserCreate) -> dict:
        if user_create.password != user_create.password_confirm:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Passwords do not match"
            )

        existing_user = await self.user_repo.get_by_email(user_create.email)
        if existing_user:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Email already registered"
            )

        hashed_password = get_password_hash(user_create.password)
        
        new_user = await self.user_repo.create(
            email=user_create.email,
            password_hash=hashed_password,
            full_name=user_create.full_name,
            provider="local",
            plan="free",
            credits=100
        )
        
        return {
            "id": new_user.id,
            "email": new_user.email,
            "full_name": new_user.full_name,
            "plan": new_user.plan,
            "credits": new_user.credits
        }

    async def login(self, user_login: UserLogin) -> TokenResponse:
        user = await self.user_repo.get_by_email(user_login.email)
        if not user or not verify_password(user_login.password, user.password_hash):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Incorrect email or password",
                headers={"WWW-Authenticate": "Bearer"},
            )

        if not user.is_active:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Inactive user"
            )

        access_token = create_access_token(subject=str(user.id))
        refresh_token = create_refresh_token(subject=str(user.id))
        
        # Save refresh token to db
        decoded_rt = decode_refresh_token(refresh_token)
        expires_at = datetime.fromtimestamp(decoded_rt["exp"])
        token_hash = hash_refresh_token(refresh_token)
        
        await self.token_repo.create(
            user_id=user.id,
            token_hash=token_hash,
            expires_at=expires_at
        )

        return TokenResponse(
            access_token=access_token,
            refresh_token=refresh_token
        )

    async def refresh(self, refresh_token: str) -> TokenResponse:
        decoded_token = decode_refresh_token(refresh_token)
        if not decoded_token:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid refresh token",
                headers={"WWW-Authenticate": "Bearer"},
            )

        token_hash = hash_refresh_token(refresh_token)
        saved_token = await self.token_repo.get_by_token_hash(token_hash)
        
        if not saved_token:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid refresh token",
                headers={"WWW-Authenticate": "Bearer"},
            )
            
        if saved_token.expires_at.timestamp() < datetime.utcnow().timestamp():
            await self.token_repo.delete(saved_token.id)
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Expired refresh token",
                headers={"WWW-Authenticate": "Bearer"},
            )

        user = await self.user_repo.get(saved_token.user_id)
        if not user or not user.is_active:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid or inactive user",
                headers={"WWW-Authenticate": "Bearer"},
            )

        # Delete the old refresh token (rotate token)
        await self.token_repo.delete(saved_token.id)
        
        # Create new tokens
        access_token = create_access_token(subject=str(user.id))
        new_refresh_token = create_refresh_token(subject=str(user.id))
        
        # Save new refresh token
        new_decoded_rt = decode_refresh_token(new_refresh_token)
        expires_at = datetime.fromtimestamp(new_decoded_rt["exp"])
        new_token_hash = hash_refresh_token(new_refresh_token)
        
        await self.token_repo.create(
            user_id=user.id,
            token_hash=new_token_hash,
            expires_at=expires_at
        )

        return TokenResponse(
            access_token=access_token,
            refresh_token=new_refresh_token
        )

    async def logout(self, refresh_token: str) -> dict:
        token_hash = hash_refresh_token(refresh_token)
        deleted = await self.token_repo.delete_by_token_hash(token_hash)
        if not deleted:
            # We don't necessarily want to throw an error if already deleted
            pass
            
        return {"msg": "Successfully logged out"}

    async def google_login(self, google_login_data: GoogleLogin) -> TokenResponse:
        if not settings.GOOGLE_CLIENT_ID:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Google OAuth is not configured"
            )

        try:
            # Verify the token
            idinfo = id_token.verify_oauth2_token(
                google_login_data.token, 
                google_requests.Request(), 
                settings.GOOGLE_CLIENT_ID
            )

            email = idinfo.get("email")
            if not email:
                raise ValueError("Email not provided by Google")
                
            full_name = idinfo.get("name", "Google User")
            avatar_url = idinfo.get("picture", None)

            # Check if user exists
            user = await self.user_repo.get_by_email(email)
            if not user:
                # Create user
                random_password = str(uuid.uuid4()) # Irrelevant password since they login with google
                hashed_password = get_password_hash(random_password)
                
                user = await self.user_repo.create(
                    email=email,
                    password_hash=hashed_password,
                    full_name=full_name,
                    avatar_url=avatar_url,
                    provider="google",
                    plan="free",
                    credits=100,
                    is_verified=True # Google verified
                )
            else:
                # Update avatar or provider if necessary
                if user.provider != "google" or user.avatar_url != avatar_url:
                    user.provider = "google"
                    user.avatar_url = avatar_url
                    await self.user_repo.db.commit()

            if not user.is_active:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Inactive user"
                )

            # Generate tokens
            access_token = create_access_token(subject=str(user.id))
            refresh_token = create_refresh_token(subject=str(user.id))
            
            # Save refresh token to db
            decoded_rt = decode_refresh_token(refresh_token)
            expires_at = datetime.fromtimestamp(decoded_rt["exp"])
            token_hash = hash_refresh_token(refresh_token)
            
            await self.token_repo.create(
                user_id=user.id,
                token_hash=token_hash,
                expires_at=expires_at
            )

            return TokenResponse(
                access_token=access_token,
                refresh_token=refresh_token
            )

        except ValueError as e:
            # Invalid token
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail=f"Invalid Google token: {str(e)}",
                headers={"WWW-Authenticate": "Bearer"},
            )
