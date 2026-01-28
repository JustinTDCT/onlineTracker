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
    "alert_failure_threshold": "2",  # Number of consecutive failures before alerting (1-10)
    
    # Default thresholds for PING monitors (latency in ms)
    "default_ping_count": "5",  # Number of pings to send (1-10)
    "default_ping_ok_threshold_ms": "80",  # Latency <= this = OK
    "default_ping_degraded_threshold_ms": "200",  # Latency <= this = Degraded, > = Down
    
    # Default thresholds for HTTP/HTTPS monitors (latency in ms)
    "default_http_request_count": "3",  # Number of requests to send (1-10)
    "default_http_ok_threshold_ms": "80",  # Latency <= this = OK
    "default_http_degraded_threshold_ms": "200",  # Latency <= this = Degraded, > = Down
    
    # Default thresholds for SSL monitors (days until expiry)
    "default_ssl_ok_threshold_days": "30",  # Days >= this = OK
    "default_ssl_warning_threshold_days": "14",  # Days >= this = Warning, < = Down
    
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
    
    # Push notification settings (iOS APNs)
    "push_alerts_enabled": "0",  # 0 or 1
    "apns_key_path": "",  # Path to .p8 key file
    "apns_key_id": "",  # Key ID from Apple
    "apns_team_id": "",  # Team ID from Apple
    "apns_bundle_id": "",  # App bundle identifier
    "apns_use_sandbox": "1",  # 0 for production, 1 for sandbox/development
}
