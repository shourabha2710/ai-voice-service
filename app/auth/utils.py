from passlib.context import CryptContext
from fastapi import HTTPException, status
from loguru import logger

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

BCRYPT_MAX_BYTES = 72

def validate_password_length(password: str) -> None:
    password_bytes = password.encode("utf-8")
    if len(password_bytes) > BCRYPT_MAX_BYTES:
        logger.warning(f"Password exceeds {BCRYPT_MAX_BYTES}-byte bcrypt limit ({len(password_bytes)} bytes)")
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Password must not exceed {BCRYPT_MAX_BYTES} bytes"
        )

def verify_password(plain_password: str, hashed_password: str) -> bool:
    try:
        return pwd_context.verify(plain_password, hashed_password)
    except ValueError as e:
        if "too long" in str(e).lower():
            logger.warning("Password verification failed: input exceeds bcrypt byte limit")
            return False
        raise

def get_password_hash(password: str) -> str:
    validate_password_length(password)
    return pwd_context.hash(password)
