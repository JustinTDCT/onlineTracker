"""Agent client service - handles agent mode operations."""
import asyncio
import hashlib
import json
import logging
import socket
import uuid
from datetime import datetime
from pathlib import Path
from typing import Optional

import httpx

from ..config import settings
from .checker import checker_service

logger = logging.getLogger(__name__)


class AgentClientService:
    """Service for agent mode - connects to server and reports results."""
    
    def __init__(self):
        self._agent_uuid: Optional[str] = None
        self._running = False
        self._registered = False
    
    @property
    def agent_uuid(self) -> str:
        """Get or generate the agent UUID."""
        if self._agent_uuid:
            return self._agent_uuid
        
        # Try to load from file
        uuid_file = Path(settings.data_path) / "agent_uuid"
        if uuid_file.exists():
            self._agent_uuid = uuid_file.read_text().strip()
            logger.info(f"Loaded existing agent UUID: {self._agent_uuid}")
        else:
            # Generate new UUID
            self._agent_uuid = str(uuid.uuid4())
            uuid_file.parent.mkdir(parents=True, exist_ok=True)
            uuid_file.write_text(self._agent_uuid)
            logger.info(f"Generated new agent UUID: {self._agent_uuid}")
        
        return self._agent_uuid
    
    def log_uuid_banner(self):
        """Log the agent UUID prominently for easy copying."""
        name_line = f"  AGENT NAME: {self.agent_name}\n" if self.agent_name else ""
        banner = f"""
================================================================================
{name_line}  AGENT UUID: {self.agent_uuid}
  
  Add this UUID to the allowed agents list in your OnlineTracker server settings
  before this agent can register and start monitoring.
================================================================================
"""
        logger.info(banner)
        # Also print to stdout for container logs
        print(banner)
    
    @property
    def server_url(self) -> str:
        """Get the server URL."""
        host = settings.server_host
        port = settings.coms_port
        return f"http://{host}:{port}"
    
    @property
    def secret_hash(self) -> str:
        """Get SHA-256 hash of the shared secret."""
        if not settings.shared_secret:
            raise ValueError("SHARED_SECRET not configured")
        return hashlib.sha256(settings.shared_secret.encode()).hexdigest()
    
    @property
    def agent_name(self) -> Optional[str]:
        """Get the agent's friendly name from env var or hostname."""
        if settings.agent_name:
            return settings.agent_name
        # Fall back to hostname
        try:
            return socket.gethostname()
        except Exception:
            return None
    
    async def register(self) -> bool:
        """Register this agent with the server."""
        if not settings.server_host or not settings.shared_secret:
            logger.error("SERVER_HOST and SHARED_SECRET must be configured for agent mode")
            return False
        
        try:
            async with httpx.AsyncClient(timeout=30) as client:
                response = await client.post(
                    f"{self.server_url}/api/agents/register",
                    json={
                        "uuid": self.agent_uuid,
                        "secret_hash": self.secret_hash,
                        "name": self.agent_name,
                    },
                )
                
                if response.status_code == 202:
                    data = response.json()
                    msg = data.get("message", "registered")
                    logger.info(f"Agent registered: {msg}")
                    return True
                elif response.status_code == 200:
                    data = response.json()
                    logger.info(f"Agent already registered: {data.get('status', 'ok')}")
                    return True
                else:
                    logger.error(f"Registration failed: {response.status_code} - {response.text}")
                    return False
                    
        except Exception as e:
            logger.error(f"Failed to register with server: {e}")
            return False
    
    async def report_results(self, results: list) -> bool:
        """Report check results to the server."""
        try:
            async with httpx.AsyncClient(timeout=30) as client:
                response = await client.post(
                    f"{self.server_url}/api/agents/report",
                    json={
                        "uuid": self.agent_uuid,
                        "secret": settings.shared_secret,
                        "results": results,
                    },
                )
                
                if response.status_code == 200:
                    return True
                elif response.status_code == 403:
                    logger.warning("Agent not approved yet")
                    return False
                else:
                    logger.error(f"Report failed: {response.status_code}")
                    return False
                    
        except Exception as e:
            logger.error(f"Failed to report results: {e}")
            return False
    
    async def get_monitors(self) -> list:
        """Get monitors assigned to this agent from server."""
        try:
            async with httpx.AsyncClient(timeout=30) as client:
                response = await client.get(
                    f"{self.server_url}/api/agents/{self.agent_uuid}/monitors",
                    headers={"X-Agent-Secret": settings.shared_secret or ""},
                )
                
                if response.status_code == 200:
                    return response.json()
                else:
                    logger.error(f"Failed to get monitors: {response.status_code}")
                    return []
                    
        except Exception as e:
            logger.error(f"Failed to get monitors: {e}")
            return []
    
    async def run(self):
        """Main agent loop - register, get monitors, run checks, report."""
        self._running = True
        logger.info("Starting agent client service")
        
        # Log UUID prominently for admin to copy
        self.log_uuid_banner()
        
        # Initial registration
        while self._running and not self._registered:
            self._registered = await self.register()
            if not self._registered:
                logger.info("Retrying registration in 30 seconds...")
                await asyncio.sleep(30)
        
        # Main loop
        while self._running:
            try:
                # Get assigned monitors
                monitors = await self.get_monitors()
                
                if monitors:
                    results = []
                    for monitor in monitors:
                        # Run check
                        config = monitor.get("config") or {}
                        check_result = await checker_service.check(
                            monitor["type"],
                            monitor["target"],
                            config,
                        )
                        
                        results.append({
                            "monitor_id": monitor["id"],
                            "status": check_result.status,
                            "response_time_ms": check_result.response_time_ms,
                            "details": check_result.details,
                            "checked_at": datetime.utcnow().isoformat(),
                        })
                    
                    # Report results
                    if results:
                        await self.report_results(results)
                
                # Wait before next cycle
                await asyncio.sleep(30)
                
            except Exception as e:
                logger.error(f"Agent loop error: {e}")
                await asyncio.sleep(10)
    
    def stop(self):
        """Stop the agent client."""
        self._running = False
        logger.info("Agent client stopped")


# Global instance
agent_client = AgentClientService()
