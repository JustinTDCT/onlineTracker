"""Settings schemas for API."""
from typing import Optional, Literal
from pydantic import BaseModel, Field


class SettingsResponse(BaseModel):
    """Schema for settings response."""
    # Monitoring settings
    check_interval_seconds: int = 60
    ssl_warn_days: str = "30,14,7"  # Comma-separated warning thresholds
    alert_failure_threshold: int = 2  # Number of consecutive failures before alerting (1-10)
    
    # Default thresholds for PING monitors
    default_ping_count: int = 5  # Number of pings to send (1-10)
    default_ping_ok_threshold_ms: int = 80  # Latency <= this = OK
    default_ping_degraded_threshold_ms: int = 200  # Latency <= this = Degraded, > = Down
    
    # Default thresholds for HTTP/HTTPS monitors
    default_http_request_count: int = 3  # Number of requests to send (1-10)
    default_http_ok_threshold_ms: int = 80  # Latency <= this = OK
    default_http_degraded_threshold_ms: int = 200  # Latency <= this = Degraded, > = Down
    
    # Default thresholds for SSL monitors
    default_ssl_ok_threshold_days: int = 30  # Days >= this = OK
    default_ssl_warning_threshold_days: int = 14  # Days >= this = Warning, < = Down
    
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
    
    # Push notification settings (iOS APNs)
    push_alerts_enabled: bool = False
    apns_key_id: Optional[str] = None
    apns_team_id: Optional[str] = None
    apns_bundle_id: Optional[str] = None
    apns_use_sandbox: bool = True


class SettingsUpdate(BaseModel):
    """Schema for updating settings."""
    # Monitoring settings
    check_interval_seconds: Optional[int] = Field(None, ge=10, le=3600)
    ssl_warn_days: Optional[str] = None
    alert_failure_threshold: Optional[int] = Field(None, ge=1, le=10)
    
    # Default thresholds for PING monitors
    default_ping_count: Optional[int] = Field(None, ge=1, le=10)
    default_ping_ok_threshold_ms: Optional[int] = Field(None, ge=1, le=10000)
    default_ping_degraded_threshold_ms: Optional[int] = Field(None, ge=1, le=10000)
    
    # Default thresholds for HTTP/HTTPS monitors
    default_http_request_count: Optional[int] = Field(None, ge=1, le=10)
    default_http_ok_threshold_ms: Optional[int] = Field(None, ge=1, le=30000)
    default_http_degraded_threshold_ms: Optional[int] = Field(None, ge=1, le=30000)
    
    # Default thresholds for SSL monitors
    default_ssl_ok_threshold_days: Optional[int] = Field(None, ge=1, le=365)
    default_ssl_warning_threshold_days: Optional[int] = Field(None, ge=1, le=365)
    
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
    
    # Push notification settings (iOS APNs)
    push_alerts_enabled: Optional[bool] = None
    apns_key_id: Optional[str] = None
    apns_team_id: Optional[str] = None
    apns_bundle_id: Optional[str] = None
    apns_use_sandbox: Optional[bool] = None
