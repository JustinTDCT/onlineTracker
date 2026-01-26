"""Checker service - performs ping, HTTP, HTTPS, and SSL checks."""
import asyncio
import hashlib
import ssl
import socket
from datetime import datetime
from typing import Optional, Tuple
from dataclasses import dataclass

import httpx


@dataclass
class CheckResult:
    """Result of a monitoring check."""
    status: str  # up, down, degraded, unknown
    response_time_ms: Optional[int] = None
    details: Optional[str] = None
    body_hash: Optional[str] = None
    ssl_expiry_days: Optional[int] = None


class CheckerService:
    """Service for performing various monitoring checks."""
    
    def __init__(self, timeout: int = 10):
        self.timeout = timeout
    
    async def check(self, monitor_type: str, target: str, config: Optional[dict] = None) -> CheckResult:
        """Perform a check based on monitor type."""
        config = config or {}
        timeout = config.get("timeout_seconds", self.timeout)
        
        if monitor_type == "ping":
            return await self._check_ping(target, timeout)
        elif monitor_type == "http":
            return await self._check_http(target, config, timeout)
        elif monitor_type == "https":
            return await self._check_http(target, config, timeout, secure=True)
        elif monitor_type == "ssl":
            return await self._check_ssl(target, timeout)
        else:
            return CheckResult(status="unknown", details=f"Unknown monitor type: {monitor_type}")
    
    async def _check_ping(self, target: str, timeout: int) -> CheckResult:
        """Perform a ping check using system ping command."""
        try:
            start = datetime.now()
            
            # Use system ping command
            proc = await asyncio.create_subprocess_exec(
                "ping", "-c", "1", "-W", str(timeout), target,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=timeout + 2)
            
            response_time = int((datetime.now() - start).total_seconds() * 1000)
            
            if proc.returncode == 0:
                # Parse response time from ping output
                output = stdout.decode()
                if "time=" in output:
                    try:
                        time_str = output.split("time=")[1].split()[0]
                        response_time = int(float(time_str.rstrip("ms")))
                    except (IndexError, ValueError):
                        pass
                return CheckResult(status="up", response_time_ms=response_time)
            else:
                return CheckResult(
                    status="down",
                    response_time_ms=response_time,
                    details=stderr.decode().strip() or "Ping failed",
                )
        except asyncio.TimeoutError:
            return CheckResult(status="down", details="Ping timeout")
        except Exception as e:
            return CheckResult(status="unknown", details=str(e))
    
    async def _check_http(
        self, 
        target: str, 
        config: dict, 
        timeout: int, 
        secure: bool = False
    ) -> CheckResult:
        """Perform HTTP/HTTPS check."""
        # Ensure URL has protocol
        if not target.startswith("http"):
            target = f"{'https' if secure else 'http'}://{target}"
        
        expected_status = config.get("expected_status")
        expected_hash = config.get("expected_body_hash")
        expected_content = config.get("expected_content")
        
        try:
            start = datetime.now()
            
            async with httpx.AsyncClient(timeout=timeout, follow_redirects=True) as client:
                response = await client.get(target)
            
            response_time = int((datetime.now() - start).total_seconds() * 1000)
            
            # Calculate body hash
            body_hash = hashlib.md5(response.content).hexdigest()
            
            # Check expected status
            if expected_status and response.status_code != expected_status:
                return CheckResult(
                    status="down",
                    response_time_ms=response_time,
                    details=f"Expected status {expected_status}, got {response.status_code}",
                    body_hash=body_hash,
                )
            
            # Check expected content in response body
            if expected_content:
                response_text = response.text
                if expected_content not in response_text:
                    return CheckResult(
                        status="down",
                        response_time_ms=response_time,
                        details=f"Expected content not found: '{expected_content[:50]}{'...' if len(expected_content) > 50 else ''}'",
                        body_hash=body_hash,
                    )
            
            # Check expected body hash
            if expected_hash and body_hash != expected_hash:
                return CheckResult(
                    status="degraded",
                    response_time_ms=response_time,
                    details="Response body changed",
                    body_hash=body_hash,
                )
            
            # Success criteria: 2xx or 3xx status
            if 200 <= response.status_code < 400:
                return CheckResult(
                    status="up",
                    response_time_ms=response_time,
                    body_hash=body_hash,
                )
            else:
                return CheckResult(
                    status="down",
                    response_time_ms=response_time,
                    details=f"HTTP {response.status_code}",
                    body_hash=body_hash,
                )
                
        except httpx.TimeoutException:
            return CheckResult(status="down", details="Request timeout")
        except httpx.ConnectError as e:
            return CheckResult(status="down", details=f"Connection error: {e}")
        except Exception as e:
            return CheckResult(status="unknown", details=str(e))
    
    async def _check_ssl(self, target: str, timeout: int) -> CheckResult:
        """Check SSL certificate expiration."""
        # Extract hostname and port
        if "://" in target:
            target = target.split("://")[1]
        if "/" in target:
            target = target.split("/")[0]
        
        host = target
        port = 443
        if ":" in target:
            host, port_str = target.rsplit(":", 1)
            try:
                port = int(port_str)
            except ValueError:
                pass
        
        try:
            start = datetime.now()
            
            # Run SSL check in thread pool (socket operations are blocking)
            loop = asyncio.get_event_loop()
            expiry_days = await asyncio.wait_for(
                loop.run_in_executor(None, self._get_ssl_expiry, host, port),
                timeout=timeout,
            )
            
            response_time = int((datetime.now() - start).total_seconds() * 1000)
            
            if expiry_days is None:
                return CheckResult(status="down", details="Could not get certificate")
            
            if expiry_days <= 0:
                return CheckResult(
                    status="down",
                    response_time_ms=response_time,
                    details="Certificate expired",
                    ssl_expiry_days=expiry_days,
                )
            elif expiry_days <= 7:
                return CheckResult(
                    status="degraded",
                    response_time_ms=response_time,
                    details=f"Certificate expires in {expiry_days} days",
                    ssl_expiry_days=expiry_days,
                )
            else:
                return CheckResult(
                    status="up",
                    response_time_ms=response_time,
                    ssl_expiry_days=expiry_days,
                )
                
        except asyncio.TimeoutError:
            return CheckResult(status="down", details="SSL check timeout")
        except Exception as e:
            return CheckResult(status="unknown", details=str(e))
    
    def _get_ssl_expiry(self, host: str, port: int) -> Optional[int]:
        """Get SSL certificate expiry in days (blocking operation)."""
        try:
            context = ssl.create_default_context()
            with socket.create_connection((host, port), timeout=10) as sock:
                with context.wrap_socket(sock, server_hostname=host) as ssock:
                    cert = ssock.getpeercert()
                    if not cert:
                        return None
                    
                    # Parse expiry date
                    expiry_str = cert.get("notAfter")
                    if not expiry_str:
                        return None
                    
                    # Format: 'Mar 15 12:00:00 2026 GMT'
                    expiry = datetime.strptime(expiry_str, "%b %d %H:%M:%S %Y %Z")
                    days_remaining = (expiry - datetime.utcnow()).days
                    return days_remaining
        except Exception:
            return None


# Global instance
checker_service = CheckerService()
