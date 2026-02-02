"""Tag CRUD API endpoints."""
from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from ..database import get_db
from ..models import Tag, Monitor, monitor_tags
from ..schemas.tag import (
    TagCreate,
    TagUpdate,
    TagResponse,
    TagWithMonitorCount,
    MonitorTagAssignment,
)
from ..utils.db_utils import retry_on_lock

router = APIRouter(prefix="/api/tags", tags=["tags"])


@router.get("", response_model=List[TagWithMonitorCount])
async def list_tags(db: AsyncSession = Depends(get_db)):
    """List all tags with monitor counts."""
    result = await db.execute(
        select(Tag).options(selectinload(Tag.monitors)).order_by(Tag.name)
    )
    tags = result.scalars().all()
    
    return [
        TagWithMonitorCount(
            id=tag.id,
            name=tag.name,
            color=tag.color,
            created_at=tag.created_at,
            monitor_count=len(tag.monitors),
        )
        for tag in tags
    ]


@router.post("", response_model=TagResponse, status_code=201)
async def create_tag(tag: TagCreate, db: AsyncSession = Depends(get_db)):
    """Create a new tag."""
    # Check if tag name already exists
    existing = await db.execute(select(Tag).where(Tag.name == tag.name))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Tag with this name already exists")
    
    db_tag = Tag(name=tag.name, color=tag.color)
    db.add(db_tag)
    
    async def do_commit():
        await db.commit()
    
    await retry_on_lock(do_commit)
    await db.refresh(db_tag)
    
    return TagResponse(
        id=db_tag.id,
        name=db_tag.name,
        color=db_tag.color,
        created_at=db_tag.created_at,
    )


@router.get("/{tag_id}", response_model=TagWithMonitorCount)
async def get_tag(tag_id: int, db: AsyncSession = Depends(get_db)):
    """Get a specific tag by ID."""
    result = await db.execute(
        select(Tag).options(selectinload(Tag.monitors)).where(Tag.id == tag_id)
    )
    tag = result.scalar_one_or_none()
    
    if not tag:
        raise HTTPException(status_code=404, detail="Tag not found")
    
    return TagWithMonitorCount(
        id=tag.id,
        name=tag.name,
        color=tag.color,
        created_at=tag.created_at,
        monitor_count=len(tag.monitors),
    )


@router.put("/{tag_id}", response_model=TagResponse)
async def update_tag(
    tag_id: int,
    update: TagUpdate,
    db: AsyncSession = Depends(get_db),
):
    """Update a tag."""
    result = await db.execute(select(Tag).where(Tag.id == tag_id))
    tag = result.scalar_one_or_none()
    
    if not tag:
        raise HTTPException(status_code=404, detail="Tag not found")
    
    # Check name uniqueness if updating name
    if update.name is not None and update.name != tag.name:
        existing = await db.execute(select(Tag).where(Tag.name == update.name))
        if existing.scalar_one_or_none():
            raise HTTPException(status_code=400, detail="Tag with this name already exists")
        tag.name = update.name
    
    if update.color is not None:
        tag.color = update.color
    
    async def do_commit():
        await db.commit()
    
    await retry_on_lock(do_commit)
    await db.refresh(tag)
    
    return TagResponse(
        id=tag.id,
        name=tag.name,
        color=tag.color,
        created_at=tag.created_at,
    )


@router.delete("/{tag_id}", status_code=204)
async def delete_tag(tag_id: int, db: AsyncSession = Depends(get_db)):
    """Delete a tag."""
    result = await db.execute(select(Tag).where(Tag.id == tag_id))
    tag = result.scalar_one_or_none()
    
    if not tag:
        raise HTTPException(status_code=404, detail="Tag not found")
    
    await db.delete(tag)
    
    async def do_commit():
        await db.commit()
    
    await retry_on_lock(do_commit)


@router.put("/monitors/{monitor_id}/tags", response_model=List[TagResponse])
async def set_monitor_tags(
    monitor_id: int,
    assignment: MonitorTagAssignment,
    db: AsyncSession = Depends(get_db),
):
    """Set tags for a monitor (replaces existing tags)."""
    # Get monitor with tags loaded
    result = await db.execute(
        select(Monitor).options(selectinload(Monitor.tags)).where(Monitor.id == monitor_id)
    )
    monitor = result.scalar_one_or_none()
    
    if not monitor:
        raise HTTPException(status_code=404, detail="Monitor not found")
    
    # Get the requested tags
    if assignment.tag_ids:
        tags_result = await db.execute(
            select(Tag).where(Tag.id.in_(assignment.tag_ids))
        )
        new_tags = list(tags_result.scalars().all())
        
        # Verify all requested tags exist
        if len(new_tags) != len(assignment.tag_ids):
            raise HTTPException(status_code=400, detail="One or more tags not found")
    else:
        new_tags = []
    
    # Replace tags
    monitor.tags = new_tags
    
    async def do_commit():
        await db.commit()
    
    await retry_on_lock(do_commit)
    await db.refresh(monitor)
    
    return [
        TagResponse(
            id=tag.id,
            name=tag.name,
            color=tag.color,
            created_at=tag.created_at,
        )
        for tag in monitor.tags
    ]


@router.get("/monitors/{monitor_id}/tags", response_model=List[TagResponse])
async def get_monitor_tags(monitor_id: int, db: AsyncSession = Depends(get_db)):
    """Get all tags for a monitor."""
    result = await db.execute(
        select(Monitor).options(selectinload(Monitor.tags)).where(Monitor.id == monitor_id)
    )
    monitor = result.scalar_one_or_none()
    
    if not monitor:
        raise HTTPException(status_code=404, detail="Monitor not found")
    
    return [
        TagResponse(
            id=tag.id,
            name=tag.name,
            color=tag.color,
            created_at=tag.created_at,
        )
        for tag in monitor.tags
    ]
