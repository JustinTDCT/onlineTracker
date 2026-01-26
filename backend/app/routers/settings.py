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


def _bool_from_str(val: str) -> bool:
    """Convert string '0'/'1' to bool."""
    return val == "1" or val.lower() == "true"


def _build_settings_response(settings_dict: dict) -> SettingsResponse:
    """Build a SettingsResponse from a settings dictionary."""
    return SettingsResponse(
        # Monitoring
        check_interval_seconds=int(settings_dict.get("check_interval_seconds", 60)),
        ssl_warn_days=settings_dict.get("ssl_warn_days", "30,14,7"),
        
        # Agents
        agent_timeout_minutes=int(settings_dict.get("agent_timeout_minutes", 5)),
        shared_secret=settings_dict.get("shared_secret") or None,
        allowed_agent_uuids=settings_dict.get("allowed_agent_uuids") or None,
        
        # Alerts
        alert_type=settings_dict.get("alert_type", "once"),
        alert_repeat_frequency_minutes=int(settings_dict.get("alert_repeat_frequency_minutes", 15)),
        alert_on_restored=_bool_from_str(settings_dict.get("alert_on_restored", "1")),
        alert_include_history=settings_dict.get("alert_include_history", "event_only"),
        
        # Webhook
        webhook_url=settings_dict.get("webhook_url") or None,
        
        # Email
        email_alerts_enabled=_bool_from_str(settings_dict.get("email_alerts_enabled", "0")),
        smtp_host=settings_dict.get("smtp_host") or None,
        smtp_port=int(settings_dict.get("smtp_port", 587)),
        smtp_username=settings_dict.get("smtp_username") or None,
        smtp_password=settings_dict.get("smtp_password") or None,
        smtp_use_tls=_bool_from_str(settings_dict.get("smtp_use_tls", "1")),
        alert_email_from=settings_dict.get("alert_email_from") or None,
        alert_email_to=settings_dict.get("alert_email_to") or None,
    )


@router.get("", response_model=SettingsResponse)
async def get_settings(db: AsyncSession = Depends(get_db)):
    """Get all settings."""
    settings_dict = await get_all_settings(db)
    return _build_settings_response(settings_dict)


@router.put("", response_model=SettingsResponse)
async def update_settings(update: SettingsUpdate, db: AsyncSession = Depends(get_db)):
    """Update settings."""
    updates = update.model_dump(exclude_unset=True)
    
    for key, value in updates.items():
        if value is not None:
            # Convert bools to "0"/"1" for storage
            if isinstance(value, bool):
                store_value = "1" if value else "0"
            else:
                store_value = str(value)
            
            # Find or create setting
            result = await db.execute(select(Setting).where(Setting.key == key))
            setting = result.scalar_one_or_none()
            
            if setting:
                setting.value = store_value
            else:
                setting = Setting(key=key, value=store_value)
                db.add(setting)
    
    await db.commit()
    
    # Return updated settings
    settings_dict = await get_all_settings(db)
    return _build_settings_response(settings_dict)
