"""Device registration API endpoints for push notifications."""
import logging
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_db
from ..models.push_device import PushDevice
from ..utils.db_utils import retry_on_lock

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/devices", tags=["devices"])


class DeviceRegisterRequest(BaseModel):
    """Request to register a device for push notifications."""
    device_token: str
    platform: str = "ios"
    app_version: Optional[str] = None


class DeviceRegisterResponse(BaseModel):
    """Response after registering a device."""
    success: bool
    device_id: int
    message: str


class DeviceUnregisterResponse(BaseModel):
    """Response after unregistering a device."""
    success: bool
    message: str


@router.post("/register", response_model=DeviceRegisterResponse)
async def register_device(
    request: DeviceRegisterRequest,
    db: AsyncSession = Depends(get_db),
):
    """Register a device for push notifications.
    
    If the device token already exists, update it. Otherwise create a new record.
    The iOS app should call this on every launch to ensure the token is current.
    """
    # Check if device already exists
    result = await db.execute(
        select(PushDevice).where(PushDevice.device_token == request.device_token)
    )
    existing = result.scalar_one_or_none()
    
    if existing:
        # Update existing device
        existing.platform = request.platform
        existing.app_version = request.app_version
        existing.enabled = 1
        existing.last_used_at = datetime.utcnow()
        
        await retry_on_lock(db.commit)
        await db.refresh(existing)
        
        logger.info(f"Device token updated: {request.device_token[:16]}...")
        return DeviceRegisterResponse(
            success=True,
            device_id=existing.id,
            message="Device updated successfully",
        )
    
    # Create new device
    device = PushDevice(
        device_token=request.device_token,
        platform=request.platform,
        app_version=request.app_version,
        enabled=1,
    )
    db.add(device)
    
    await retry_on_lock(db.commit)
    await db.refresh(device)
    
    logger.info(f"New device registered: {request.device_token[:16]}...")
    return DeviceRegisterResponse(
        success=True,
        device_id=device.id,
        message="Device registered successfully",
    )


@router.delete("/{device_token}", response_model=DeviceUnregisterResponse)
async def unregister_device(
    device_token: str,
    db: AsyncSession = Depends(get_db),
):
    """Unregister a device from push notifications.
    
    This doesn't delete the record but marks it as disabled.
    """
    result = await db.execute(
        select(PushDevice).where(PushDevice.device_token == device_token)
    )
    device = result.scalar_one_or_none()
    
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    
    device.enabled = 0
    await retry_on_lock(db.commit)
    
    logger.info(f"Device unregistered: {device_token[:16]}...")
    return DeviceUnregisterResponse(
        success=True,
        message="Device unregistered successfully",
    )


@router.get("/count")
async def get_device_count(db: AsyncSession = Depends(get_db)):
    """Get count of registered devices (for admin dashboard)."""
    from sqlalchemy import func
    
    # Total devices
    total_result = await db.execute(
        select(func.count(PushDevice.id))
    )
    total = total_result.scalar() or 0
    
    # Enabled devices
    enabled_result = await db.execute(
        select(func.count(PushDevice.id)).where(PushDevice.enabled == 1)
    )
    enabled = enabled_result.scalar() or 0
    
    return {
        "total": total,
        "enabled": enabled,
    }
