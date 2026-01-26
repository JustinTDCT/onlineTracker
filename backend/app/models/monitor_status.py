"""MonitorStatus model - status history for monitors."""
from datetime import datetime
from sqlalchemy import Column, Integer, String, DateTime, ForeignKey
from sqlalchemy.orm import relationship

from ..database import Base


class MonitorStatus(Base):
    """Status check result - rolling 72-hour history."""
    
    __tablename__ = "monitor_status"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    monitor_id = Column(Integer, ForeignKey("monitors.id"), nullable=False)
    checked_at = Column(DateTime, default=datetime.utcnow)
    status = Column(String, nullable=False)  # up, down, degraded, unknown
    response_time_ms = Column(Integer, nullable=True)
    details = Column(String, nullable=True)  # Error message or extra info
    ssl_expiry_days = Column(Integer, nullable=True)  # Days until SSL cert expires
    
    # Relationships
    monitor = relationship("Monitor", back_populates="statuses")
    ping_results = relationship("PingResult", back_populates="status", cascade="all, delete-orphan")
