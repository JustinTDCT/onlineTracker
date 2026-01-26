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
    # Monitoring settings
    "check_interval_seconds": "60",
    "ssl_warn_days": "30,14,7",
    
    # Agent settings
    "agent_timeout_minutes": "5",
    "shared_secret": "",
    "allowed_agent_uuids": "",  # Comma-separated list of allowed agent UUIDs
    
    # Alert settings
    "alert_type": "once",  # once, repeated, none
    "alert_repeat_frequency_minutes": "15",
    "alert_on_restored": "1",  # 0 or 1
    "alert_include_history": "event_only",  # event_only, last_24h
    
    # Webhook settings
    "webhook_url": "",
    
    # Email alert settings
    "email_alerts_enabled": "0",  # 0 or 1
    "smtp_host": "",
    "smtp_port": "587",
    "smtp_username": "",
    "smtp_password": "",
    "smtp_use_tls": "1",  # 0 or 1
    "alert_email_from": "",
    "alert_email_to": "",
}
