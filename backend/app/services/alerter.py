"""Alerter service - sends webhook notifications on state changes."""
import json
import logging
from datetime import datetime
from typing import Optional

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models import Monitor, Alert, Setting

logger = logging.getLogger(__name__)


class AlerterService:
    """Service for sending webhook alerts."""
    
    async def get_webhook_url(self, session: AsyncSession) -> Optional[str]:
        """Get the configured webhook URL from settings."""
        result = await session.execute(
            select(Setting).where(Setting.key == "webhook_url")
        )
        setting = result.scalar_one_or_none()
        if setting and setting.value:
            return setting.value
        return None
    
    async def send_alert(
        self,
        session: AsyncSession,
        monitor: Monitor,
        new_status: str,
        details: Optional[str] = None,
    ):
        """Send an alert for a monitor state change."""
        webhook_url = await self.get_webhook_url(session)
        if not webhook_url:
            logger.debug("No webhook URL configured, skipping alert")
            return
        
        # Determine alert type
        if new_status == "down":
            alert_type = "down"
        elif new_status == "up":
            alert_type = "up"
        elif new_status == "degraded":
            alert_type = "degraded"
        else:
            return  # Don't alert on unknown
        
        # Build payload
        payload = {
            "monitor": monitor.name,
            "type": monitor.type,
            "target": monitor.target,
            "event": alert_type,
            "details": details,
            "timestamp": datetime.utcnow().isoformat() + "Z",
        }
        
        # Send webhook
        success = await self._send_webhook(webhook_url, payload)
        
        # Record alert
        alert = Alert(
            monitor_id=monitor.id,
            alert_type=alert_type,
            payload=json.dumps(payload),
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
                    logger.info(f"Alert sent successfully: {payload['event']} for {payload['monitor']}")
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
        webhook_url = await self.get_webhook_url(session)
        if not webhook_url:
            return
        
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
            payload=json.dumps(payload),
            success=1 if success else 0,
        )
        session.add(alert)


# Global instance
alerter_service = AlerterService()
