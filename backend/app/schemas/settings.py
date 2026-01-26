"""Settings schemas for API."""
from typing import Optional, Literal
from pydantic import BaseModel, Field


class SettingsResponse(BaseModel):
    """Schema for settings response."""
    # Monitoring settings
    check_interval_seconds: int = 60
    ssl_warn_days: str = "30,14,7"  # Comma-separated warning thresholds
    
    # Agent settings
    agent_timeout_minutes: int = 5
    shared_secret: Optional[str] = None
    allowed_agent_uuids: Optional[str] = None  # Comma-separated list of allowed agent UUIDs
    
    # Alert settings
    alert_type: str = "once"  # once, repeated, none
    alert_repeat_frequency_minutes: int = 15
    alert_on_restored: bool = True
    alert_include_history: str = "event_only"  # event_only, last_24h
    
    # Webhook settings
    webhook_url: Optional[str] = None
    
    # Email alert settings
    email_alerts_enabled: bool = False
    smtp_host: Optional[str] = None
    smtp_port: int = 587
    smtp_username: Optional[str] = None
    smtp_password: Optional[str] = None
    smtp_use_tls: bool = True
    alert_email_from: Optional[str] = None
    alert_email_to: Optional[str] = None


class SettingsUpdate(BaseModel):
    """Schema for updating settings."""
    # Monitoring settings
    check_interval_seconds: Optional[int] = Field(None, ge=10, le=3600)
    ssl_warn_days: Optional[str] = None
    
    # Agent settings
    agent_timeout_minutes: Optional[int] = Field(None, ge=1, le=60)
    shared_secret: Optional[str] = None
    allowed_agent_uuids: Optional[str] = None
    
    # Alert settings
    alert_type: Optional[Literal["once", "repeated", "none"]] = None
    alert_repeat_frequency_minutes: Optional[int] = Field(None, ge=1, le=1440)
    alert_on_restored: Optional[bool] = None
    alert_include_history: Optional[Literal["event_only", "last_24h"]] = None
    
    # Webhook settings
    webhook_url: Optional[str] = None
    
    # Email alert settings
    email_alerts_enabled: Optional[bool] = None
    smtp_host: Optional[str] = None
    smtp_port: Optional[int] = Field(None, ge=1, le=65535)
    smtp_username: Optional[str] = None
    smtp_password: Optional[str] = None
    smtp_use_tls: Optional[bool] = None
    alert_email_from: Optional[str] = None
    alert_email_to: Optional[str] = None
