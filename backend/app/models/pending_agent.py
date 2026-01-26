"""Pending agent model for tracking registration attempts from unknown UUIDs."""
from datetime import datetime

from sqlalchemy import Column, DateTime, Integer, String

from ..database import Base


class PendingAgent(Base):
    """Track agents that attempted registration but weren't in allowed list.
    
    These are agents that had the correct shared secret but their UUID
    wasn't in the allowed_agent_uuids list.
    """
    __tablename__ = "pending_agents"
    
    uuid = Column(String, primary_key=True)
    name = Column(String, nullable=True)  # Friendly name from registration attempt
    secret_hash = Column(String, nullable=False)  # SHA-256 hash of shared secret
    first_attempt = Column(DateTime, default=datetime.utcnow)
    last_attempt = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    attempt_count = Column(Integer, default=1)
