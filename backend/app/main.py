"""Main FastAPI application with server/agent mode switching."""
import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, APIRouter
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
import os

from .config import settings
from .database import init_db, close_db
from .routers import monitors_router, agents_router, settings_router, status_router, devices_router
from .services.scheduler import scheduler_service
from .services.agent_client import agent_client

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)

# Agent-only API server (for COMS_PORT)
agent_api_server = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan - startup and shutdown."""
    global agent_api_server
    logger.info(f"Starting OnlineTracker in {settings.mode.upper()} mode")
    
    # Initialize database
    await init_db()
    logger.info("Database initialized")
    
    if settings.mode == "server":
        # Server mode: start scheduler for periodic checks
        scheduler_service.start()
        logger.info("Scheduler started")
        
        # Start agent API server on COMS_PORT
        import uvicorn
        agent_app = create_agent_api()
        config = uvicorn.Config(
            agent_app,
            host="0.0.0.0",
            port=settings.coms_port,
            log_level="info",
        )
        agent_api_server = uvicorn.Server(config)
        asyncio.create_task(agent_api_server.serve())
        logger.info(f"Agent API started on port {settings.coms_port}")
        
    elif settings.mode == "agent":
        # Agent mode: start client service in background
        asyncio.create_task(agent_client.run())
        logger.info("Agent client started")
    
    yield
    
    # Shutdown
    if settings.mode == "server":
        scheduler_service.stop()
        if agent_api_server:
            agent_api_server.should_exit = True
    elif settings.mode == "agent":
        agent_client.stop()
    
    await close_db()
    logger.info("Shutdown complete")


def create_agent_api() -> FastAPI:
    """Create a minimal FastAPI app with only agent endpoints.
    
    This runs on COMS_PORT and can be safely exposed to the internet
    for remote agents to connect, without exposing the admin UI.
    """
    from .routers.agents import (
        register_agent,
        report_results,
        get_agent_monitors,
    )
    from .database import get_db
    
    app = FastAPI(
        title="OnlineTracker Agent API",
        description="Agent communication endpoint",
        version="1.0.0",
    )
    
    # CORS for agent communication
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    
    # Create a router for agent endpoints only
    router = APIRouter(prefix="/api/agents", tags=["agents"])
    
    # Only expose the endpoints agents need
    router.add_api_route("/register", register_agent, methods=["POST"], status_code=202)
    router.add_api_route("/report", report_results, methods=["POST"])
    router.add_api_route("/{agent_id}/monitors", get_agent_monitors, methods=["GET"])
    
    app.include_router(router)
    
    # Health check
    @app.get("/health")
    async def health_check():
        return {"status": "healthy", "service": "agent-api"}
    
    return app


def create_app() -> FastAPI:
    """Create and configure the FastAPI application."""
    app = FastAPI(
        title="OnlineTracker",
        description="Monitor your services - ping, HTTP, HTTPS, and SSL checks",
        version="1.0.0",
        lifespan=lifespan,
    )
    
    # CORS middleware for frontend
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],  # In production, restrict to your domain
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    
    # Include API routers (both modes need them for different reasons)
    app.include_router(monitors_router)
    app.include_router(agents_router)
    app.include_router(settings_router)
    app.include_router(status_router)
    app.include_router(devices_router)
    
    # Health check endpoint
    @app.get("/health")
    async def health_check():
        return {
            "status": "healthy",
            "mode": settings.mode,
        }
    
    # Serve frontend static files in server mode
    if settings.mode == "server":
        static_dir = os.path.join(os.path.dirname(__file__), "..", "static")
        if os.path.exists(static_dir):
            app.mount("/assets", StaticFiles(directory=os.path.join(static_dir, "assets")), name="assets")
            
            @app.get("/")
            async def serve_frontend():
                return FileResponse(os.path.join(static_dir, "index.html"))
            
            @app.get("/{full_path:path}")
            async def serve_spa(full_path: str):
                # Serve index.html for SPA routing (excluding API routes)
                if not full_path.startswith("api/"):
                    index_path = os.path.join(static_dir, "index.html")
                    if os.path.exists(index_path):
                        return FileResponse(index_path)
    
    return app


# Create the application instance
app = create_app()


if __name__ == "__main__":
    import uvicorn
    
    port = settings.web_port if settings.mode == "server" else settings.coms_port
    uvicorn.run(app, host="0.0.0.0", port=port)
