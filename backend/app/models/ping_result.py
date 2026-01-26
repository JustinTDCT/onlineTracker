"""PingResult model - individual ping results for each check."""
from datetime import datetime
from sqlalchemy import Column, Integer, Float, String, DateTime, ForeignKey, Boolean
from sqlalchemy.orm import relationship

from ..database import Base


class PingResult(Base):
    """Individual ping result within a monitor status check."""
    
    __tablename__ = "ping_results"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    status_id = Column(Integer, ForeignKey("monitor_status.id", ondelete="CASCADE"), nullable=False)
    sequence = Column(Integer, nullable=False)  # Ping sequence number (1-20)
    success = Column(Boolean, nullable=False)
    response_time_ms = Column(Float, nullable=True)  # NULL if failed
    details = Column(String, nullable=True)  # Error message if failed
    
    # Relationship
    status = relationship("MonitorStatus", back_populates="ping_results")
