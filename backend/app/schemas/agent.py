"""Agent schemas for API."""
from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, Field


class AgentRegister(BaseModel):
    """Schema for agent registration request."""
    uuid: str = Field(..., min_length=36, max_length=36)
    secret_hash: str = Field(..., min_length=64, max_length=64)  # SHA-256 hash


class AgentResponse(BaseModel):
    """Schema for agent in API responses."""
    id: str
    name: Optional[str] = None
    status: str  # pending, approved, rejected
    last_seen: Optional[datetime] = None
    created_at: datetime
    monitor_count: int = 0
    
    class Config:
        from_attributes = True


class AgentApproval(BaseModel):
    """Schema for approving/rejecting an agent."""
    approved: bool
    name: Optional[str] = None  # Optional friendly name


class CheckResult(BaseModel):
    """Result of a single check from an agent."""
    monitor_id: int
    status: str = Field(..., pattern="^(up|down|degraded|unknown)$")
    response_time_ms: Optional[int] = None
    details: Optional[str] = None
    checked_at: datetime


class AgentReport(BaseModel):
    """Schema for agent reporting check results."""
    uuid: str
    secret: str  # Plain text secret for verification
    results: List[CheckResult]
