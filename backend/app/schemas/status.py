"""Status overview schemas for dashboard."""
from typing import List, Optional
from pydantic import BaseModel


class MonitorSummary(BaseModel):
    """Summary of a monitor for dashboard."""
    id: int
    name: str
    type: str
    status: str  # up, down, degraded, unknown
    uptime_24h: float  # Percentage
    last_check: Optional[str] = None


class StatusOverview(BaseModel):
    """Dashboard overview data."""
    total_monitors: int
    monitors_up: int
    monitors_down: int
    monitors_degraded: int
    monitors_unknown: int
    agents_total: int
    agents_pending: int
    overall_uptime_24h: float
    monitors: List[MonitorSummary]
