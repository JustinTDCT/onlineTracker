"""Database setup and session management."""
import os
from sqlalchemy import event
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy.orm import declarative_base

from .config import settings, get_database_url

# Create async engine with connection pool settings for SQLite
engine = create_async_engine(
    get_database_url(),
    echo=False,
    future=True,
    # Pool settings for better concurrency
    pool_size=5,
    max_overflow=10,
    pool_pre_ping=True,
    # SQLite-specific: use NullPool would be an option but we'll use connection events instead
    connect_args={"timeout": 30},  # Wait up to 30 seconds for locks
)


# Enable WAL mode and busy timeout on each connection
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
    # Ensure data directory exists
    os.makedirs(settings.data_path, exist_ok=True)
    
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        
        # Run migrations for existing databases
        await _run_migrations(conn)


async def _run_migrations(conn):
    """Run database migrations for schema updates."""
    from sqlalchemy import text
    
    # Migration: Add ssl_expiry_days column to monitor_status if missing
    try:
        await conn.execute(text(
            "ALTER TABLE monitor_status ADD COLUMN ssl_expiry_days INTEGER"
        ))
    except Exception:
        # Column already exists
        pass
    
    # Migration: Add channel column to alerts if missing
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
