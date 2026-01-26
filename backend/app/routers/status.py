"""Status overview API for dashboard."""
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_db
from ..models import Monitor, MonitorStatus, Agent
from ..schemas.status import StatusOverview, MonitorSummary

router = APIRouter(prefix="/api/status", tags=["status"])


@router.get("/overview", response_model=StatusOverview)
async def get_status_overview(db: AsyncSession = Depends(get_db)):
    """Get dashboard overview data."""
    # Get all monitors
    result = await db.execute(select(Monitor))
    monitors = result.scalars().all()
    
    # Get agent counts
    agents_result = await db.execute(select(Agent))
    agents = agents_result.scalars().all()
    agents_total = len(agents)
    agents_pending = sum(1 for a in agents if a.approved == 0)
    
    # Prepare monitor summaries
    monitor_summaries = []
    counts = {"up": 0, "down": 0, "degraded": 0, "unknown": 0}
    total_uptime = 0
    
    cutoff_24h = datetime.utcnow() - timedelta(hours=24)
    
    for monitor in monitors:
        # Get latest status
        latest_result = await db.execute(
            select(MonitorStatus)
            .where(MonitorStatus.monitor_id == monitor.id)
            .order_by(MonitorStatus.checked_at.desc())
            .limit(1)
        )
        latest = latest_result.scalar_one_or_none()
        current_status = latest.status if latest else "unknown"
        
        # Count by status
        if current_status in counts:
            counts[current_status] += 1
        else:
            counts["unknown"] += 1
        
        # Calculate 24h uptime
        uptime_result = await db.execute(
            select(MonitorStatus)
            .where(
                MonitorStatus.monitor_id == monitor.id,
                MonitorStatus.checked_at >= cutoff_24h,
            )
        )
        statuses_24h = uptime_result.scalars().all()
        
        if statuses_24h:
            up_count = sum(1 for s in statuses_24h if s.status == "up")
            uptime_24h = (up_count / len(statuses_24h)) * 100
        else:
            uptime_24h = 0
        
        total_uptime += uptime_24h
        
        monitor_summaries.append(MonitorSummary(
            id=monitor.id,
            name=monitor.name,
            type=monitor.type,
            status=current_status,
            uptime_24h=round(uptime_24h, 2),
            last_check=latest.checked_at.isoformat() if latest else None,
        ))
    
    # Calculate overall uptime
    overall_uptime = (total_uptime / len(monitors)) if monitors else 0
    
    return StatusOverview(
        total_monitors=len(monitors),
        monitors_up=counts["up"],
        monitors_down=counts["down"],
        monitors_degraded=counts["degraded"],
        monitors_unknown=counts["unknown"],
        agents_total=agents_total,
        agents_pending=agents_pending,
        overall_uptime_24h=round(overall_uptime, 2),
        monitors=monitor_summaries,
    )
