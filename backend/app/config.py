"""Application configuration from environment variables."""
import os
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""
    
    # Application mode: 'server' or 'agent'
    mode: str = "server"
    
    # Port for agent-server communication
    coms_port: int = 19443
    
    # Agent mode: server hostname to connect to
    server_host: str | None = None
    
    # Agent mode: shared secret for authentication
    shared_secret: str | None = None
    
    # Agent mode: friendly name for this agent
    agent_name: str | None = None
    
    # Path for SQLite database storage (used if DATABASE_URL not set)
    data_path: str = "/data"
    
    # Web server port (server mode)
    web_port: int = 8000
    
    # Database URL (optional - overrides SQLite if set)
    # Format: postgresql+asyncpg://user:pass@host:port/dbname
    database_url: str | None = None
    
    class Config:
        env_prefix = ""
        case_sensitive = False


settings = Settings()


def get_database_url() -> str:
    """Get the database URL.
    
    Priority:
    1. DATABASE_URL environment variable (PostgreSQL or SQLite)
    2. Default SQLite in DATA_PATH
    """
    if settings.database_url:
        url = settings.database_url
        # Handle Heroku-style postgres:// URLs
        if url.startswith("postgres://"):
            url = url.replace("postgres://", "postgresql+asyncpg://", 1)
        elif url.startswith("postgresql://") and "+asyncpg" not in url:
            url = url.replace("postgresql://", "postgresql+asyncpg://", 1)
        return url
    
    # Default to SQLite
    db_path = os.path.join(settings.data_path, "onlinetracker.db")
    return f"sqlite+aiosqlite:///{db_path}"


def is_postgresql() -> bool:
    """Check if using PostgreSQL database."""
    url = get_database_url()
    return url.startswith("postgresql")
