"""Monitor model - items being monitored."""
from datetime import datetime
from sqlalchemy import Column, Integer, String, DateTime, ForeignKey
from sqlalchemy.orm import relationship

from ..database import Base


class Monitor(Base):
    """A monitored endpoint - ping, HTTP, HTTPS, or SSL check."""
    
    __tablename__ = "monitors"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    agent_id = Column(String, ForeignKey("agents.id"), nullable=True)  # NULL = server-side
    type = Column(String, nullable=False)  # ping, http, https, ssl
    name = Column(String, nullable=False)
    target = Column(String, nullable=False)  # IP/hostname/URL
    config = Column(String, nullable=True)  # JSON: expected_status, expected_body_hash, etc.
    check_interval = Column(Integer, default=60)  # seconds
    enabled = Column(Integer, default=1)
    created_at = Column(DateTime, default=datetime.utcnow)
    
    # Relationships
    agent = relationship("Agent", back_populates="monitors")
    statuses = relationship("MonitorStatus", back_populates="monitor", cascade="all, delete-orphan")
    alerts = relationship("Alert", back_populates="monitor", cascade="all, delete-orphan")
