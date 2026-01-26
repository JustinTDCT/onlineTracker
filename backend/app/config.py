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
    
    # Path for SQLite database storage
    data_path: str = "/data"
    
    # Web server port (server mode)
    web_port: int = 8000
    
    class Config:
        env_prefix = ""
        case_sensitive = False


settings = Settings()


def get_database_url() -> str:
    """Get the SQLite database URL."""
    db_path = os.path.join(settings.data_path, "onlinetracker.db")
    return f"sqlite+aiosqlite:///{db_path}"
