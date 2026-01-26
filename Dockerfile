# OnlineTracker - Multi-stage Dockerfile
# Builds both frontend and backend into a single image

# Stage 1: Build React frontend
FROM node:20-alpine AS frontend-builder

WORKDIR /app/frontend

# Copy frontend package files
COPY frontend/package*.json ./
RUN npm ci

# Copy frontend source and build
COPY frontend/ ./
RUN npm run build

# Stage 2: Python runtime
FROM python:3.12-slim

WORKDIR /app

# Install system dependencies (ping for ICMP checks)
RUN apt-get update && apt-get install -y --no-install-recommends \
    iputils-ping \
    && rm -rf /var/lib/apt/lists/*

# Copy backend requirements and install
COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend source
COPY backend/app ./app

# Copy built frontend from Stage 1
COPY --from=frontend-builder /app/frontend/dist ./static

# Create data directory
RUN mkdir -p /data

# Environment defaults
ENV MODE=server
ENV COMS_PORT=19443
ENV WEB_PORT=8000
ENV DATA_PATH=/data

# Expose ports
EXPOSE 8000
EXPOSE 19443

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD python -c "import httpx; httpx.get('http://localhost:8000/health')" || exit 1

# Run the application
CMD ["python", "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
