"""Alert model - log of sent alerts."""
from datetime import datetime
from sqlalchemy import Column, Integer, String, DateTime, ForeignKey
from sqlalchemy.orm import relationship

from ..database import Base


class Alert(Base):
    """Record of an alert sent via webhook or email."""
    
    __tablename__ = "alerts"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    monitor_id = Column(Integer, ForeignKey("monitors.id"), nullable=False)
    alert_type = Column(String, nullable=False)  # down, up, degraded, ssl_expiring
    channel = Column(String, default="webhook")  # webhook, email
    sent_at = Column(DateTime, default=datetime.utcnow)
    payload = Column(String, nullable=True)  # JSON for webhook or email body
    success = Column(Integer, nullable=True)  # 1=success, 0=failed
    
    # Relationship
    monitor = relationship("Monitor", back_populates="alerts")
