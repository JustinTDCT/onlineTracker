"""Tag schemas for API request/response models."""
from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, Field


class TagBase(BaseModel):
    """Base tag fields."""
    name: str = Field(..., min_length=1, max_length=50)
    color: str = Field(default="#6366f1", pattern=r"^#[0-9a-fA-F]{6}$")


class TagCreate(TagBase):
    """Schema for creating a tag."""
    pass


class TagUpdate(BaseModel):
    """Schema for updating a tag."""
    name: Optional[str] = Field(None, min_length=1, max_length=50)
    color: Optional[str] = Field(None, pattern=r"^#[0-9a-fA-F]{6}$")


class TagResponse(TagBase):
    """Schema for tag response."""
    id: int
    created_at: datetime
    
    class Config:
        from_attributes = True


class TagWithMonitorCount(TagResponse):
    """Tag with count of associated monitors."""
    monitor_count: int = 0


class MonitorTagAssignment(BaseModel):
    """Schema for assigning/removing tags from a monitor."""
    tag_ids: List[int]
