# OnlineTracker

A Docker-based service monitoring system with support for distributed agents.

## Features

- **Multiple check types**: Ping, HTTP/HTTPS, SSL certificate monitoring
- **72-hour status history** with visual graphs (like status.cursor.com)
- **Webhook alerts** for status changes and SSL expiry warnings
- **Agent mode** for distributed monitoring from multiple locations
- **SQLite database** - no external dependencies

## Quick Start

### Using Docker Compose

```bash
# Build and start the server
docker-compose up -d

# View logs
docker-compose logs -f
```

Access the web UI at `http://localhost:8000`

### Using Docker directly

```bash
# Build the image
docker build -t onlinetracker .

# Run in server mode
docker run -d \
  --name onlinetracker \
  -p 8000:8000 \
  -p 19443:19443 \
  -v onlinetracker-data:/data \
  onlinetracker
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `MODE` | `server` | Run mode: `server` or `agent` |
| `WEB_PORT` | `8000` | Web UI port (server mode) |
| `COMS_PORT` | `19443` | Agent communication port |
| `DATA_PATH` | `/data` | SQLite database location |
| `SERVER_HOST` | - | Agent mode: server hostname |
| `SHARED_SECRET` | - | Agent mode: authentication secret |

## Server Mode

In server mode, OnlineTracker:
- Serves the web dashboard
- Runs scheduled monitoring checks
- Accepts agent connections and results
- Sends webhook alerts on status changes

### Adding Monitors

1. Open the web UI at `http://localhost:8000`
2. Click "Add Monitor"
3. Select type (Ping, HTTP, HTTPS, SSL)
4. Enter target and configuration
5. Click "Test" to verify, then "Save"

### Webhook Configuration

Go to Settings and configure your webhook URL. Alerts are sent as JSON:

```json
{
  "monitor": "API Server",
  "type": "http",
  "target": "https://api.example.com",
  "event": "down",
  "details": "HTTP 503",
  "timestamp": "2026-01-26T10:30:00Z"
}
```

## Agent Mode

Agents run on remote servers and report results back to the central server.

### Setting up an Agent

1. Deploy the agent container:

```bash
docker run -d \
  --name onlinetracker-agent \
  -e MODE=agent \
  -e SERVER_HOST=your-server-hostname \
  -e COMS_PORT=19443 \
  -e SHARED_SECRET=your-secret-key \
  -v agent-data:/data \
  onlinetracker
```

2. The agent generates a UUID on first start
3. In the server UI, go to "Agents" and approve the new agent
4. Assign monitors to the agent

### Agent Security

- Agents authenticate using a shared secret
- Agents must be approved in the server UI before reporting results
- Each agent has a unique UUID for identification

## API Endpoints

### Monitors
- `GET /api/monitors` - List all monitors
- `POST /api/monitors` - Create monitor
- `GET /api/monitors/{id}` - Get monitor details
- `PUT /api/monitors/{id}` - Update monitor
- `DELETE /api/monitors/{id}` - Delete monitor
- `POST /api/monitors/{id}/test` - Test monitor
- `GET /api/monitors/{id}/history` - Status history

### Agents
- `GET /api/agents` - List agents
- `PUT /api/agents/{id}/approve` - Approve/reject agent
- `DELETE /api/agents/{id}` - Delete agent

### Settings
- `GET /api/settings` - Get settings
- `PUT /api/settings` - Update settings

### Status
- `GET /api/status/overview` - Dashboard summary

## Development

### Backend only

```bash
cd backend
pip install -r requirements.txt
python -m uvicorn app.main:app --reload
```

### Frontend only

```bash
cd frontend
npm install
npm run dev
```

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                  OnlineTracker Server               │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐ │
│  │  FastAPI    │  │  Scheduler  │  │   React     │ │
│  │  Backend    │  │  Service    │  │   Frontend  │ │
│  └──────┬──────┘  └──────┬──────┘  └─────────────┘ │
│         │                │                          │
│         └────────┬───────┘                          │
│                  ▼                                  │
│           ┌──────────────┐                          │
│           │   SQLite DB  │                          │
│           └──────────────┘                          │
└─────────────────────────────────────────────────────┘
           ▲                    ▲
           │ Port 19443         │
    ┌──────┴──────┐      ┌──────┴──────┐
    │   Agent 1   │      │   Agent 2   │
    │  (Remote)   │      │  (Remote)   │
    └─────────────┘      └─────────────┘
```

## License

MIT
