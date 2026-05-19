from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy import text
from loguru import logger
from urllib.parse import quote, unquote

from app.config.settings import settings

def get_encoded_db_url(url: str) -> str:
    """
    Safely URL-encodes special characters (such as '@' or '/') in the database password
    to prevent connection parsing errors on production databases.
    """
    try:
        if "://" in url:
            scheme, rest = url.split("://", 1)
            if "@" in rest:
                # Split at the last '@' separating credentials from host information
                creds, host_db = rest.rsplit("@", 1)
                if ":" in creds:
                    user, pwd = creds.split(":", 1)
                    # Unquote first to prevent double-encoding, then safely quote
                    safe_pwd = quote(unquote(pwd))
                    return f"{scheme}://{user}:{safe_pwd}@{host_db}"
    except Exception as e:
        logger.error(f"Error parsing database URL: {str(e)}")
    return url

# Create async engine
engine = create_async_engine(
    get_encoded_db_url(settings.DATABASE_URL),
    pool_pre_ping=True,
    echo=False,
)

# Create async session maker
AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False,
)

# Async session dependency for FastAPI routes
async def get_db() -> AsyncSession:
    async with AsyncSessionLocal() as session:
        try:
            yield session
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()

# Database startup validation
async def validate_db_connection() -> bool:
    try:
        logger.info("Validating database connection on startup...")
        async with engine.connect() as conn:
            # Execute simple query to verify connection
            await conn.execute(text("SELECT 1"))
            logger.info("Database connection validated successfully!")
            return True
    except Exception as e:
        logger.error(f"Database connection validation failed: {str(e)}")
        return False
