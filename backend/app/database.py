"""Database setup and session management.

Supports both SQLite (default) and PostgreSQL databases.
Set DATABASE_URL environment variable for PostgreSQL:
    postgresql+asyncpg://user:password@host:port/dbname
"""
import logging
import os
from sqlalchemy import event
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy.orm import declarative_base

from .config import settings, get_database_url, is_postgresql

logger = logging.getLogger(__name__)

# Determine database type
_is_postgres = is_postgresql()
_database_url = get_database_url()

# Create async engine with appropriate settings for the database type
if _is_postgres:
    # PostgreSQL configuration - optimized for concurrent access
    engine = create_async_engine(
        _database_url,
        echo=False,
        future=True,
        pool_size=10,
        max_overflow=20,
        pool_pre_ping=True,
        pool_recycle=3600,  # Recycle connections after 1 hour
    )
    logger.info("Using PostgreSQL database")
else:
    # SQLite configuration
    engine = create_async_engine(
        _database_url,
        echo=False,
        future=True,
        pool_size=5,
        max_overflow=10,
        pool_pre_ping=True,
        connect_args={"timeout": 30},  # Wait up to 30 seconds for locks
    )
    logger.info("Using SQLite database")
    
    # Enable WAL mode and busy timeout on each SQLite connection
    @event.listens_for(engine.sync_engine, "connect")
    def set_sqlite_pragma(dbapi_connection, connection_record):
        """Configure SQLite for better concurrent access."""
        cursor = dbapi_connection.cursor()
        # WAL mode allows concurrent reads during writes
        cursor.execute("PRAGMA journal_mode=WAL")
        # Wait up to 30 seconds for locks before failing
        cursor.execute("PRAGMA busy_timeout=30000")
        # Synchronous mode - NORMAL is a good balance of safety and speed
        cursor.execute("PRAGMA synchronous=NORMAL")
        cursor.close()


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
    """Initialize database - create tables and ensure data directory exists."""
    # Ensure data directory exists for SQLite
    if not _is_postgres:
        os.makedirs(settings.data_path, exist_ok=True)
    
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        
        # Run migrations for existing databases
        await _run_migrations(conn)


async def _run_migrations(conn):
    """Run database migrations for schema updates.
    
    Uses database-agnostic approach where possible.
    """
    from sqlalchemy import text
    
    if _is_postgres:
        # PostgreSQL migrations
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
    else:
        # SQLite migrations (no IF NOT EXISTS support for ADD COLUMN)
        try:
            await conn.execute(text(
                "ALTER TABLE monitor_status ADD COLUMN ssl_expiry_days INTEGER"
            ))
        except Exception:
            # Column already exists
            pass
        
        try:
            await conn.execute(text(
                "ALTER TABLE alerts ADD COLUMN channel TEXT DEFAULT 'webhook'"
            ))
        except Exception:
            # Column already exists
            pass


async def close_db():
    """Close database connections."""
    await engine.dispose()
