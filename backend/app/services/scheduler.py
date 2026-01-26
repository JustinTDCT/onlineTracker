"""Scheduler service - manages periodic monitoring checks."""
import json
import logging
from datetime import datetime, timedelta
from typing import Optional

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.interval import IntervalTrigger
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import async_session
from ..models import Monitor, MonitorStatus, PingResult, Setting
from ..models.settings import DEFAULT_SETTINGS
from .checker import checker_service
from .alerter import alerter_service

logger = logging.getLogger(__name__)


class SchedulerService:
    """Service for scheduling and running periodic checks."""
    
    def __init__(self):
        self.scheduler: Optional[AsyncIOScheduler] = None
        self._running = False
    
    def start(self):
        """Start the scheduler."""
        if self._running:
            return
        
        self.scheduler = AsyncIOScheduler()
        
        # Add job to run checks
        self.scheduler.add_job(
            self._run_checks,
            trigger=IntervalTrigger(seconds=30),
            id="run_checks",
            replace_existing=True,
        )
        
        # Add job to cleanup old status records
        self.scheduler.add_job(
            self._cleanup_old_records,
            trigger=IntervalTrigger(hours=1),
            id="cleanup_old_records",
            replace_existing=True,
        )
        
        self.scheduler.start()
        self._running = True
        logger.info("Scheduler started")
    
    def stop(self):
        """Stop the scheduler."""
        if self.scheduler and self._running:
            self.scheduler.shutdown(wait=False)
            self._running = False
            logger.info("Scheduler stopped")
    
    async def _run_checks(self):
        """Run all pending checks."""
        try:
            async with async_session() as session:
                # Get all enabled server-side monitors
                result = await session.execute(
                    select(Monitor).where(
                        Monitor.enabled == 1,
                        Monitor.agent_id.is_(None),  # Server-side only
                    )
                )
                monitors = result.scalars().all()
                
                for monitor in monitors:
                    await self._check_monitor(session, monitor)
                
                await session.commit()
        except Exception as e:
            logger.error(f"Error running checks: {e}")
    
    async def _check_monitor(self, session: AsyncSession, monitor: Monitor):
        """Check a single monitor and record the result."""
        try:
            # Get last check time
            result = await session.execute(
                select(MonitorStatus)
                .where(MonitorStatus.monitor_id == monitor.id)
                .order_by(MonitorStatus.checked_at.desc())
                .limit(1)
            )
            last_status = result.scalar_one_or_none()
            
            # Check if enough time has passed
            if last_status:
                elapsed = (datetime.utcnow() - last_status.checked_at).total_seconds()
                if elapsed < monitor.check_interval:
                    return
            
            # Parse config
            config = {}
            if monitor.config:
                try:
                    config = json.loads(monitor.config)
                except json.JSONDecodeError:
                    pass
            
            # Perform check
            check_result = await checker_service.check(monitor.type, monitor.target, config)
            
            # Record status
            new_status = MonitorStatus(
                monitor_id=monitor.id,
                status=check_result.status,
                response_time_ms=check_result.response_time_ms,
                details=check_result.details,
                ssl_expiry_days=check_result.ssl_expiry_days,
            )
            session.add(new_status)
            await session.flush()  # Get the new_status.id
            
            # Record individual ping results if this is a ping monitor
            if monitor.type == "ping" and check_result.ping_results:
                for ping_data in check_result.ping_results:
                    ping_result = PingResult(
                        status_id=new_status.id,
                        sequence=ping_data.sequence,
                        success=ping_data.success,
                        response_time_ms=ping_data.response_time_ms,
                        details=ping_data.details,
                    )
                    session.add(ping_result)
            
            # Check for state change and trigger alert
            if last_status and last_status.status != check_result.status:
                await alerter_service.send_alert(
                    session,
                    monitor,
                    check_result.status,
                    check_result.details,
                )
            
            logger.debug(f"Monitor {monitor.name}: {check_result.status}")
            
        except Exception as e:
            logger.error(f"Error checking monitor {monitor.id}: {e}")
    
    async def _cleanup_old_records(self):
        """Delete status records older than 365 days."""
        try:
            cutoff = datetime.utcnow() - timedelta(days=365)
            
            async with async_session() as session:
                await session.execute(
                    delete(MonitorStatus).where(MonitorStatus.checked_at < cutoff)
                )
                await session.commit()
                logger.info("Cleaned up old status records")
        except Exception as e:
            logger.error(f"Error cleaning up records: {e}")


# Global instance
scheduler_service = SchedulerService()
