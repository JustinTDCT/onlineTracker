"""Scheduler service - manages periodic monitoring checks."""
import asyncio
import json
import logging
from datetime import datetime, timedelta
from typing import Optional, List

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.interval import IntervalTrigger
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import async_session
from ..models import Monitor, MonitorStatus, PingResult, Setting
from ..models.settings import DEFAULT_SETTINGS
from ..utils.db_utils import retry_on_lock
from .checker import checker_service
from .alerter import alerter_service

logger = logging.getLogger(__name__)

# Maximum concurrent server-side checks
MAX_CONCURRENT_CHECKS = 5


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
        # max_instances=1 prevents job pile-up if checks take longer than interval
        # misfire_grace_time allows late execution if scheduler was busy
        self.scheduler.add_job(
            self._run_checks,
            trigger=IntervalTrigger(seconds=30),
            id="run_checks",
            replace_existing=True,
            max_instances=1,
            misfire_grace_time=30,
        )
        
        # Add job to cleanup old status records
        self.scheduler.add_job(
            self._cleanup_old_records,
            trigger=IntervalTrigger(hours=1),
            id="cleanup_old_records",
            replace_existing=True,
            max_instances=1,
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
        """Run all pending checks with parallel execution."""
        try:
            # First, get the list of monitor IDs to check (read-only, short lock)
            async with async_session() as session:
                result = await session.execute(
                    select(Monitor.id).where(
                        Monitor.enabled == 1,
                        Monitor.agent_id.is_(None),  # Server-side only
                    )
                )
                monitor_ids = [row[0] for row in result.fetchall()]
            
            if not monitor_ids:
                return
            
            # Use semaphore to limit concurrent checks
            semaphore = asyncio.Semaphore(MAX_CONCURRENT_CHECKS)
            
            async def check_with_limit(monitor_id: int):
                async with semaphore:
                    await self._check_single_monitor(monitor_id)
            
            # Run checks in parallel with concurrency limit
            await asyncio.gather(*[check_with_limit(mid) for mid in monitor_ids])
                    
        except Exception as e:
            logger.error(f"Error running checks: {e}")
    
    async def _check_single_monitor(self, monitor_id: int):
        """Check a single monitor in its own session."""
        try:
            async with async_session() as session:
                result = await session.execute(
                    select(Monitor).where(Monitor.id == monitor_id)
                )
                monitor = result.scalar_one_or_none()
                if monitor:
                    await self._check_monitor(session, monitor)
                    await retry_on_lock(session.commit)
        except Exception as e:
            logger.error(f"Error checking monitor {monitor_id}: {e}")
    
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
            
            # Trigger alert logic (handles state changes and repeated alerts)
            old_status_str = last_status.status if last_status else None
            await alerter_service.send_alert(
                session,
                monitor,
                check_result.status,
                check_result.details,
                old_status_str,
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
                await retry_on_lock(session.commit)
                logger.info("Cleaned up old status records")
        except Exception as e:
            logger.error(f"Error cleaning up records: {e}")


# Global instance
scheduler_service = SchedulerService()
