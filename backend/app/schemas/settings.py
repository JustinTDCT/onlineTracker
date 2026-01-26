"""Settings schemas for API."""
from typing import Optional
from pydantic import BaseModel, Field


class SettingsResponse(BaseModel):
    """Schema for settings response."""
    agent_timeout_minutes: int = 5
    check_interval_seconds: int = 60
    ssl_warn_days: str = "30,14,7"  # Comma-separated warning thresholds
    webhook_url: Optional[str] = None


class SettingsUpdate(BaseModel):
    """Schema for updating settings."""
    agent_timeout_minutes: Optional[int] = Field(None, ge=1, le=60)
    check_interval_seconds: Optional[int] = Field(None, ge=10, le=3600)
    ssl_warn_days: Optional[str] = None
    webhook_url: Optional[str] = None
