"""Push notification sender service using APNs for iOS."""
import json
import logging
from dataclasses import dataclass
from typing import Optional, List

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models.push_device import PushDevice

logger = logging.getLogger(__name__)

# Try to import aioapns, but don't fail if not installed
try:
    from aioapns import APNs, NotificationRequest, PushType
    APNS_AVAILABLE = True
except ImportError:
    APNS_AVAILABLE = False
    logger.warning("aioapns not installed - push notifications will be disabled")


@dataclass
class PushConfig:
    """APNs configuration."""
    enabled: bool = False
    key_path: str = ""  # Path to .p8 key file
    key_id: str = ""
    team_id: str = ""
    bundle_id: str = ""
    use_sandbox: bool = True  # Use sandbox for development


class PushSenderService:
    """Service for sending push notifications via APNs."""
    
    def __init__(self):
        self._client: Optional["APNs"] = None
        self._config: Optional[PushConfig] = None
    
    def configure(self, config: PushConfig):
        """Configure the APNs client."""
        self._config = config
        self._client = None  # Reset client to force reconnection
        
        if not config.enabled:
            logger.info("Push notifications are disabled")
            return
        
        if not APNS_AVAILABLE:
            logger.error("Cannot enable push notifications: aioapns not installed")
            return
        
        if not all([config.key_path, config.key_id, config.team_id, config.bundle_id]):
            logger.warning("Push notifications enabled but APNs not fully configured")
            return
        
        try:
            self._client = APNs(
                key=config.key_path,
                key_id=config.key_id,
                team_id=config.team_id,
                topic=config.bundle_id,
                use_sandbox=config.use_sandbox,
            )
            logger.info(f"APNs client configured (sandbox={config.use_sandbox})")
        except Exception as e:
            logger.error(f"Failed to configure APNs client: {e}")
            self._client = None
    
    async def send_notification(
        self,
        device_token: str,
        title: str,
        body: str,
        data: Optional[dict] = None,
        badge: Optional[int] = None,
    ) -> bool:
        """Send a push notification to a single device.
        
        Args:
            device_token: The APNs device token
            title: Notification title
            body: Notification body text
            data: Additional data payload
            badge: Badge number to display
            
        Returns:
            True if notification was sent successfully
        """
        if not self._client or not self._config or not self._config.enabled:
            logger.debug("Push notifications not configured, skipping")
            return False
        
        if not APNS_AVAILABLE:
            return False
        
        try:
            # Build the notification payload
            alert = {"title": title, "body": body}
            aps = {"alert": alert, "sound": "default"}
            
            if badge is not None:
                aps["badge"] = badge
            
            # Combine aps with custom data
            payload = {"aps": aps}
            if data:
                payload.update(data)
            
            request = NotificationRequest(
                device_token=device_token,
                message=payload,
                push_type=PushType.ALERT,
            )
            
            response = await self._client.send_notification(request)
            
            if response.is_successful:
                logger.info(f"Push notification sent to {device_token[:16]}...")
                return True
            else:
                logger.warning(
                    f"Push notification failed: {response.description} "
                    f"(token: {device_token[:16]}...)"
                )
                return False
                
        except Exception as e:
            logger.error(f"Failed to send push notification: {e}")
            return False
    
    async def send_to_all_devices(
        self,
        session: AsyncSession,
        title: str,
        body: str,
        data: Optional[dict] = None,
        badge: Optional[int] = None,
    ) -> tuple[int, int]:
        """Send a push notification to all registered devices.
        
        Args:
            session: Database session
            title: Notification title
            body: Notification body text
            data: Additional data payload
            badge: Badge number to display
            
        Returns:
            Tuple of (success_count, failure_count)
        """
        if not self._client or not self._config or not self._config.enabled:
            return (0, 0)
        
        # Get all enabled devices
        result = await session.execute(
            select(PushDevice).where(PushDevice.enabled == 1)
        )
        devices = result.scalars().all()
        
        if not devices:
            logger.debug("No registered devices for push notification")
            return (0, 0)
        
        success_count = 0
        failure_count = 0
        
        for device in devices:
            success = await self.send_notification(
                device_token=device.device_token,
                title=title,
                body=body,
                data=data,
                badge=badge,
            )
            
            if success:
                success_count += 1
            else:
                failure_count += 1
        
        logger.info(
            f"Push notifications sent: {success_count} success, {failure_count} failed"
        )
        return (success_count, failure_count)
    
    async def send_monitor_alert(
        self,
        session: AsyncSession,
        monitor_name: str,
        monitor_id: int,
        status: str,
        details: Optional[str] = None,
    ) -> tuple[int, int]:
        """Send a monitor status alert to all devices.
        
        Args:
            session: Database session
            monitor_name: Name of the monitor
            monitor_id: ID of the monitor
            status: Current status (up, down, degraded)
            details: Optional status details
            
        Returns:
            Tuple of (success_count, failure_count)
        """
        # Build notification content
        status_upper = status.upper()
        title = f"Monitor {status_upper}"
        body = f"{monitor_name} is {status}"
        
        if details:
            body = f"{body}: {details}"
        
        # Custom data for the app to handle
        data = {
            "monitor_id": monitor_id,
            "monitor_name": monitor_name,
            "status": status,
            "details": details,
        }
        
        # Badge: 1 for down/degraded, 0 for up
        badge = 1 if status in ("down", "degraded") else 0
        
        return await self.send_to_all_devices(
            session=session,
            title=title,
            body=body,
            data=data,
            badge=badge,
        )


# Global instance
push_sender_service = PushSenderService()
