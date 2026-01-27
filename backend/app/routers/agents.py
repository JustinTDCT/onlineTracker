"""Agent management API endpoints."""
import hashlib
import logging
from datetime import datetime
from typing import List

from fastapi import APIRouter, Depends, HTTPException, Header
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_db
from ..models import Agent, Monitor, MonitorStatus, Setting, PendingAgent
from ..models.settings import DEFAULT_SETTINGS
from ..schemas.agent import AgentRegister, AgentResponse, AgentApproval, AgentReport, PendingAgentResponse
from ..services.alerter import alerter_service
from ..utils.db_utils import retry_on_lock

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/agents", tags=["agents"])


async def get_setting_value(db: AsyncSession, key: str) -> str:
    """Get a setting value from the database."""
    result = await db.execute(select(Setting).where(Setting.key == key))
    setting = result.scalar_one_or_none()
    if setting:
        return setting.value
    return DEFAULT_SETTINGS.get(key, "")


async def store_pending_agent(db: AsyncSession, uuid: str, name: str | None, secret_hash: str):
    """Store or update a pending agent registration attempt."""
    result = await db.execute(select(PendingAgent).where(PendingAgent.uuid == uuid))
    existing = result.scalar_one_or_none()
    
    if existing:
        # Update existing pending agent
        existing.last_attempt = datetime.utcnow()
        existing.attempt_count += 1
        if name:
            existing.name = name
    else:
        # Create new pending agent
        pending = PendingAgent(
            uuid=uuid,
            name=name,
            secret_hash=secret_hash,
        )
        db.add(pending)
    
    await retry_on_lock(db.commit)


@router.post("/register", status_code=202)
async def register_agent(data: AgentRegister, db: AsyncSession = Depends(get_db)):
    """Register a new agent (or return existing if already registered).
    
    Two-layer authentication:
    1. UUID must be in allowed_agent_uuids list
    2. Secret hash must match server's shared_secret hash
    
    If UUID is not in allowed list but secret is valid, the attempt is recorded
    as a pending agent for the admin to approve via the UI.
    """
    # Get server settings for auth
    allowed_uuids_str = await get_setting_value(db, "allowed_agent_uuids")
    server_secret = await get_setting_value(db, "shared_secret")
    
    # Verify secret hash against server's shared_secret first
    if not server_secret:
        logger.warning("Agent registration rejected - no shared secret configured")
        raise HTTPException(status_code=403, detail="Shared secret not configured on server")
    
    expected_hash = hashlib.sha256(server_secret.encode()).hexdigest()
    if data.secret_hash != expected_hash:
        logger.warning(f"Agent registration rejected - invalid secret for UUID: {data.uuid}")
        raise HTTPException(status_code=403, detail="Invalid shared secret")
    
    # Check if UUID is in allowed list
    if allowed_uuids_str:
        allowed_uuids = [u.strip() for u in allowed_uuids_str.split(",") if u.strip()]
        if data.uuid not in allowed_uuids:
            # Secret is valid but UUID not allowed - store as pending
            logger.warning(f"Agent registration pending - UUID not in allowed list: {data.uuid}")
            await store_pending_agent(db, data.uuid, data.name, data.secret_hash)
            raise HTTPException(status_code=403, detail="Agent UUID not authorized. Request sent to admin for approval.")
    else:
        # No allowed list configured - store as pending if secret was valid
        logger.warning(f"Agent registration pending - no allowed UUIDs configured: {data.uuid}")
        await store_pending_agent(db, data.uuid, data.name, data.secret_hash)
        raise HTTPException(status_code=403, detail="No agents are authorized. Request sent to admin for approval.")
    
    # Check if agent already exists
    result = await db.execute(select(Agent).where(Agent.id == data.uuid))
    existing = result.scalar_one_or_none()
    
    if existing:
        # Verify secret hash matches
        if existing.secret_hash != data.secret_hash:
            raise HTTPException(status_code=403, detail="Invalid credentials")
        # Remove from pending if exists
        await db.execute(select(PendingAgent).where(PendingAgent.uuid == data.uuid))
        pending = (await db.execute(select(PendingAgent).where(PendingAgent.uuid == data.uuid))).scalar_one_or_none()
        if pending:
            await db.delete(pending)
            await retry_on_lock(db.commit)
        return {"status": "already_registered", "approved": existing.status}
    
    # Create new agent - auto-approve since it passed both auth checks
    agent = Agent(
        id=data.uuid,
        name=data.name,  # Name from AGENT_NAME env var
        secret_hash=data.secret_hash,
        approved=1,  # Auto-approved (passed UUID allowlist and secret check)
    )
    db.add(agent)
    
    # Remove from pending if exists
    pending = (await db.execute(select(PendingAgent).where(PendingAgent.uuid == data.uuid))).scalar_one_or_none()
    if pending:
        await db.delete(pending)
    
    await retry_on_lock(db.commit)
    
    agent_display = data.name or data.uuid[:8]
    logger.info(f"Agent registered and auto-approved: {agent_display} ({data.uuid})")
    return {"status": "registered", "message": "Approved"}


@router.get("", response_model=List[AgentResponse])
async def list_agents(db: AsyncSession = Depends(get_db)):
    """List all registered agents."""
    result = await db.execute(select(Agent).order_by(Agent.created_at.desc()))
    agents = result.scalars().all()
    
    response = []
    for agent in agents:
        # Count monitors
        count_result = await db.execute(
            select(func.count()).select_from(Monitor).where(Monitor.agent_id == agent.id)
        )
        monitor_count = count_result.scalar() or 0
        
        response.append(AgentResponse(
            id=agent.id,
            name=agent.name,
            status=agent.status,
            last_seen=agent.last_seen,
            created_at=agent.created_at,
            monitor_count=monitor_count,
        ))
    
    return response


@router.get("/pending", response_model=List[PendingAgentResponse])
async def list_pending_agents(db: AsyncSession = Depends(get_db)):
    """List all pending agent registration requests.
    
    These are agents that tried to connect with the correct shared secret
    but their UUID was not in the allowed list.
    """
    result = await db.execute(select(PendingAgent).order_by(PendingAgent.last_attempt.desc()))
    pending = result.scalars().all()
    return pending


@router.post("/pending/{uuid}/approve")
async def approve_pending_agent(uuid: str, db: AsyncSession = Depends(get_db)):
    """Approve a pending agent by adding its UUID to the allowed list.
    
    The agent will be able to register on its next connection attempt.
    """
    # Check if pending agent exists
    result = await db.execute(select(PendingAgent).where(PendingAgent.uuid == uuid))
    pending = result.scalar_one_or_none()
    
    if not pending:
        raise HTTPException(status_code=404, detail="Pending agent not found")
    
    # Get current allowed UUIDs
    allowed_uuids_str = await get_setting_value(db, "allowed_agent_uuids")
    
    # Add UUID to allowed list
    if allowed_uuids_str:
        allowed_uuids = [u.strip() for u in allowed_uuids_str.split(",") if u.strip()]
        if uuid not in allowed_uuids:
            allowed_uuids.append(uuid)
            new_allowed_str = ",".join(allowed_uuids)
        else:
            new_allowed_str = allowed_uuids_str
    else:
        new_allowed_str = uuid
    
    # Update setting
    setting_result = await db.execute(select(Setting).where(Setting.key == "allowed_agent_uuids"))
    setting = setting_result.scalar_one_or_none()
    
    if setting:
        setting.value = new_allowed_str
    else:
        setting = Setting(key="allowed_agent_uuids", value=new_allowed_str)
        db.add(setting)
    
    # Remove from pending
    await db.delete(pending)
    await retry_on_lock(db.commit)
    
    logger.info(f"Pending agent approved and added to allowed list: {uuid}")
    return {"status": "approved", "uuid": uuid, "message": "Agent will register on next connection attempt"}


@router.delete("/pending/{uuid}", status_code=204)
async def dismiss_pending_agent(uuid: str, db: AsyncSession = Depends(get_db)):
    """Dismiss/delete a pending agent registration request."""
    result = await db.execute(select(PendingAgent).where(PendingAgent.uuid == uuid))
    pending = result.scalar_one_or_none()
    
    if not pending:
        raise HTTPException(status_code=404, detail="Pending agent not found")
    
    await db.delete(pending)
    await retry_on_lock(db.commit)
    
    logger.info(f"Pending agent dismissed: {uuid}")


@router.get("/{agent_id}", response_model=AgentResponse)
async def get_agent(agent_id: str, db: AsyncSession = Depends(get_db)):
    """Get a specific agent."""
    result = await db.execute(select(Agent).where(Agent.id == agent_id))
    agent = result.scalar_one_or_none()
    
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    
    # Count monitors
    count_result = await db.execute(
        select(func.count()).select_from(Monitor).where(Monitor.agent_id == agent.id)
    )
    monitor_count = count_result.scalar() or 0
    
    return AgentResponse(
        id=agent.id,
        name=agent.name,
        status=agent.status,
        last_seen=agent.last_seen,
        created_at=agent.created_at,
        monitor_count=monitor_count,
    )


@router.put("/{agent_id}/approve")
async def approve_agent(
    agent_id: str,
    data: AgentApproval,
    db: AsyncSession = Depends(get_db),
):
    """Approve or reject an agent."""
    result = await db.execute(select(Agent).where(Agent.id == agent_id))
    agent = result.scalar_one_or_none()
    
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    
    agent.approved = 1 if data.approved else -1
    if data.name:
        agent.name = data.name
    
    await retry_on_lock(db.commit)
    
    return {"status": "approved" if data.approved else "rejected"}


@router.delete("/{agent_id}", status_code=204)
async def delete_agent(agent_id: str, db: AsyncSession = Depends(get_db)):
    """Delete an agent and its monitors."""
    result = await db.execute(select(Agent).where(Agent.id == agent_id))
    agent = result.scalar_one_or_none()
    
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    
    await db.delete(agent)
    await retry_on_lock(db.commit)


@router.post("/report")
async def report_results(data: AgentReport, db: AsyncSession = Depends(get_db)):
    """Agent reports check results."""
    # Find agent
    result = await db.execute(select(Agent).where(Agent.id == data.uuid))
    agent = result.scalar_one_or_none()
    
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    
    # Verify secret
    secret_hash = hashlib.sha256(data.secret.encode()).hexdigest()
    if secret_hash != agent.secret_hash:
        raise HTTPException(status_code=403, detail="Invalid credentials")
    
    # Check if approved
    if agent.approved != 1:
        raise HTTPException(status_code=403, detail="Agent not approved")
    
    # Update last seen
    agent.last_seen = datetime.utcnow()
    
    # Store results and check for alerts
    for check in data.results:
        # Verify monitor belongs to this agent
        monitor_result = await db.execute(
            select(Monitor).where(
                Monitor.id == check.monitor_id,
                Monitor.agent_id == agent.id,
            )
        )
        monitor = monitor_result.scalar_one_or_none()
        
        if monitor:
            # Get previous status for alert comparison
            prev_status_result = await db.execute(
                select(MonitorStatus)
                .where(MonitorStatus.monitor_id == check.monitor_id)
                .order_by(MonitorStatus.checked_at.desc())
                .limit(1)
            )
            prev_status_record = prev_status_result.scalar_one_or_none()
            old_status = prev_status_record.status if prev_status_record else None
            
            # Store new status
            status = MonitorStatus(
                monitor_id=check.monitor_id,
                status=check.status,
                response_time_ms=check.response_time_ms,
                details=check.details,
                checked_at=check.checked_at,
            )
            db.add(status)
            
            # Trigger alert if status changed
            try:
                await alerter_service.send_alert(
                    db,
                    monitor,
                    check.status,
                    details=check.details,
                    old_status=old_status,
                )
            except Exception as e:
                logger.error(f"Failed to send alert for monitor {monitor.name}: {e}")
    
    await retry_on_lock(db.commit)
    
    return {"status": "ok", "received": len(data.results)}


@router.get("/{agent_id}/monitors")
async def get_agent_monitors(
    agent_id: str,
    x_agent_secret: str = Header(None),
    db: AsyncSession = Depends(get_db),
):
    """Get monitors assigned to an agent (called by agent)."""
    result = await db.execute(select(Agent).where(Agent.id == agent_id))
    agent = result.scalar_one_or_none()
    
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    
    # Verify secret
    if x_agent_secret:
        secret_hash = hashlib.sha256(x_agent_secret.encode()).hexdigest()
        if secret_hash != agent.secret_hash:
            raise HTTPException(status_code=403, detail="Invalid credentials")
    
    if agent.approved != 1:
        raise HTTPException(status_code=403, detail="Agent not approved")
    
    # Get monitors
    monitors_result = await db.execute(
        select(Monitor).where(
            Monitor.agent_id == agent_id,
            Monitor.enabled == 1,
        )
    )
    monitors = monitors_result.scalars().all()
    
    return [
        {
            "id": m.id,
            "type": m.type,
            "name": m.name,
            "target": m.target,
            "config": m.config,
            "check_interval": m.check_interval,
        }
        for m in monitors
    ]
