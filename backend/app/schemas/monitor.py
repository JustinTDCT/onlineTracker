"""Monitor schemas for API."""
from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field


class MonitorConfig(BaseModel):
    """Configuration for monitor checks."""
    expected_status: Optional[int] = None  # HTTP status code
    expected_body_hash: Optional[str] = None  # MD5 hash of expected response
    timeout_seconds: int = 10


class MonitorCreate(BaseModel):
    """Schema for creating a new monitor."""
    type: str = Field(..., pattern="^(ping|http|https|ssl)$")
    name: str = Field(..., min_length=1, max_length=255)
    description: Optional[str] = Field(None, max_length=500)
    target: str = Field(..., min_length=1)
    config: Optional[MonitorConfig] = None
    check_interval: int = Field(default=60, ge=10, le=3600)
    enabled: bool = True


class MonitorUpdate(BaseModel):
    """Schema for updating a monitor."""
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    description: Optional[str] = Field(None, max_length=500)
    target: Optional[str] = Field(None, min_length=1)
    config: Optional[MonitorConfig] = None
    check_interval: Optional[int] = Field(None, ge=10, le=3600)
    enabled: Optional[bool] = None


class MonitorResponse(BaseModel):
    """Schema for monitor in API responses."""
    id: int
    agent_id: Optional[str] = None
    type: str
    name: str
    description: Optional[str] = None
    target: str
    config: Optional[dict] = None
    check_interval: int
    enabled: bool
    created_at: datetime
    
    class Config:
        from_attributes = True


class LatestStatus(BaseModel):
    """Latest status for a monitor."""
    status: str
    response_time_ms: Optional[int] = None
    checked_at: datetime
    details: Optional[str] = None


class MonitorWithStatus(MonitorResponse):
    """Monitor with its latest status."""
    latest_status: Optional[LatestStatus] = None


class StatusHistoryPoint(BaseModel):
    """A point in the status history for graphing."""
    timestamp: datetime
    status: str  # up, down, degraded, unknown
    uptime_percent: float
    response_time_avg_ms: Optional[int] = None


class MonitorTestResponse(BaseModel):
    """Response from testing a monitor."""
    status: str
    response_time_ms: Optional[int] = None
    details: Optional[str] = None
    captured_hash: Optional[str] = None  # For HTTP, the body hash
    ssl_expiry_days: Optional[int] = None  # For SSL checks
