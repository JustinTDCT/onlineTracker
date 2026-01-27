"""Database utility functions."""
import asyncio
import logging
from typing import Callable, TypeVar

from sqlalchemy.exc import OperationalError

logger = logging.getLogger(__name__)

T = TypeVar('T')


async def retry_on_lock(coro_func: Callable[[], T], max_retries: int = 3, base_delay: float = 0.1) -> T:
    """Retry a coroutine function on database lock errors with exponential backoff.
    
    Args:
        coro_func: Async function to call (should be a callable that returns a coroutine)
        max_retries: Maximum number of retry attempts
        base_delay: Base delay in seconds (doubles with each retry)
        
    Returns:
        The result of the coroutine function
        
    Raises:
        OperationalError: If all retries fail or error is not a lock error
    """
    last_exception = None
    for attempt in range(max_retries):
        try:
            return await coro_func()
        except OperationalError as e:
            if "database is locked" in str(e):
                last_exception = e
                delay = base_delay * (2 ** attempt)
                logger.warning(f"Database locked, retrying in {delay}s (attempt {attempt + 1}/{max_retries})")
                await asyncio.sleep(delay)
            else:
                raise
    raise last_exception
