"""Application configuration from environment variables."""
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
    
    # Web server port (server mode)
    web_port: int = 8000
    
    # PostgreSQL database URL
    # Format: postgresql+asyncpg://user:pass@host:port/dbname
    database_url: str = "postgresql+asyncpg://onlinetracker:onlinetracker@postgres:5432/onlinetracker"
    
    class Config:
        env_prefix = ""
        case_sensitive = False


settings = Settings()


def get_database_url() -> str:
    """Get the database URL.
    
    Handles various PostgreSQL URL formats.
    """
    url = settings.database_url
    
    # Handle Heroku-style postgres:// URLs
    if url.startswith("postgres://"):
        url = url.replace("postgres://", "postgresql+asyncpg://", 1)
    elif url.startswith("postgresql://") and "+asyncpg" not in url:
        url = url.replace("postgresql://", "postgresql+asyncpg://", 1)
    
    return url
