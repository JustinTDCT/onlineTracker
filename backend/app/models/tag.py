"""Tag model for grouping monitors."""
from datetime import datetime
from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Table
from sqlalchemy.orm import relationship

from ..database import Base


# Junction table for many-to-many relationship between monitors and tags
monitor_tags = Table(
    "monitor_tags",
    Base.metadata,
    Column("monitor_id", Integer, ForeignKey("monitors.id", ondelete="CASCADE"), primary_key=True),
    Column("tag_id", Integer, ForeignKey("tags.id", ondelete="CASCADE"), primary_key=True),
)


class Tag(Base):
    """A tag for grouping monitors."""
    
    __tablename__ = "tags"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(50), nullable=False, unique=True)
    color = Column(String(7), default="#6366f1")  # Hex color
    created_at = Column(DateTime, default=datetime.utcnow)
    
    # Relationship to monitors via junction table
    monitors = relationship("Monitor", secondary=monitor_tags, back_populates="tags")
