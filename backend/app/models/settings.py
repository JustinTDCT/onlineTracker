"""Settings model - key-value store for global configuration."""
from datetime import datetime
from sqlalchemy import Column, String, DateTime

from ..database import Base


class Setting(Base):
    """Global settings stored as key-value pairs."""
    
    __tablename__ = "settings"
    
    key = Column(String, primary_key=True)
    value = Column(String, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


# Default settings
DEFAULT_SETTINGS = {
    "agent_timeout_minutes": "5",
    "check_interval_seconds": "60",
    "ssl_warn_days": "30,14,7",
    "webhook_url": "",
}
