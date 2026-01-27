"""Settings API endpoints."""
import json
from datetime import datetime
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_db
from ..models import Setting, Monitor, Agent
from ..models.settings import DEFAULT_SETTINGS
from ..schemas.settings import SettingsResponse, SettingsUpdate
from ..services.email_sender import email_sender_service, EmailConfig
from ..utils.db_utils import retry_on_lock

router = APIRouter(prefix="/api/settings", tags=["settings"])


# Export/Import schemas
class ExportMonitor(BaseModel):
    """Monitor data for export."""
    type: str
    name: str
    description: Optional[str] = None
    target: str
    config: Optional[dict] = None
    check_interval: int
    enabled: bool


class ExportAgent(BaseModel):
    """Agent data for export."""
    id: str
    name: Optional[str] = None
    status: str


class ExportData(BaseModel):
    """Complete export data structure."""
    version: str = "2.1"
    exported_at: str
    settings: dict
    monitors: List[ExportMonitor]
    agents: List[ExportAgent]


class ImportData(BaseModel):
    """Import data structure."""
    version: Optional[str] = None
    settings: Optional[dict] = None
    monitors: Optional[List[ExportMonitor]] = None
    agents: Optional[List[ExportAgent]] = None


class ImportResult(BaseModel):
    """Result of import operation."""
    success: bool
    message: str
    settings_imported: int = 0
    monitors_imported: int = 0
    agents_imported: int = 0


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
        
        # Default thresholds for PING monitors
        default_ping_count=int(settings_dict.get("default_ping_count", 5)),
        default_ping_ok_threshold_ms=int(settings_dict.get("default_ping_ok_threshold_ms", 80)),
        default_ping_degraded_threshold_ms=int(settings_dict.get("default_ping_degraded_threshold_ms", 200)),
        
        # Default thresholds for HTTP/HTTPS monitors
        default_http_ok_threshold_ms=int(settings_dict.get("default_http_ok_threshold_ms", 80)),
        default_http_degraded_threshold_ms=int(settings_dict.get("default_http_degraded_threshold_ms", 200)),
        
        # Default thresholds for SSL monitors
        default_ssl_ok_threshold_days=int(settings_dict.get("default_ssl_ok_threshold_days", 30)),
        default_ssl_warning_threshold_days=int(settings_dict.get("default_ssl_warning_threshold_days", 14)),
        
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
        
        # Push notifications
        push_alerts_enabled=_bool_from_str(settings_dict.get("push_alerts_enabled", "0")),
        apns_key_id=settings_dict.get("apns_key_id") or None,
        apns_team_id=settings_dict.get("apns_team_id") or None,
        apns_bundle_id=settings_dict.get("apns_bundle_id") or None,
        apns_use_sandbox=_bool_from_str(settings_dict.get("apns_use_sandbox", "1")),
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
    
    await retry_on_lock(db.commit)
    
    # Return updated settings
    settings_dict = await get_all_settings(db)
    return _build_settings_response(settings_dict)


@router.post("/test-email")
async def test_email(db: AsyncSession = Depends(get_db)):
    """Send a test email to verify SMTP configuration."""
    settings_dict = await get_all_settings(db)
    
    # Check if email is enabled
    if not _bool_from_str(settings_dict.get("email_alerts_enabled", "0")):
        raise HTTPException(status_code=400, detail="Email alerts are not enabled")
    
    # Check required fields
    smtp_host = settings_dict.get("smtp_host")
    alert_email_to = settings_dict.get("alert_email_to")
    
    if not smtp_host:
        raise HTTPException(status_code=400, detail="SMTP host is not configured")
    if not alert_email_to:
        raise HTTPException(status_code=400, detail="Alert email (To) is not configured")
    
    # Build config
    config = EmailConfig(
        host=smtp_host,
        port=int(settings_dict.get("smtp_port", 587)),
        username=settings_dict.get("smtp_username", ""),
        password=settings_dict.get("smtp_password", ""),
        use_tls=_bool_from_str(settings_dict.get("smtp_use_tls", "1")),
        from_address=settings_dict.get("alert_email_from", ""),
        to_address=alert_email_to,
    )
    
    # Build test email
    subject = "OnlineTracker - Test Email"
    body = f"""OnlineTracker Test Email
========================================

This is a test email from OnlineTracker.

If you received this message, your SMTP configuration is working correctly.

SMTP Host: {config.host}
SMTP Port: {config.port}
TLS Enabled: {config.use_tls}
From: {config.from_address or config.username or 'Not set'}
To: {config.to_address}

Time: {datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S UTC')}

--
OnlineTracker Monitoring System
"""
    
    # Send
    success = await email_sender_service.send_email(config, subject, body)
    
    if success:
        return {"success": True, "message": f"Test email sent to {alert_email_to}"}
    else:
        raise HTTPException(status_code=500, detail="Failed to send test email. Check server logs for details.")


@router.get("/export", response_model=ExportData)
async def export_data(db: AsyncSession = Depends(get_db)):
    """Export all settings, monitors, and agents as JSON."""
    # Get settings
    settings_dict = await get_all_settings(db)
    
    # Get monitors
    result = await db.execute(select(Monitor).order_by(Monitor.name))
    monitors = result.scalars().all()
    
    export_monitors = []
    for m in monitors:
        config = None
        if m.config:
            try:
                config = json.loads(m.config)
            except json.JSONDecodeError:
                pass
        
        export_monitors.append(ExportMonitor(
            type=m.type,
            name=m.name,
            description=m.description,
            target=m.target,
            config=config,
            check_interval=m.check_interval,
            enabled=bool(m.enabled),
        ))
    
    # Get agents (only approved ones)
    result = await db.execute(select(Agent).where(Agent.status == "approved"))
    agents = result.scalars().all()
    
    export_agents = [
        ExportAgent(id=a.id, name=a.name, status=a.status)
        for a in agents
    ]
    
    return ExportData(
        version="2.1",
        exported_at=datetime.utcnow().isoformat() + "Z",
        settings=settings_dict,
        monitors=export_monitors,
        agents=export_agents,
    )


@router.post("/import", response_model=ImportResult)
async def import_data(
    data: ImportData,
    replace_existing: bool = False,
    db: AsyncSession = Depends(get_db),
):
    """Import settings, monitors, and agents from JSON.
    
    Args:
        data: The export data to import
        replace_existing: If true, delete existing data before import
    """
    settings_count = 0
    monitors_count = 0
    agents_count = 0
    
    try:
        # Import settings
        if data.settings:
            for key, value in data.settings.items():
                # Skip sensitive or internal settings during import unless explicitly included
                if key in ["shared_secret", "smtp_password"] and not value:
                    continue
                
                # Convert to string for storage
                if isinstance(value, bool):
                    store_value = "1" if value else "0"
                else:
                    store_value = str(value) if value is not None else ""
                
                # Find or create setting
                result = await db.execute(select(Setting).where(Setting.key == key))
                setting = result.scalar_one_or_none()
                
                if setting:
                    setting.value = store_value
                else:
                    setting = Setting(key=key, value=store_value)
                    db.add(setting)
                settings_count += 1
        
        # Import monitors
        if data.monitors:
            if replace_existing:
                # Delete existing monitors
                await db.execute(delete(Monitor))
            
            for m in data.monitors:
                # Check if monitor with same name exists
                result = await db.execute(
                    select(Monitor).where(Monitor.name == m.name)
                )
                existing = result.scalar_one_or_none()
                
                if existing and not replace_existing:
                    # Update existing monitor
                    existing.type = m.type
                    existing.description = m.description
                    existing.target = m.target
                    existing.config = json.dumps(m.config) if m.config else None
                    existing.check_interval = m.check_interval
                    existing.enabled = 1 if m.enabled else 0
                else:
                    # Create new monitor
                    new_monitor = Monitor(
                        type=m.type,
                        name=m.name,
                        description=m.description,
                        target=m.target,
                        config=json.dumps(m.config) if m.config else None,
                        check_interval=m.check_interval,
                        enabled=1 if m.enabled else 0,
                    )
                    db.add(new_monitor)
                monitors_count += 1
        
        # Import agents
        if data.agents:
            for a in data.agents:
                # Check if agent exists
                result = await db.execute(select(Agent).where(Agent.id == a.id))
                existing = result.scalar_one_or_none()
                
                if not existing:
                    # Create new agent
                    new_agent = Agent(
                        id=a.id,
                        name=a.name,
                        status=a.status,
                    )
                    db.add(new_agent)
                    agents_count += 1
                elif replace_existing:
                    existing.name = a.name
                    existing.status = a.status
                    agents_count += 1
        
        await retry_on_lock(db.commit)
        
        return ImportResult(
            success=True,
            message="Import completed successfully",
            settings_imported=settings_count,
            monitors_imported=monitors_count,
            agents_imported=agents_count,
        )
        
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=400, detail=f"Import failed: {str(e)}")
