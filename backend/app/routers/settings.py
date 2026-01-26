"""Settings API endpoints."""
from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_db
from ..models import Setting
from ..models.settings import DEFAULT_SETTINGS
from ..schemas.settings import SettingsResponse, SettingsUpdate

router = APIRouter(prefix="/api/settings", tags=["settings"])


async def get_all_settings(db: AsyncSession) -> dict:
    """Get all settings as a dictionary."""
    result = await db.execute(select(Setting))
    settings_list = result.scalars().all()
    
    # Start with defaults
    settings_dict = dict(DEFAULT_SETTINGS)
    
    # Override with stored values
    for setting in settings_list:
        settings_dict[setting.key] = setting.value
    
    return settings_dict


@router.get("", response_model=SettingsResponse)
async def get_settings(db: AsyncSession = Depends(get_db)):
    """Get all settings."""
    settings_dict = await get_all_settings(db)
    
    return SettingsResponse(
        agent_timeout_minutes=int(settings_dict.get("agent_timeout_minutes", 5)),
        check_interval_seconds=int(settings_dict.get("check_interval_seconds", 60)),
        ssl_warn_days=settings_dict.get("ssl_warn_days", "30,14,7"),
        webhook_url=settings_dict.get("webhook_url") or None,
    )


@router.put("", response_model=SettingsResponse)
async def update_settings(update: SettingsUpdate, db: AsyncSession = Depends(get_db)):
    """Update settings."""
    updates = update.model_dump(exclude_unset=True)
    
    for key, value in updates.items():
        if value is not None:
            # Find or create setting
            result = await db.execute(select(Setting).where(Setting.key == key))
            setting = result.scalar_one_or_none()
            
            if setting:
                setting.value = str(value)
            else:
                setting = Setting(key=key, value=str(value))
                db.add(setting)
    
    await db.commit()
    
    # Return updated settings
    settings_dict = await get_all_settings(db)
    
    return SettingsResponse(
        agent_timeout_minutes=int(settings_dict.get("agent_timeout_minutes", 5)),
        check_interval_seconds=int(settings_dict.get("check_interval_seconds", 60)),
        ssl_warn_days=settings_dict.get("ssl_warn_days", "30,14,7"),
        webhook_url=settings_dict.get("webhook_url") or None,
    )
