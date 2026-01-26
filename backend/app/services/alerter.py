"""Alerter service - sends webhook and email notifications on state changes."""
import json
import logging
from datetime import datetime, timedelta
from typing import Optional, List

import httpx
from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession

from ..models import Monitor, Alert, Setting, MonitorStatus
from .email_sender import email_sender_service, EmailConfig

logger = logging.getLogger(__name__)


class AlerterService:
    """Service for sending webhook and email alerts."""
    
    async def _get_settings(self, session: AsyncSession) -> dict:
        """Get all alert-related settings."""
        result = await session.execute(select(Setting))
        settings_list = result.scalars().all()
        
        # Start with defaults
        settings = {
            "alert_type": "once",
            "alert_repeat_frequency_minutes": "15",
            "alert_on_restored": "1",
            "alert_include_history": "event_only",
            "webhook_url": "",
            "email_alerts_enabled": "0",
            "smtp_host": "",
            "smtp_port": "587",
            "smtp_username": "",
            "smtp_password": "",
            "smtp_use_tls": "1",
            "alert_email_from": "",
            "alert_email_to": "",
        }
        
        for setting in settings_list:
            settings[setting.key] = setting.value
        
        return settings
    
    async def _get_last_down_alert(
        self,
        session: AsyncSession,
        monitor_id: int,
    ) -> Optional[Alert]:
        """Get the last down/degraded alert for a monitor."""
        result = await session.execute(
            select(Alert)
            .where(
                and_(
                    Alert.monitor_id == monitor_id,
                    Alert.alert_type.in_(["down", "degraded"]),
                )
            )
            .order_by(Alert.sent_at.desc())
            .limit(1)
        )
        return result.scalar_one_or_none()
    
    async def _get_status_history(
        self,
        session: AsyncSession,
        monitor_id: int,
        hours: int = 24,
    ) -> List[MonitorStatus]:
        """Get status history for a monitor."""
        cutoff = datetime.utcnow() - timedelta(hours=hours)
        result = await session.execute(
            select(MonitorStatus)
            .where(
                and_(
                    MonitorStatus.monitor_id == monitor_id,
                    MonitorStatus.checked_at >= cutoff,
                )
            )
            .order_by(MonitorStatus.checked_at.desc())
            .limit(100)  # Limit to avoid huge emails
        )
        return list(result.scalars().all())
    
    def _format_history_for_email(
        self,
        history: List[MonitorStatus],
        include_type: str,
    ) -> str:
        """Format status history for email body."""
        if include_type == "event_only" or not history:
            return ""
        
        lines = ["\n--- Status History (Last 24 Hours) ---\n"]
        for status in history:
            timestamp = status.checked_at.strftime("%Y-%m-%d %H:%M:%S UTC")
            status_str = status.status.upper()
            details = f" - {status.details}" if status.details else ""
            response = f" ({status.response_time_ms}ms)" if status.response_time_ms else ""
            lines.append(f"{timestamp}: {status_str}{response}{details}")
        
        return "\n".join(lines)
    
    def _build_email_subject(
        self,
        monitor: Monitor,
        new_status: str,
        agent_name: Optional[str] = None,
    ) -> str:
        """Build email subject line."""
        status_upper = new_status.upper()
        agent_str = agent_name or "Server"
        return f"{status_upper} - {monitor.name} - {agent_str} - {monitor.type}"
    
    def _build_email_body(
        self,
        monitor: Monitor,
        new_status: str,
        details: Optional[str],
        history: List[MonitorStatus],
        include_history: str,
    ) -> str:
        """Build email body."""
        lines = [
            f"OnlineTracker {new_status.upper()} Report",
            "=" * 40,
            "",
            f"Monitor: {monitor.name}",
            f"Type: {monitor.type}",
            f"Target: {monitor.target}",
            f"Status: {new_status.upper()}",
            f"Time: {datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S UTC')}",
        ]
        
        if details:
            lines.append(f"Details: {details}")
        
        # Add history if configured
        history_text = self._format_history_for_email(history, include_history)
        if history_text:
            lines.append(history_text)
        
        lines.append("")
        lines.append("--")
        lines.append("OnlineTracker Monitoring System")
        
        return "\n".join(lines)
    
    async def should_send_alert(
        self,
        session: AsyncSession,
        monitor: Monitor,
        new_status: str,
        old_status: Optional[str],
        settings: dict,
    ) -> bool:
        """Determine if an alert should be sent based on settings."""
        alert_type = settings.get("alert_type", "once")
        alert_on_restored = settings.get("alert_on_restored", "1") == "1"
        
        # Never alert if alert_type is "none"
        if alert_type == "none":
            return False
        
        # Check for state change
        is_state_change = old_status != new_status
        
        # Going up (restored)
        if new_status == "up":
            if is_state_change and old_status in ("down", "degraded"):
                return alert_on_restored
            return False
        
        # Going down or degraded
        if new_status in ("down", "degraded"):
            if is_state_change:
                # Always alert on first occurrence
                return True
            
            if alert_type == "repeated":
                # Check if enough time has passed since last alert
                repeat_minutes = int(settings.get("alert_repeat_frequency_minutes", 15))
                last_alert = await self._get_last_down_alert(session, monitor.id)
                
                if last_alert:
                    elapsed = datetime.utcnow() - last_alert.sent_at
                    if elapsed >= timedelta(minutes=repeat_minutes):
                        return True
                
                return False
            
            # "once" mode - only on state change, which we already handled above
            return False
        
        return False
    
    async def send_alert(
        self,
        session: AsyncSession,
        monitor: Monitor,
        new_status: str,
        details: Optional[str] = None,
        old_status: Optional[str] = None,
    ):
        """Send an alert for a monitor state change."""
        settings = await self._get_settings(session)
        
        # Check if we should send
        if not await self.should_send_alert(session, monitor, new_status, old_status, settings):
            logger.debug(f"Alert suppressed for {monitor.name}: {new_status}")
            return
        
        # Get history if needed
        include_history = settings.get("alert_include_history", "event_only")
        history = []
        if include_history == "last_24h":
            history = await self._get_status_history(session, monitor.id, 24)
        
        # Get agent name if applicable
        agent_name = None
        if monitor.agent:
            agent_name = monitor.agent.name or monitor.agent_id
        
        # Build payload
        webhook_url = settings.get("webhook_url")
        email_enabled = settings.get("email_alerts_enabled", "0") == "1"
        
        # Send webhook alert
        if webhook_url:
            await self._send_webhook_alert(
                session, monitor, new_status, details, webhook_url
            )
        
        # Send email alert
        if email_enabled:
            await self._send_email_alert(
                session, monitor, new_status, details, settings, history, agent_name
            )
    
    async def _send_webhook_alert(
        self,
        session: AsyncSession,
        monitor: Monitor,
        new_status: str,
        details: Optional[str],
        webhook_url: str,
    ):
        """Send a webhook alert."""
        payload = {
            "monitor": monitor.name,
            "type": monitor.type,
            "target": monitor.target,
            "event": new_status,
            "details": details,
            "timestamp": datetime.utcnow().isoformat() + "Z",
        }
        
        success = await self._send_webhook(webhook_url, payload)
        
        # Record alert
        alert = Alert(
            monitor_id=monitor.id,
            alert_type=new_status,
            channel="webhook",
            payload=json.dumps(payload),
            success=1 if success else 0,
        )
        session.add(alert)
    
    async def _send_email_alert(
        self,
        session: AsyncSession,
        monitor: Monitor,
        new_status: str,
        details: Optional[str],
        settings: dict,
        history: List[MonitorStatus],
        agent_name: Optional[str],
    ):
        """Send an email alert."""
        include_history = settings.get("alert_include_history", "event_only")
        
        subject = self._build_email_subject(monitor, new_status, agent_name)
        body = self._build_email_body(monitor, new_status, details, history, include_history)
        
        config = EmailConfig(
            host=settings.get("smtp_host", ""),
            port=int(settings.get("smtp_port", 587)),
            username=settings.get("smtp_username", ""),
            password=settings.get("smtp_password", ""),
            use_tls=settings.get("smtp_use_tls", "1") == "1",
            from_address=settings.get("alert_email_from", ""),
            to_address=settings.get("alert_email_to", ""),
        )
        
        success = await email_sender_service.send_email(config, subject, body)
        
        # Record alert
        alert = Alert(
            monitor_id=monitor.id,
            alert_type=new_status,
            channel="email",
            payload=json.dumps({"subject": subject, "to": config.to_address}),
            success=1 if success else 0,
        )
        session.add(alert)
    
    async def _send_webhook(self, url: str, payload: dict) -> bool:
        """Send a webhook POST request."""
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                response = await client.post(
                    url,
                    json=payload,
                    headers={"Content-Type": "application/json"},
                )
                if response.status_code < 400:
                    logger.info(f"Webhook sent: {payload['event']} for {payload['monitor']}")
                    return True
                else:
                    logger.warning(f"Webhook returned {response.status_code}")
                    return False
        except Exception as e:
            logger.error(f"Failed to send webhook: {e}")
            return False
    
    async def send_ssl_warning(
        self,
        session: AsyncSession,
        monitor: Monitor,
        days_remaining: int,
    ):
        """Send an SSL expiry warning alert."""
        settings = await self._get_settings(session)
        webhook_url = settings.get("webhook_url")
        email_enabled = settings.get("email_alerts_enabled", "0") == "1"
        
        if not webhook_url and not email_enabled:
            return
        
        # Webhook
        if webhook_url:
            payload = {
                "monitor": monitor.name,
                "type": "ssl",
                "target": monitor.target,
                "event": "ssl_expiring",
                "details": f"Certificate expires in {days_remaining} days",
                "timestamp": datetime.utcnow().isoformat() + "Z",
            }
            
            success = await self._send_webhook(webhook_url, payload)
            
            alert = Alert(
                monitor_id=monitor.id,
                alert_type="ssl_expiring",
                channel="webhook",
                payload=json.dumps(payload),
                success=1 if success else 0,
            )
            session.add(alert)
        
        # Email
        if email_enabled:
            subject = f"SSL EXPIRING - {monitor.name} - {days_remaining} days"
            body = "\n".join([
                "OnlineTracker SSL Expiry Warning",
                "=" * 40,
                "",
                f"Monitor: {monitor.name}",
                f"Target: {monitor.target}",
                f"Certificate expires in: {days_remaining} days",
                f"Time: {datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S UTC')}",
                "",
                "--",
                "OnlineTracker Monitoring System",
            ])
            
            config = EmailConfig(
                host=settings.get("smtp_host", ""),
                port=int(settings.get("smtp_port", 587)),
                username=settings.get("smtp_username", ""),
                password=settings.get("smtp_password", ""),
                use_tls=settings.get("smtp_use_tls", "1") == "1",
                from_address=settings.get("alert_email_from", ""),
                to_address=settings.get("alert_email_to", ""),
            )
            
            success = await email_sender_service.send_email(config, subject, body)
            
            alert = Alert(
                monitor_id=monitor.id,
                alert_type="ssl_expiring",
                channel="email",
                payload=json.dumps({"subject": subject}),
                success=1 if success else 0,
            )
            session.add(alert)


# Global instance
alerter_service = AlerterService()
