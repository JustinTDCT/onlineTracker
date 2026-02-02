"""API routers."""
from .monitors import router as monitors_router
from .agents import router as agents_router
from .settings import router as settings_router
from .status import router as status_router
from .devices import router as devices_router
from .tags import router as tags_router

__all__ = ["monitors_router", "agents_router", "settings_router", "status_router", "devices_router", "tags_router"]
