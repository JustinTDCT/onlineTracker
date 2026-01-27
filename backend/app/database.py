"""Database setup and session management.

PostgreSQL database with asyncpg driver.
Set DATABASE_URL environment variable:
    postgresql+asyncpg://user:password@host:port/dbname
"""
import logging
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy.orm import declarative_base

from .config import get_database_url

logger = logging.getLogger(__name__)

# Create async engine for PostgreSQL
engine = create_async_engine(
    get_database_url(),
    echo=False,
    future=True,
    pool_size=10,
    max_overflow=20,
    pool_pre_ping=True,
    pool_recycle=3600,  # Recycle connections after 1 hour
)

logger.info("Using PostgreSQL database")

# Session factory
async_session = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
)

# Base class for models
Base = declarative_base()


async def get_db() -> AsyncSession:
    """Dependency to get database session."""
    async with async_session() as session:
        try:
            yield session
        finally:
            await session.close()


async def init_db():
    """Initialize database - create tables."""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        
        # Run migrations for existing databases
        await _run_migrations(conn)


async def _run_migrations(conn):
    """Run database migrations for schema updates."""
    from sqlalchemy import text
    
    # PostgreSQL migrations with IF NOT EXISTS
    try:
        await conn.execute(text(
            "ALTER TABLE monitor_status ADD COLUMN IF NOT EXISTS ssl_expiry_days INTEGER"
        ))
    except Exception:
        pass
    
    try:
        await conn.execute(text(
            "ALTER TABLE alerts ADD COLUMN IF NOT EXISTS channel TEXT DEFAULT 'webhook'"
        ))
    except Exception:
        pass


async def close_db():
    """Close database connections."""
    await engine.dispose()
