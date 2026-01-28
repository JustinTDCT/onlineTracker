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
    
    # Default thresholds (can be overridden by config)
    DEFAULT_PING_COUNT = 5
    DEFAULT_HTTP_REQUEST_COUNT = 3
    DEFAULT_OK_THRESHOLD_MS = 80
    DEFAULT_DEGRADED_THRESHOLD_MS = 200
    DEFAULT_SSL_OK_DAYS = 30
    DEFAULT_SSL_WARNING_DAYS = 14
    
    def __init__(self, timeout: int = 10):
        self.timeout = timeout
    
    async def check(self, monitor_type: str, target: str, config: Optional[dict] = None) -> CheckResult:
        """Perform a check based on monitor type."""
        config = config or {}
        timeout = config.get("timeout_seconds", self.timeout)
        
        if monitor_type == "ping":
            return await self._check_ping(target, timeout, config)
        elif monitor_type == "http":
            return await self._check_http(target, config, timeout)
        elif monitor_type == "https":
            return await self._check_http(target, config, timeout, secure=True)
        elif monitor_type == "ssl":
            return await self._check_ssl(target, timeout, config)
        else:
            return CheckResult(status="unknown", details=f"Unknown monitor type: {monitor_type}")
    
    def _get_latency_status(
        self, 
        avg_response_time: Optional[int],
        ok_threshold_ms: int = DEFAULT_OK_THRESHOLD_MS,
        degraded_threshold_ms: int = DEFAULT_DEGRADED_THRESHOLD_MS,
    ) -> Tuple[str, Optional[str]]:
        """Determine status based on latency thresholds.
        
        Returns (status, details) tuple.
        """
        if avg_response_time is None:
            return ("unknown", "No response time data")
        
        if avg_response_time <= ok_threshold_ms:
            return ("up", None)
        elif avg_response_time <= degraded_threshold_ms:
            return ("degraded", f"High latency: {avg_response_time}ms")
        else:
            return ("down", f"Very high latency: {avg_response_time}ms")
    
    async def _check_ping(self, target: str, timeout: int, config: dict) -> CheckResult:
        """Perform ping check with configurable ping count.
        
        Status thresholds:
        - Success rate: 76-100% = up, 51-75% = degraded, 50% or lower = down
        - Latency (if success rate is OK): uses configurable thresholds
        """
        # Get ping count from config (default 5, max 10, min 1)
        ping_count = config.get("ping_count", self.DEFAULT_PING_COUNT)
        if ping_count > 10:
            ping_count = 10
        elif ping_count < 1:
            ping_count = 1
        
        # Get latency thresholds from config
        ok_threshold_ms = config.get("ping_ok_threshold_ms", self.DEFAULT_OK_THRESHOLD_MS)
        degraded_threshold_ms = config.get("ping_degraded_threshold_ms", self.DEFAULT_DEGRADED_THRESHOLD_MS)
        
        ping_results: List[PingResultData] = []
        
        try:
            # Use system ping command with configurable ping count
            # -c N: send N pings
            # -i 1: 1 second interval (avoid rate-limiting on iDRACs, switches, etc.)
            # -W: timeout per ping
            proc = await asyncio.create_subprocess_exec(
                "ping", "-c", str(ping_count), "-i", "1", "-W", str(timeout), target,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            
            # Wait for all pings to complete (ping_count * 1s interval + timeout buffer)
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
            
            # Build results for all pings
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
                # Success rate is good (76-100%), now check latency with configurable thresholds
                latency_status, latency_details = self._get_latency_status(
                    avg_response_time, ok_threshold_ms, degraded_threshold_ms
                )
                
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
        """Perform HTTP/HTTPS check with configurable request count.
        
        Performs multiple requests (like ping) and averages response times.
        
        Checks in order:
        1. Expected content (if configured) - down if not found
        2. Expected status code (if configured) - down if mismatch
        3. Expected body hash (if configured) - degraded if changed
        4. HTTP status code - down if not 2xx/3xx
        5. Success rate: 76-100% = up, 51-75% = degraded, 50% or lower = down
        6. Latency thresholds (if success rate is OK): uses configurable thresholds
        """
        # Ensure URL has protocol
        if not target.startswith("http"):
            target = f"{'https' if secure else 'http'}://{target}"
        
        expected_status = config.get("expected_status")
        expected_hash = config.get("expected_body_hash")
        expected_content = config.get("expected_content")
        
        # Get request count from config (default 3, max 10, min 1)
        request_count = config.get("http_request_count", self.DEFAULT_HTTP_REQUEST_COUNT)
        if request_count > 10:
            request_count = 10
        elif request_count < 1:
            request_count = 1
        
        # Get latency thresholds from config
        ok_threshold_ms = config.get("http_ok_threshold_ms", self.DEFAULT_OK_THRESHOLD_MS)
        degraded_threshold_ms = config.get("http_degraded_threshold_ms", self.DEFAULT_DEGRADED_THRESHOLD_MS)
        
        successful_times: List[int] = []
        failed_count = 0
        last_error = None
        body_hash = None
        
        try:
            async with httpx.AsyncClient(timeout=timeout, follow_redirects=True, verify=False) as client:
                for i in range(request_count):
                    try:
                        start = datetime.now()
                        response = await client.get(target)
                        response_time = int((datetime.now() - start).total_seconds() * 1000)
                        
                        # Calculate body hash (use from last successful request)
                        body_hash = hashlib.md5(response.content).hexdigest()
                        
                        # Check expected content in response body
                        if expected_content:
                            response_text = response.text
                            if expected_content not in response_text:
                                failed_count += 1
                                last_error = f"Expected content not found: '{expected_content[:50]}{'...' if len(expected_content) > 50 else ''}'"
                                continue
                        
                        # Check expected status
                        if expected_status and response.status_code != expected_status:
                            failed_count += 1
                            last_error = f"Expected status {expected_status}, got {response.status_code}"
                            continue
                        
                        # Check expected body hash
                        if expected_hash and body_hash != expected_hash:
                            # Body hash mismatch is degraded, but still counts as "successful" for timing
                            successful_times.append(response_time)
                            last_error = "Response body changed"
                            continue
                        
                        # Check HTTP status code: must be 2xx or 3xx
                        if not (200 <= response.status_code < 400):
                            failed_count += 1
                            last_error = f"HTTP {response.status_code}"
                            continue
                        
                        # Request succeeded
                        successful_times.append(response_time)
                        
                    except httpx.TimeoutException:
                        failed_count += 1
                        last_error = "Request timeout"
                    except httpx.ConnectError as e:
                        failed_count += 1
                        last_error = f"Connection error: {e}"
                    except Exception as e:
                        failed_count += 1
                        last_error = str(e)
                    
                    # Small delay between requests to avoid overwhelming the server
                    if i < request_count - 1:
                        await asyncio.sleep(0.1)
            
            # Calculate statistics
            success_count = len(successful_times)
            total_attempts = success_count + failed_count
            success_rate = (success_count / total_attempts) * 100 if total_attempts > 0 else 0
            
            # Calculate average response time from successful requests
            avg_response_time = None
            if successful_times:
                avg_response_time = int(sum(successful_times) / len(successful_times))
            
            # All requests failed
            if success_count == 0:
                return CheckResult(
                    status="down",
                    details=last_error or f"All {request_count} requests failed",
                    body_hash=body_hash,
                )
            
            # Determine status based on success rate thresholds (same as ping)
            # 76-100% = up, 51-75% = degraded, 50% or lower = down
            if success_rate <= 50:
                return CheckResult(
                    status="down",
                    response_time_ms=avg_response_time,
                    details=f"{success_count}/{total_attempts} requests succeeded ({success_rate:.0f}%)",
                    body_hash=body_hash,
                )
            elif success_rate <= 75:
                return CheckResult(
                    status="degraded",
                    response_time_ms=avg_response_time,
                    details=f"{success_count}/{total_attempts} requests succeeded ({success_rate:.0f}%)",
                    body_hash=body_hash,
                )
            else:
                # Success rate is good (76-100%), now check latency with configurable thresholds
                latency_status, latency_details = self._get_latency_status(
                    avg_response_time, ok_threshold_ms, degraded_threshold_ms
                )
                
                if latency_status == "up":
                    return CheckResult(
                        status="up",
                        response_time_ms=avg_response_time,
                        body_hash=body_hash,
                    )
                else:
                    return CheckResult(
                        status=latency_status,
                        response_time_ms=avg_response_time,
                        details=latency_details,
                        body_hash=body_hash,
                    )
                
        except Exception as e:
            return CheckResult(status="unknown", details=str(e))
    
    async def _check_ssl(self, target: str, timeout: int, config: dict) -> CheckResult:
        """Check SSL certificate expiration.
        
        Status thresholds are configurable:
        - Days >= ok_threshold = up (OK)
        - Days >= warning_threshold but < ok_threshold = degraded (Warning)
        - Days < warning_threshold = down
        """
        # Get SSL thresholds from config
        ok_threshold_days = config.get("ssl_ok_threshold_days", self.DEFAULT_SSL_OK_DAYS)
        warning_threshold_days = config.get("ssl_warning_threshold_days", self.DEFAULT_SSL_WARNING_DAYS)
        
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
                # Expired
                return CheckResult(
                    status="down",
                    response_time_ms=response_time,
                    details="Certificate expired",
                    ssl_expiry_days=expiry_days,
                )
            elif expiry_days < warning_threshold_days:
                # Below warning threshold = down
                return CheckResult(
                    status="down",
                    response_time_ms=response_time,
                    details=f"Certificate expires in {expiry_days} days",
                    ssl_expiry_days=expiry_days,
                )
            elif expiry_days < ok_threshold_days:
                # Between warning and ok threshold = degraded (warning)
                return CheckResult(
                    status="degraded",
                    response_time_ms=response_time,
                    details=f"Certificate expires in {expiry_days} days",
                    ssl_expiry_days=expiry_days,
                )
            else:
                # At or above ok threshold = up
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
