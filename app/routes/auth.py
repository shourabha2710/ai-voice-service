from fastapi import APIRouter, Depends, status
from app.auth.schemas import UserCreate, UserLogin, TokenResponse, RefreshTokenRequest, UserResponse
from app.auth.service import AuthService
from app.auth.dependencies import get_auth_service, get_current_user
from app.db.models.user import User

router = APIRouter(prefix="/api/v1/auth", tags=["auth"])

@router.post("/signup", response_model=dict, status_code=status.HTTP_201_CREATED)
async def signup(
    user_create: UserCreate,
    auth_service: AuthService = Depends(get_auth_service)
):
    """
    Register a new user.
    """
    return await auth_service.signup(user_create)

@router.post("/login", response_model=TokenResponse)
async def login(
    user_login: UserLogin,
    auth_service: AuthService = Depends(get_auth_service)
):
    """
    Login user and get access and refresh tokens.
    """
    return await auth_service.login(user_login)

@router.post("/google", response_model=TokenResponse)
async def google_login(
    google_login_data: GoogleLogin,
    auth_service: AuthService = Depends(get_auth_service)
):
    """
    Login or register user using Google ID token.
    """
    return await auth_service.google_login(google_login_data)

@router.post("/refresh", response_model=TokenResponse)
async def refresh(
    refresh_request: RefreshTokenRequest,
    auth_service: AuthService = Depends(get_auth_service)
):
    """
    Refresh access token using a valid refresh token.
    """
    return await auth_service.refresh(refresh_request.refresh_token)

@router.post("/logout")
async def logout(
    refresh_request: RefreshTokenRequest,
    auth_service: AuthService = Depends(get_auth_service)
):
    """
    Logout user by invalidating their refresh token.
    """
    return await auth_service.logout(refresh_request.refresh_token)

@router.get("/me", response_model=UserResponse)
async def get_me(
    current_user: User = Depends(get_current_user)
):
    """
    Get current authenticated user details.
    """
    return current_user
