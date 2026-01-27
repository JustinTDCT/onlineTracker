"""Database utility functions."""
import asyncio
import logging
from typing import Callable, TypeVar

from sqlalchemy.exc import OperationalError, InterfaceError

logger = logging.getLogger(__name__)

T = TypeVar('T')


async def retry_on_lock(coro_func: Callable[[], T], max_retries: int = 3, base_delay: float = 0.1) -> T:
    """Retry a database operation on transient errors with exponential backoff.
    
    Handles PostgreSQL transient connection errors that may occur under high load.
    
    Args:
        coro_func: Async function to call (should be a callable that returns a coroutine)
        max_retries: Maximum number of retry attempts
        base_delay: Base delay in seconds (doubles with each retry)
        
    Returns:
        The result of the coroutine function
        
    Raises:
        OperationalError: If all retries fail or error is not transient
    """
    last_exception = None
    for attempt in range(max_retries):
        try:
            return await coro_func()
        except (OperationalError, InterfaceError) as e:
            error_str = str(e).lower()
            # Retry on transient connection errors
            if any(msg in error_str for msg in [
                "connection refused",
                "connection reset",
                "connection closed",
                "server closed",
                "timeout",
                "too many clients",
            ]):
                last_exception = e
                delay = base_delay * (2 ** attempt)
                logger.warning(f"Database transient error, retrying in {delay}s (attempt {attempt + 1}/{max_retries})")
                await asyncio.sleep(delay)
            else:
                raise
    raise last_exception
