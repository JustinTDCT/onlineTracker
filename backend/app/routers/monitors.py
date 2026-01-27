"""Monitor CRUD API endpoints."""
import json
from datetime import datetime, timedelta
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_db
from ..models import Monitor, MonitorStatus, Setting
from ..models.settings import DEFAULT_SETTINGS
from ..schemas.monitor import (
    MonitorCreate,
    MonitorUpdate,
    MonitorResponse,
    MonitorWithStatus,
    MonitorTestResponse,
    StatusHistoryPoint,
    LatestStatus,
    PollPageRequest,
    PollPageResponse,
)
from ..schemas.status import MonitorResult, ResultsPage
from ..services.checker import checker_service
from ..utils.db_utils import retry_on_lock

import httpx
from datetime import datetime as dt

router = APIRouter(prefix="/api/monitors", tags=["monitors"])


class MonitorDefaults(BaseModel):
    """Default values for new monitors based on system settings."""
    check_interval: int
    ping_count: int
    ping_ok_threshold_ms: int
    ping_degraded_threshold_ms: int
    http_ok_threshold_ms: int
    http_degraded_threshold_ms: int
    ssl_ok_threshold_days: int
    ssl_warning_threshold_days: int


async def _get_all_settings(db: AsyncSession) -> dict:
    """Get all settings as a dictionary."""
    result = await db.execute(select(Setting))
    settings_list = result.scalars().all()
    
    # Start with defaults
    settings_dict = dict(DEFAULT_SETTINGS)
    
    # Override with stored values
    for setting in settings_list:
        settings_dict[setting.key] = setting.value
    
    return settings_dict


@router.get("/defaults", response_model=MonitorDefaults)
async def get_monitor_defaults(db: AsyncSession = Depends(get_db)):
    """Get default values for new monitors based on system settings."""
    settings = await _get_all_settings(db)
    
    return MonitorDefaults(
        check_interval=int(settings.get("check_interval_seconds", 60)),
        ping_count=int(settings.get("default_ping_count", 5)),
        ping_ok_threshold_ms=int(settings.get("default_ping_ok_threshold_ms", 80)),
        ping_degraded_threshold_ms=int(settings.get("default_ping_degraded_threshold_ms", 200)),
        http_ok_threshold_ms=int(settings.get("default_http_ok_threshold_ms", 80)),
        http_degraded_threshold_ms=int(settings.get("default_http_degraded_threshold_ms", 200)),
        ssl_ok_threshold_days=int(settings.get("default_ssl_ok_threshold_days", 30)),
        ssl_warning_threshold_days=int(settings.get("default_ssl_warning_threshold_days", 14)),
    )


@router.get("", response_model=List[MonitorWithStatus])
async def list_monitors(db: AsyncSession = Depends(get_db)):
    """List all monitors with their latest status."""
    result = await db.execute(select(Monitor).order_by(Monitor.name))
    monitors = result.scalars().all()
    
    response = []
    for monitor in monitors:
        # Get latest status
        status_result = await db.execute(
            select(MonitorStatus)
            .where(MonitorStatus.monitor_id == monitor.id)
            .order_by(MonitorStatus.checked_at.desc())
            .limit(1)
        )
        latest = status_result.scalar_one_or_none()
        
        config = None
        if monitor.config:
            try:
                config = json.loads(monitor.config)
            except json.JSONDecodeError:
                pass
        
        monitor_data = MonitorWithStatus(
            id=monitor.id,
            agent_id=monitor.agent_id,
            type=monitor.type,
            name=monitor.name,
            description=monitor.description,
            target=monitor.target,
            config=config,
            check_interval=monitor.check_interval,
            enabled=bool(monitor.enabled),
            created_at=monitor.created_at,
            latest_status=LatestStatus(
                status=latest.status,
                response_time_ms=latest.response_time_ms,
                checked_at=latest.checked_at,
                details=latest.details,
                ssl_expiry_days=latest.ssl_expiry_days,
            ) if latest else None,
        )
        response.append(monitor_data)
    
    return response


@router.post("", response_model=MonitorResponse, status_code=201)
async def create_monitor(monitor: MonitorCreate, db: AsyncSession = Depends(get_db)):
    """Create a new monitor."""
    config_json = None
    if monitor.config:
        config_json = json.dumps(monitor.config.model_dump())
    
    db_monitor = Monitor(
        type=monitor.type,
        name=monitor.name,
        description=monitor.description,
        target=monitor.target,
        config=config_json,
        check_interval=monitor.check_interval,
        enabled=1 if monitor.enabled else 0,
        agent_id=monitor.agent_id if monitor.agent_id else None,
    )
    db.add(db_monitor)
    
    # Use retry logic for commit to handle database lock contention
    async def do_commit():
        await db.commit()
    
    await retry_on_lock(do_commit)
    await db.refresh(db_monitor)
    
    return MonitorResponse(
        id=db_monitor.id,
        agent_id=db_monitor.agent_id,
        type=db_monitor.type,
        name=db_monitor.name,
        description=db_monitor.description,
        target=db_monitor.target,
        config=json.loads(db_monitor.config) if db_monitor.config else None,
        check_interval=db_monitor.check_interval,
        enabled=bool(db_monitor.enabled),
        created_at=db_monitor.created_at,
    )


@router.get("/{monitor_id}", response_model=MonitorWithStatus)
async def get_monitor(monitor_id: int, db: AsyncSession = Depends(get_db)):
    """Get a specific monitor by ID."""
    result = await db.execute(select(Monitor).where(Monitor.id == monitor_id))
    monitor = result.scalar_one_or_none()
    
    if not monitor:
        raise HTTPException(status_code=404, detail="Monitor not found")
    
    # Get latest status
    status_result = await db.execute(
        select(MonitorStatus)
        .where(MonitorStatus.monitor_id == monitor.id)
        .order_by(MonitorStatus.checked_at.desc())
        .limit(1)
    )
    latest = status_result.scalar_one_or_none()
    
    config = None
    if monitor.config:
        try:
            config = json.loads(monitor.config)
        except json.JSONDecodeError:
            pass
    
    return MonitorWithStatus(
        id=monitor.id,
        agent_id=monitor.agent_id,
        type=monitor.type,
        name=monitor.name,
        description=monitor.description,
        target=monitor.target,
        config=config,
        check_interval=monitor.check_interval,
        enabled=bool(monitor.enabled),
        created_at=monitor.created_at,
        latest_status=LatestStatus(
            status=latest.status,
            response_time_ms=latest.response_time_ms,
            checked_at=latest.checked_at,
            details=latest.details,
            ssl_expiry_days=latest.ssl_expiry_days,
        ) if latest else None,
    )


@router.put("/{monitor_id}", response_model=MonitorResponse)
async def update_monitor(
    monitor_id: int,
    update: MonitorUpdate,
    db: AsyncSession = Depends(get_db),
):
    """Update a monitor."""
    result = await db.execute(select(Monitor).where(Monitor.id == monitor_id))
    monitor = result.scalar_one_or_none()
    
    if not monitor:
        raise HTTPException(status_code=404, detail="Monitor not found")
    
    # Update fields
    if update.name is not None:
        monitor.name = update.name
    if update.description is not None:
        monitor.description = update.description
    if update.target is not None:
        monitor.target = update.target
    if update.config is not None:
        monitor.config = json.dumps(update.config.model_dump())
    if update.check_interval is not None:
        monitor.check_interval = update.check_interval
    if update.enabled is not None:
        monitor.enabled = 1 if update.enabled else 0
    if update.agent_id is not None:
        # Empty string means unassign from agent (server-side monitoring)
        monitor.agent_id = update.agent_id if update.agent_id else None
    
    # Use retry logic for commit to handle database lock contention
    async def do_commit():
        await db.commit()
    
    await retry_on_lock(do_commit)
    await db.refresh(monitor)
    
    return MonitorResponse(
        id=monitor.id,
        agent_id=monitor.agent_id,
        type=monitor.type,
        name=monitor.name,
        description=monitor.description,
        target=monitor.target,
        config=json.loads(monitor.config) if monitor.config else None,
        check_interval=monitor.check_interval,
        enabled=bool(monitor.enabled),
        created_at=monitor.created_at,
    )


@router.delete("/{monitor_id}", status_code=204)
async def delete_monitor(monitor_id: int, db: AsyncSession = Depends(get_db)):
    """Delete a monitor."""
    result = await db.execute(select(Monitor).where(Monitor.id == monitor_id))
    monitor = result.scalar_one_or_none()
    
    if not monitor:
        raise HTTPException(status_code=404, detail="Monitor not found")
    
    await db.delete(monitor)
    
    # Use retry logic for commit to handle database lock contention
    async def do_commit():
        await db.commit()
    
    await retry_on_lock(do_commit)


@router.post("/{monitor_id}/test", response_model=MonitorTestResponse)
async def test_monitor(monitor_id: int, db: AsyncSession = Depends(get_db)):
    """Test a monitor and return current response (useful for capturing expected hash)."""
    result = await db.execute(select(Monitor).where(Monitor.id == monitor_id))
    monitor = result.scalar_one_or_none()
    
    if not monitor:
        raise HTTPException(status_code=404, detail="Monitor not found")
    
    config = {}
    if monitor.config:
        try:
            config = json.loads(monitor.config)
        except json.JSONDecodeError:
            pass
    
    check_result = await checker_service.check(monitor.type, monitor.target, config)
    
    return MonitorTestResponse(
        status=check_result.status,
        response_time_ms=check_result.response_time_ms,
        details=check_result.details,
        captured_hash=check_result.body_hash,
        ssl_expiry_days=check_result.ssl_expiry_days,
    )


@router.post("/poll", response_model=PollPageResponse)
async def poll_page(request: PollPageRequest):
    """Poll a URL and return the page content for setting up expected content matching."""
    import re
    
    url = request.url
    
    # Ensure URL has protocol
    if not url.startswith("http"):
        url = f"{'https' if request.secure else 'http'}://{url}"
    
    try:
        start = dt.now()
        
        # Disable SSL verification to handle self-signed certs
        async with httpx.AsyncClient(timeout=10, follow_redirects=True, verify=False) as client:
            response = await client.get(url)
        
        response_time = int((dt.now() - start).total_seconds() * 1000)
        
        # Get content type
        content_type = response.headers.get("content-type", "")
        
        # Try to extract page title for suggested match text
        text = response.text
        suggested_content = ""
        
        # Try to find <title> tag
        title_match = re.search(r'<title[^>]*>([^<]+)</title>', text, re.IGNORECASE)
        if title_match:
            suggested_content = title_match.group(1).strip()
        
        # If no title, try first <h1>
        if not suggested_content:
            h1_match = re.search(r'<h1[^>]*>([^<]+)</h1>', text, re.IGNORECASE)
            if h1_match:
                suggested_content = h1_match.group(1).strip()
        
        # Return first 10KB of content to avoid huge responses
        content = text[:10240]
        
        return PollPageResponse(
            status_code=response.status_code,
            content=content,
            content_type=content_type,
            response_time_ms=response_time,
            suggested_content=suggested_content if suggested_content else None,
        )
    except httpx.TimeoutException:
        raise HTTPException(status_code=504, detail="Request timeout")
    except httpx.ConnectError as e:
        raise HTTPException(status_code=502, detail=f"Connection error: {e}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{monitor_id}/history", response_model=List[StatusHistoryPoint])
async def get_monitor_history(
    monitor_id: int,
    hours: int = Query(default=72, ge=1, le=8760),  # Max 1 year
    db: AsyncSession = Depends(get_db),
):
    """Get status history for a monitor, grouped into 15-minute intervals."""
    result = await db.execute(select(Monitor).where(Monitor.id == monitor_id))
    monitor = result.scalar_one_or_none()
    
    if not monitor:
        raise HTTPException(status_code=404, detail="Monitor not found")
    
    cutoff = datetime.utcnow() - timedelta(hours=hours)
    
    # Get all status records in the time range
    status_result = await db.execute(
        select(MonitorStatus)
        .where(
            MonitorStatus.monitor_id == monitor_id,
            MonitorStatus.checked_at >= cutoff,
        )
        .order_by(MonitorStatus.checked_at)
    )
    statuses = status_result.scalars().all()
    
    # Group into 15-minute intervals
    interval_minutes = 15
    history = []
    
    if not statuses:
        return history
    
    # Create time buckets
    current_time = cutoff
    end_time = datetime.utcnow()
    
    while current_time < end_time:
        bucket_end = current_time + timedelta(minutes=interval_minutes)
        
        # Find statuses in this bucket
        bucket_statuses = [
            s for s in statuses
            if current_time <= s.checked_at < bucket_end
        ]
        
        if bucket_statuses:
            # Calculate uptime percentage
            up_count = sum(1 for s in bucket_statuses if s.status == "up")
            uptime = (up_count / len(bucket_statuses)) * 100
            
            # Determine overall status for the bucket
            status_counts = {}
            for s in bucket_statuses:
                status_counts[s.status] = status_counts.get(s.status, 0) + 1
            
            if status_counts.get("down", 0) > 0:
                bucket_status = "down"
            elif status_counts.get("degraded", 0) > 0:
                bucket_status = "degraded"
            elif status_counts.get("up", 0) > 0:
                bucket_status = "up"
            else:
                bucket_status = "unknown"
            
            # Calculate average response time
            response_times = [s.response_time_ms for s in bucket_statuses if s.response_time_ms]
            avg_response = int(sum(response_times) / len(response_times)) if response_times else None
            
            history.append(StatusHistoryPoint(
                timestamp=current_time,
                status=bucket_status,
                uptime_percent=round(uptime, 2),
                response_time_avg_ms=avg_response,
            ))
        else:
            # No data for this bucket
            history.append(StatusHistoryPoint(
                timestamp=current_time,
                status="unknown",
                uptime_percent=0,
                response_time_avg_ms=None,
            ))
        
        current_time = bucket_end
    
    return history


@router.get("/{monitor_id}/results", response_model=ResultsPage)
async def get_monitor_results(
    monitor_id: int,
    hours: int = Query(default=24, ge=1, le=8760),  # Max 1 year
    page: int = Query(default=1, ge=1),
    per_page: int = Query(default=25, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
):
    """Get paginated individual check results for a monitor."""
    result = await db.execute(select(Monitor).where(Monitor.id == monitor_id))
    monitor = result.scalar_one_or_none()
    
    if not monitor:
        raise HTTPException(status_code=404, detail="Monitor not found")
    
    cutoff = datetime.utcnow() - timedelta(hours=hours)
    
    # Get total count
    count_result = await db.execute(
        select(func.count(MonitorStatus.id))
        .where(
            MonitorStatus.monitor_id == monitor_id,
            MonitorStatus.checked_at >= cutoff,
        )
    )
    total = count_result.scalar() or 0
    
    # Calculate pagination
    total_pages = (total + per_page - 1) // per_page if total > 0 else 1
    offset = (page - 1) * per_page
    
    # Get paginated results
    status_result = await db.execute(
        select(MonitorStatus)
        .where(
            MonitorStatus.monitor_id == monitor_id,
            MonitorStatus.checked_at >= cutoff,
        )
        .order_by(MonitorStatus.checked_at.desc())
        .offset(offset)
        .limit(per_page)
    )
    statuses = status_result.scalars().all()
    
    items = [
        MonitorResult(
            id=s.id,
            checked_at=s.checked_at.isoformat(),
            status=s.status,
            response_time_ms=s.response_time_ms,
            details=s.details,
            ssl_expiry_days=s.ssl_expiry_days,
        )
        for s in statuses
    ]
    
    return ResultsPage(
        items=items,
        total=total,
        page=page,
        per_page=per_page,
        total_pages=total_pages,
    )
