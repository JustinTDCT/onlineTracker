"""Checker service - performs ping, HTTP, HTTPS, and SSL checks."""
import asyncio
import hashlib
import re
import ssl
import socket
from datetime import datetime
from typing import Optional, Tuple, List
from dataclasses import dataclass, field

import httpx


@dataclass
class PingResultData:
    """Individual ping result."""
    sequence: int
    success: bool
    response_time_ms: Optional[float] = None
    details: Optional[str] = None


@dataclass
class CheckResult:
    """Result of a monitoring check."""
    status: str  # up, down, degraded, unknown
    response_time_ms: Optional[int] = None
    details: Optional[str] = None
    body_hash: Optional[str] = None
    ssl_expiry_days: Optional[int] = None
    ping_results: List[PingResultData] = field(default_factory=list)


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
    
    def _get_latency_status(self, avg_response_time: Optional[int]) -> Tuple[str, Optional[str]]:
        """Determine status based on latency thresholds.
        
        Returns (status, details) tuple.
        Thresholds: 0-80ms = up, 81-200ms = degraded, 201ms+ = down
        """
        if avg_response_time is None:
            return ("unknown", "No response time data")
        
        if avg_response_time <= 80:
            return ("up", None)
        elif avg_response_time <= 200:
            return ("degraded", f"High latency: {avg_response_time}ms")
        else:
            return ("down", f"Very high latency: {avg_response_time}ms")
    
    async def _check_ping(self, target: str, timeout: int) -> CheckResult:
        """Perform ping check with 20 pings.
        
        Status thresholds:
        - Success rate: 76-100% = up, 51-75% = degraded, 50% or lower = down
        - Latency (if success rate is OK): 0-80ms = up, 81-200ms = degraded, 201ms+ = down
        """
        ping_count = 20
        ping_results: List[PingResultData] = []
        
        try:
            # Use system ping command with 20 pings
            # -c 20: send 20 pings
            # -i 1: 1 second interval (avoid rate-limiting on iDRACs, switches, etc.)
            # -W: timeout per ping
            proc = await asyncio.create_subprocess_exec(
                "ping", "-c", str(ping_count), "-i", "1", "-W", str(timeout), target,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            
            # Wait for all pings to complete (20 pings * 1s interval + timeout buffer)
            total_timeout = ping_count + timeout + 5
            stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=total_timeout)
            
            output = stdout.decode()
            
            # Parse individual ping results from output
            # Example line: "64 bytes from 8.8.8.8: icmp_seq=1 ttl=117 time=14.2 ms"
            ping_pattern = re.compile(r'icmp_seq=(\d+).*?time=(\d+\.?\d*)\s*ms')
            
            # Track which sequences we got responses for
            successful_seqs = {}
            for match in ping_pattern.finditer(output):
                seq = int(match.group(1))
                time_ms = float(match.group(2))
                successful_seqs[seq] = time_ms
            
            # Build results for all 20 pings
            for seq in range(1, ping_count + 1):
                if seq in successful_seqs:
                    ping_results.append(PingResultData(
                        sequence=seq,
                        success=True,
                        response_time_ms=successful_seqs[seq],
                    ))
                else:
                    ping_results.append(PingResultData(
                        sequence=seq,
                        success=False,
                        details="No response",
                    ))
            
            # Calculate statistics
            successful_pings = [p for p in ping_results if p.success]
            success_count = len(successful_pings)
            success_rate = (success_count / ping_count) * 100
            
            # Calculate average response time from successful pings
            avg_response_time = None
            if successful_pings:
                avg_response_time = int(sum(p.response_time_ms for p in successful_pings) / len(successful_pings))
            
            # Determine status based on success rate thresholds
            # 76-100% = up, 51-75% = degraded, 50% or lower = down
            if success_rate <= 50:
                return CheckResult(
                    status="down",
                    response_time_ms=avg_response_time,
                    details=f"{success_count}/{ping_count} pings succeeded ({success_rate:.0f}%)",
                    ping_results=ping_results,
                )
            elif success_rate <= 75:
                return CheckResult(
                    status="degraded",
                    response_time_ms=avg_response_time,
                    details=f"{success_count}/{ping_count} pings succeeded ({success_rate:.0f}%)",
                    ping_results=ping_results,
                )
            else:
                # Success rate is good (76-100%), now check latency
                latency_status, latency_details = self._get_latency_status(avg_response_time)
                
                if latency_status == "up":
                    return CheckResult(
                        status="up",
                        response_time_ms=avg_response_time,
                        ping_results=ping_results,
                    )
                else:
                    return CheckResult(
                        status=latency_status,
                        response_time_ms=avg_response_time,
                        details=latency_details,
                        ping_results=ping_results,
                    )
                
        except asyncio.TimeoutError:
            # All pings timed out
            for seq in range(1, ping_count + 1):
                ping_results.append(PingResultData(
                    sequence=seq,
                    success=False,
                    details="Timeout",
                ))
            return CheckResult(
                status="down",
                details="Ping timeout",
                ping_results=ping_results,
            )
        except Exception as e:
            return CheckResult(status="unknown", details=str(e))
    
    async def _check_http(
        self, 
        target: str, 
        config: dict, 
        timeout: int, 
        secure: bool = False
    ) -> CheckResult:
        """Perform HTTP/HTTPS check.
        
        Checks in order:
        1. Expected content (if configured) - down if not found
        2. Expected status code (if configured) - down if mismatch
        3. Expected body hash (if configured) - degraded if changed
        4. HTTP status code - down if not 2xx/3xx
        5. Latency thresholds: 0-80ms = up, 81-200ms = degraded, 201ms+ = down
        """
        # Ensure URL has protocol
        if not target.startswith("http"):
            target = f"{'https' if secure else 'http'}://{target}"
        
        expected_status = config.get("expected_status")
        expected_hash = config.get("expected_body_hash")
        expected_content = config.get("expected_content")
        
        try:
            start = datetime.now()
            
            # Disable SSL verification to handle self-signed certificates
            async with httpx.AsyncClient(timeout=timeout, follow_redirects=True, verify=False) as client:
                response = await client.get(target)
            
            response_time = int((datetime.now() - start).total_seconds() * 1000)
            
            # Calculate body hash
            body_hash = hashlib.md5(response.content).hexdigest()
            
            # Check expected content in response body FIRST
            if expected_content:
                response_text = response.text
                if expected_content not in response_text:
                    return CheckResult(
                        status="down",
                        response_time_ms=response_time,
                        details=f"Expected content not found: '{expected_content[:50]}{'...' if len(expected_content) > 50 else ''}'",
                        body_hash=body_hash,
                    )
            
            # Check expected status
            if expected_status and response.status_code != expected_status:
                return CheckResult(
                    status="down",
                    response_time_ms=response_time,
                    details=f"Expected status {expected_status}, got {response.status_code}",
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
            
            # Check HTTP status code: must be 2xx or 3xx
            if not (200 <= response.status_code < 400):
                return CheckResult(
                    status="down",
                    response_time_ms=response_time,
                    details=f"HTTP {response.status_code}",
                    body_hash=body_hash,
                )
            
            # All content checks passed, now check latency thresholds
            latency_status, latency_details = self._get_latency_status(response_time)
            
            if latency_status == "up":
                return CheckResult(
                    status="up",
                    response_time_ms=response_time,
                    body_hash=body_hash,
                )
            else:
                return CheckResult(
                    status=latency_status,
                    response_time_ms=response_time,
                    details=latency_details,
                    body_hash=body_hash,
                )
                
        except httpx.TimeoutException:
            return CheckResult(status="down", details="Request timeout")
        except httpx.ConnectError as e:
            return CheckResult(status="down", details=f"Connection error: {e}")
        except Exception as e:
            return CheckResult(status="unknown", details=str(e))
    
    async def _check_ssl(self, target: str, timeout: int) -> CheckResult:
        """Check SSL certificate expiration.
        
        Status thresholds:
        - 31+ days = up
        - 15-30 days = degraded
        - 14 days or less = down
        """
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
            
            if expiry_days <= 14:
                # 14 days or less = down
                if expiry_days <= 0:
                    details = "Certificate expired"
                else:
                    details = f"Certificate expires in {expiry_days} days"
                return CheckResult(
                    status="down",
                    response_time_ms=response_time,
                    details=details,
                    ssl_expiry_days=expiry_days,
                )
            elif expiry_days <= 30:
                # 15-30 days = degraded
                return CheckResult(
                    status="degraded",
                    response_time_ms=response_time,
                    details=f"Certificate expires in {expiry_days} days",
                    ssl_expiry_days=expiry_days,
                )
            else:
                # 31+ days = up
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
            # Create context that doesn't verify certificate chain
            # We just want to read the expiry date, not validate trust
            context = ssl.create_default_context()
            context.check_hostname = False
            context.verify_mode = ssl.CERT_NONE
            
            with socket.create_connection((host, port), timeout=10) as sock:
                with context.wrap_socket(sock, server_hostname=host) as ssock:
                    # Use getpeercert(binary_form=True) with CERT_NONE since
                    # getpeercert() returns empty dict when not validating
                    cert_der = ssock.getpeercert(binary_form=True)
                    if not cert_der:
                        return None
                    
                    # Parse the DER certificate to get expiry
                    from cryptography import x509
                    cert = x509.load_der_x509_certificate(cert_der)
                    expiry = cert.not_valid_after_utc
                    days_remaining = (expiry - datetime.now(expiry.tzinfo)).days
                    return days_remaining
        except Exception:
            return None


# Global instance
checker_service = CheckerService()
