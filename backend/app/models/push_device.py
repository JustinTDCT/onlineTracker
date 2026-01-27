"""PushDevice model - stores iOS device tokens for push notifications."""
from datetime import datetime
from sqlalchemy import Column, Integer, String, DateTime

from ..database import Base


class PushDevice(Base):
    """Registered device for push notifications."""
    
    __tablename__ = "push_devices"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    device_token = Column(String, unique=True, nullable=False, index=True)
    platform = Column(String, default="ios")  # ios, android (future)
    app_version = Column(String, nullable=True)
    enabled = Column(Integer, default=1)  # 0 or 1
    registered_at = Column(DateTime, default=datetime.utcnow)
    last_used_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
