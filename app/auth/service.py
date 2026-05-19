import uuid
import hashlib
from datetime import datetime
from loguru import logger
from fastapi import HTTPException, status
from google.oauth2 import id_token
from google.auth.transport import requests as google_requests
from sqlalchemy.exc import IntegrityError
from app.config.settings import settings
from app.auth.schemas import UserCreate, UserLogin, GoogleLogin, TokenResponse
from app.auth.utils import get_password_hash, verify_password, validate_password_length
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
            logger.warning(f"Signup password mismatch for {user_create.email}")
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Passwords do not match"
            )

        existing_user = await self.user_repo.get_by_email(user_create.email)
        if existing_user:
            if existing_user.auth_provider == "google":
                logger.warning(f"Signup attempted with Google-only email: {user_create.email}")
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="This email is already registered with Google Sign-In. Please use Google Sign-In."
                )
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Email already registered"
            )

        validate_password_length(user_create.password)
        hashed_password = get_password_hash(user_create.password)
        
        try:
            new_user = await self.user_repo.create(
                email=user_create.email,
                password_hash=hashed_password,
                full_name=user_create.full_name,
                auth_provider="local",
                plan="free",
                credits=100
            )
        except IntegrityError as e:
            logger.error(f"Database integrity error during signup for {user_create.email}: {str(e)}")
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="An account with this email already exists"
            )
        
        logger.info(f"New local user created: {new_user.email} (id={new_user.id})")
        return {
            "id": new_user.id,
            "email": new_user.email,
            "full_name": new_user.full_name,
            "plan": new_user.plan,
            "credits": new_user.credits
        }

    async def login(self, user_login: UserLogin) -> TokenResponse:
        user = await self.user_repo.get_by_email(user_login.email)
        if user and user.auth_provider == "google":
            logger.warning(f"Password login attempted on Google account: {user_login.email}")
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="This account uses Google Sign-In"
            )
            
        if not user or not user.password_hash:
            logger.warning(f"Failed login attempt for {user_login.email}: user not found or no password set")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Incorrect email or password",
                headers={"WWW-Authenticate": "Bearer"},
            )

        if not verify_password(user_login.password, user.password_hash):
            logger.warning(f"Failed login attempt for {user_login.email}: incorrect password")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Incorrect email or password",
                headers={"WWW-Authenticate": "Bearer"},
            )

        if not user.is_active:
            logger.warning(f"Login attempt for inactive user: {user_login.email}")
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Inactive user"
            )

        access_token = create_access_token(subject=str(user.id))
        refresh_token = create_refresh_token(subject=str(user.id))
        
        decoded_rt = decode_refresh_token(refresh_token)
        expires_at = datetime.fromtimestamp(decoded_rt["exp"])
        token_hash = hash_refresh_token(refresh_token)
        
        await self.token_repo.create(
            user_id=user.id,
            token_hash=token_hash,
            expires_at=expires_at
        )

        logger.info(f"Successful login: {user.email} (id={user.id})")
        return TokenResponse(
            access_token=access_token,
            refresh_token=refresh_token
        )

    async def refresh(self, refresh_token: str) -> TokenResponse:
        decoded_token = decode_refresh_token(refresh_token)
        if not decoded_token:
            logger.warning("Invalid refresh token: could not decode")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid refresh token",
                headers={"WWW-Authenticate": "Bearer"},
            )

        token_hash = hash_refresh_token(refresh_token)
        saved_token = await self.token_repo.get_by_token_hash(token_hash)
        
        if not saved_token:
            logger.warning("Invalid refresh token: not found in database")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid refresh token",
                headers={"WWW-Authenticate": "Bearer"},
            )
            
        if saved_token.expires_at.timestamp() < datetime.utcnow().timestamp():
            logger.warning(f"Expired refresh token for user_id={saved_token.user_id}")
            await self.token_repo.delete(saved_token.id)
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Expired refresh token",
                headers={"WWW-Authenticate": "Bearer"},
            )

        user = await self.user_repo.get(saved_token.user_id)
        if not user or not user.is_active:
            logger.warning(f"Invalid or inactive user for token refresh: user_id={saved_token.user_id}")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid or inactive user",
                headers={"WWW-Authenticate": "Bearer"},
            )

        await self.token_repo.delete(saved_token.id)
        
        access_token = create_access_token(subject=str(user.id))
        new_refresh_token = create_refresh_token(subject=str(user.id))
        
        new_decoded_rt = decode_refresh_token(new_refresh_token)
        expires_at = datetime.fromtimestamp(new_decoded_rt["exp"])
        new_token_hash = hash_refresh_token(new_refresh_token)
        
        await self.token_repo.create(
            user_id=user.id,
            token_hash=new_token_hash,
            expires_at=expires_at
        )

        logger.info(f"Token refreshed for user: {user.email} (id={user.id})")
        return TokenResponse(
            access_token=access_token,
            refresh_token=new_refresh_token
        )

    async def logout(self, refresh_token: str) -> dict:
        token_hash = hash_refresh_token(refresh_token)
        deleted = await self.token_repo.delete_by_token_hash(token_hash)
        if not deleted:
            logger.warning("Logout attempted with unknown refresh token")
            
        logger.info("User logged out successfully")
        return {"msg": "Successfully logged out"}

    async def google_login(self, google_login_data: GoogleLogin) -> TokenResponse:
        if not settings.GOOGLE_CLIENT_ID:
            logger.error("Google OAuth is not configured (GOOGLE_CLIENT_ID is empty)")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Google OAuth is not configured"
            )

        try:
            idinfo = id_token.verify_oauth2_token(
                google_login_data.token,
                google_requests.Request(),
                settings.GOOGLE_CLIENT_ID
            )
        except ValueError as e:
            logger.warning(f"Google token verification failed: {str(e)}")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid Google token. Please try signing in again.",
                headers={"WWW-Authenticate": "Bearer"},
            )

        email = idinfo.get("email")
        if not email:
            logger.error("Google token did not include an email address")
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Google account must have an email address"
            )

        full_name = idinfo.get("name", "Google User")
        avatar_url = idinfo.get("picture", None)
        logger.info(f"Google OAuth login attempt: {email}")

        try:
            user = await self.user_repo.get_by_email(email)
            if not user:
                logger.info(f"Creating new Google user: {email}")
                user = await self.user_repo.create(
                    email=email,
                    password_hash=None,
                    full_name=full_name,
                    avatar_url=avatar_url,
                    auth_provider="google",
                    plan="free",
                    credits=100,
                    is_verified=True
                )
                logger.info(f"New Google user created: {email} (id={user.id})")
            else:
                needs_update = False
                if user.auth_provider != "google":
                    logger.info(f"Switching user {email} from {user.auth_provider} to Google auth")
                    user.auth_provider = "google"
                    user.password_hash = None
                    needs_update = True
                if user.avatar_url != avatar_url:
                    user.avatar_url = avatar_url
                    needs_update = True
                if user.full_name != full_name:
                    user.full_name = full_name
                    needs_update = True
                if needs_update:
                    await self.user_repo.db.commit()
                    await self.user_repo.db.refresh(user)
                    logger.info(f"Updated existing user for Google OAuth: {email}")

            if not user.is_active:
                logger.warning(f"Inactive Google user attempted login: {email}")
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Inactive user"
                )

            access_token = create_access_token(subject=str(user.id))
            refresh_token = create_refresh_token(subject=str(user.id))

            decoded_rt = decode_refresh_token(refresh_token)
            expires_at = datetime.fromtimestamp(decoded_rt["exp"])
            token_hash = hash_refresh_token(refresh_token)

            await self.token_repo.create(
                user_id=user.id,
                token_hash=token_hash,
                expires_at=expires_at
            )

            logger.info(f"Successful Google login: {email} (id={user.id})")
            return TokenResponse(
                access_token=access_token,
                refresh_token=refresh_token
            )

        except HTTPException:
            raise
        except IntegrityError as e:
            logger.error(f"Database integrity error during Google login for {email}: {str(e)}")
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="An account with this email already exists"
            )
        except Exception as e:
            logger.exception(f"Unexpected error during Google login for {email}: {str(e)}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="An unexpected error occurred during Google login"
            )
