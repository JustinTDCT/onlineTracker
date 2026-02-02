"""WebSocket connection manager for real-time status updates."""
import asyncio
import json
import logging
from datetime import datetime
from typing import Set, Optional, Dict, Any

from fastapi import WebSocket

logger = logging.getLogger(__name__)


class ConnectionManager:
    """Manages WebSocket connections and broadcasts status updates to all connected clients."""
    
    def __init__(self):
        self.active_connections: Set[WebSocket] = set()
        self._lock = asyncio.Lock()
    
    async def connect(self, websocket: WebSocket):
        """Accept a new WebSocket connection."""
        await websocket.accept()
        async with self._lock:
            self.active_connections.add(websocket)
        logger.info(f"WebSocket connected. Total connections: {len(self.active_connections)}")
    
    async def disconnect(self, websocket: WebSocket):
        """Remove a disconnected WebSocket."""
        async with self._lock:
            self.active_connections.discard(websocket)
        logger.info(f"WebSocket disconnected. Total connections: {len(self.active_connections)}")
    
    async def broadcast(self, message: Dict[str, Any]):
        """Broadcast a message to all connected clients."""
        if not self.active_connections:
            return
        
        message_json = json.dumps(message, default=str)
        
        # Copy the set to avoid modification during iteration
        async with self._lock:
            connections = list(self.active_connections)
        
        # Send to all connections, removing any that fail
        disconnected = []
        for websocket in connections:
            try:
                await websocket.send_text(message_json)
            except Exception as e:
                logger.debug(f"Failed to send to WebSocket: {e}")
                disconnected.append(websocket)
        
        # Remove disconnected clients
        if disconnected:
            async with self._lock:
                for ws in disconnected:
                    self.active_connections.discard(ws)
    
    async def broadcast_status_update(
        self,
        monitor_id: int,
        monitor_name: str,
        status: str,
        response_time_ms: Optional[int] = None,
        ssl_expiry_days: Optional[int] = None,
        details: Optional[str] = None,
    ):
        """Broadcast a status update for a specific monitor."""
        await self.broadcast({
            "type": "status_update",
            "monitor_id": monitor_id,
            "monitor_name": monitor_name,
            "status": status,
            "response_time_ms": response_time_ms,
            "ssl_expiry_days": ssl_expiry_days,
            "details": details,
            "checked_at": datetime.utcnow().isoformat(),
        })
    
    @property
    def connection_count(self) -> int:
        """Return the number of active connections."""
        return len(self.active_connections)


# Global instance
websocket_manager = ConnectionManager()
