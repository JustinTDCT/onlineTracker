"""Scheduler service - manages periodic monitoring checks.

Scalability Design:
- Uses per-monitor time slots to distribute checks evenly
- Each monitor gets an offset based on its ID to prevent burst traffic
- Scheduler ticks every 5 seconds for fine-grained scheduling
- Concurrent checks limited to prevent resource contention while maintaining throughput

Capacity: With 10 concurrent checks and ~5s average check duration:
- Can handle ~120 monitors per minute on 60s intervals
- Scale by increasing MAX_CONCURRENT_CHECKS or adding more server instances
"""
import asyncio
import json
import logging
from datetime import datetime, timedelta
from typing import Optional, List, Tuple

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
# Increased for better throughput with distributed scheduling
MAX_CONCURRENT_CHECKS = 10

# Scheduler tick interval in seconds
# Smaller values = more precise scheduling, slightly higher overhead
SCHEDULER_TICK_SECONDS = 5

# Prime number for offset calculation to ensure good distribution
OFFSET_PRIME = 7


class SchedulerService:
    """Service for scheduling and running periodic checks with distributed timing."""
    
    def __init__(self):
        self.scheduler: Optional[AsyncIOScheduler] = None
        self._running = False
    
    def start(self):
        """Start the scheduler."""
        if self._running:
            return
        
        self.scheduler = AsyncIOScheduler()
        
        # Add job to run checks with fine-grained tick interval
        # This allows precise per-monitor scheduling
        self.scheduler.add_job(
            self._run_checks,
            trigger=IntervalTrigger(seconds=SCHEDULER_TICK_SECONDS),
            id="run_checks",
            replace_existing=True,
            max_instances=1,
            misfire_grace_time=SCHEDULER_TICK_SECONDS,
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
        logger.info(f"Scheduler started (tick={SCHEDULER_TICK_SECONDS}s, max_concurrent={MAX_CONCURRENT_CHECKS})")
    
    def stop(self):
        """Stop the scheduler."""
        if self.scheduler and self._running:
            self.scheduler.shutdown(wait=False)
            self._running = False
            logger.info("Scheduler stopped")
    
    def _calculate_monitor_offset(self, monitor_id: int, check_interval: int) -> int:
        """Calculate time offset for a monitor to distribute checks evenly.
        
        Uses monitor ID to create a deterministic offset within the check interval.
        This ensures monitors with the same interval don't all fire at once.
        
        Args:
            monitor_id: Unique monitor ID
            check_interval: Monitor's check interval in seconds
            
        Returns:
            Offset in seconds (0 to check_interval-1)
        """
        # Use prime multiplication for better distribution
        return (monitor_id * OFFSET_PRIME) % check_interval
    
    def _is_monitor_due(
        self, 
        monitor_id: int, 
        check_interval: int, 
        last_check_time: Optional[datetime]
    ) -> bool:
        """Determine if a monitor is due for checking.
        
        Uses per-monitor offset to distribute checks evenly across time.
        
        Args:
            monitor_id: Unique monitor ID
            check_interval: Monitor's check interval in seconds  
            last_check_time: Time of last check, or None if never checked
            
        Returns:
            True if monitor should be checked now
        """
        now = datetime.utcnow()
        
        # Never checked - check immediately (new monitors get priority)
        if last_check_time is None:
            return True
        
        # Calculate time since last check
        elapsed = (now - last_check_time).total_seconds()
        
        # Check if interval has passed
        # Add small buffer (half the tick interval) to prevent edge cases
        return elapsed >= (check_interval - SCHEDULER_TICK_SECONDS / 2)
    
    async def _run_checks(self):
        """Run checks for monitors that are due, with distributed scheduling."""
        try:
            now = datetime.utcnow()
            
            # Get all enabled server-side monitors with their last check time
            async with async_session() as session:
                # Subquery to get last check time per monitor
                from sqlalchemy import func
                from sqlalchemy.orm import aliased
                
                # Get monitors with their last check time
                result = await session.execute(
                    select(
                        Monitor.id,
                        Monitor.check_interval,
                        func.max(MonitorStatus.checked_at).label('last_checked')
                    )
                    .outerjoin(MonitorStatus, Monitor.id == MonitorStatus.monitor_id)
                    .where(
                        Monitor.enabled == 1,
                        Monitor.agent_id.is_(None),  # Server-side only
                    )
                    .group_by(Monitor.id, Monitor.check_interval)
                )
                monitors_data = result.fetchall()
            
            if not monitors_data:
                return
            
            # Filter to only monitors that are due
            due_monitors = []
            for monitor_id, check_interval, last_checked in monitors_data:
                if self._is_monitor_due(monitor_id, check_interval, last_checked):
                    due_monitors.append(monitor_id)
            
            if not due_monitors:
                return
            
            logger.debug(f"Checking {len(due_monitors)} due monitors out of {len(monitors_data)} total")
            
            # Use semaphore to limit concurrent checks
            semaphore = asyncio.Semaphore(MAX_CONCURRENT_CHECKS)
            
            async def check_with_limit(monitor_id: int):
                async with semaphore:
                    await self._check_single_monitor(monitor_id)
            
            # Run checks in parallel with concurrency limit
            await asyncio.gather(*[check_with_limit(mid) for mid in due_monitors])
                    
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
        """Check a single monitor and record the result.
        
        Note: This method assumes the caller has already verified the monitor is due.
        A safety check is included to prevent duplicate checks in case of race conditions.
        """
        try:
            # Get last status for comparison (for alerts)
            result = await session.execute(
                select(MonitorStatus)
                .where(MonitorStatus.monitor_id == monitor.id)
                .order_by(MonitorStatus.checked_at.desc())
                .limit(1)
            )
            last_status = result.scalar_one_or_none()
            
            # Safety check: verify still due (race condition protection)
            if last_status:
                elapsed = (datetime.utcnow() - last_status.checked_at).total_seconds()
                if elapsed < (monitor.check_interval - SCHEDULER_TICK_SECONDS):
                    return  # Already checked recently
            
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
