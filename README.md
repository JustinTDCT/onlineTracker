# OnlineTracker

**Version 2.1.1**

A Docker-based service monitoring system with support for distributed agents.

## Features

- **Multiple check types**: Ping, HTTP/HTTPS, SSL certificate monitoring
- **Configurable thresholds**: Per-monitor OK/Degraded/Down thresholds with system defaults
- **72-hour status history** with visual graphs (like status.cursor.com)
- **Monitor detail page**: Click any monitor to view detailed status, uptime histograms (24h/week/month/year), and paginated check results
- **Webhook and email alerts** for status changes and SSL expiry warnings
- **Agent mode** for distributed monitoring from multiple locations
- **PostgreSQL database**: Scalable, concurrent writes, production-ready
- **Scalable scheduling**: Distributed check timing with up to 10 concurrent checks, supports 100+ monitors

## Quick Start

### Using Docker Compose

```bash
# Build and start the server (includes PostgreSQL)
docker compose up -d

# View logs
docker compose logs -f
```

Access the web UI at `http://localhost:8000`

#### Custom Ports

If port 8000 is already in use, you can configure host ports:

```bash
# Option 1: Environment variable
HOST_WEB_PORT=9000 docker compose up -d

# Option 2: Create a .env file
echo "HOST_WEB_PORT=9000" > .env
docker compose up -d
```

Available port variables:
- `HOST_WEB_PORT` - Web UI port (default: 8000)
- `HOST_COMS_PORT` - Agent communication port (default: 19443)

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `MODE` | `server` | Run mode: `server` or `agent` |
| `WEB_PORT` | `8000` | Web UI + Admin API port (server mode) |
| `COMS_PORT` | `19443` | Agent-only API port (server mode) / Server port to connect to (agent mode) |
| `DATABASE_URL` | (see below) | PostgreSQL connection string |
| `SERVER_HOST` | - | Agent mode: server hostname |
| `SHARED_SECRET` | - | Agent mode: authentication secret |

### Database URL

Default: `postgresql+asyncpg://onlinetracker:onlinetracker@postgres:5432/onlinetracker`

For external PostgreSQL:
```bash
DATABASE_URL=postgresql+asyncpg://user:pass@host:5432/dbname docker compose up -d
```

## Port Architecture

The server runs **two separate services**:

| Port | Service | Endpoints | Security |
|------|---------|-----------|----------|
| 8000 (WEB_PORT) | Web UI + Admin API | Full UI, all `/api/*` endpoints | Keep internal/protected |
| 19443 (COMS_PORT) | Agent API only | `/api/agents/register`, `/api/agents/report`, `/api/agents/{id}/monitors` | Safe to expose publicly |

This allows you to expose only the agent port (19443) to the internet for remote agents, while keeping the admin UI on an internal network.

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
5. Optionally expand "Threshold Settings" to customize OK/Degraded/Down thresholds
6. Click "Test" to verify, then "Save"

### Threshold Configuration

Each monitor type has configurable thresholds that determine status:

| Type | OK | Degraded | Down |
|------|-----|----------|------|
| **Ping** | Latency ≤ OK threshold | Latency ≤ Degraded threshold | Latency > Degraded threshold or <50% success |
| **HTTP/HTTPS** | Latency ≤ OK threshold | Latency ≤ Degraded threshold | Latency > Degraded threshold or HTTP error |
| **SSL** | Days ≥ OK threshold | Days ≥ Warning threshold | Days < Warning threshold or expired |

**Default thresholds** (configurable in Settings > Monitoring):
- Ping/HTTP: OK ≤ 80ms, Degraded ≤ 200ms
- SSL: OK ≥ 30 days, Warning ≥ 14 days

**Ping count**: Number of pings per check (1-10, default 5). More pings = more accurate average but longer check time.

Individual monitors can override these defaults in the "Threshold Settings" section of the monitor form.

### Alert Configuration

Go to Settings > Alerts to configure notifications. OnlineTracker supports:

#### Alert Behavior
- **Alert Type**: Control when alerts are sent
  - **Once** (default): Alert only when status changes (down → up or up → down)
  - **Repeated**: Continue sending alerts at intervals while service is down
  - **None**: Disable all alerts
- **Repeat Frequency**: When using "Repeated", how often to resend (1-1440 minutes)
- **Alert on Restored**: Send an alert when a service comes back up
- **Include History**: Include status history in email alerts
  - **Event only**: Just the current event details
  - **Last 24 hours**: Include recent check history

#### Webhook Alerts

Configure a webhook URL to receive JSON alerts (Slack, Discord, etc.):

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

#### Email Alerts

Configure SMTP settings to receive email notifications:

- **SMTP Host/Port**: Your mail server (e.g., smtp.gmail.com:587)
- **SMTP Username/Password**: Authentication credentials
- **Use TLS**: Enable STARTTLS (recommended)
- **From Address**: Sender address (defaults to SMTP username)
- **Alert Email**: Recipient address for alerts

Email subject format: `DOWN - <monitor> - <agent> - <type>`

## Agent Mode

Agents run on remote servers and report results back to the central server.

### Setting up an Agent

**Step 1: Configure the server**
1. Open the web UI at `http://localhost:8000`
2. Go to Settings > Agents
3. Set a **Shared Secret** (agents must know this to connect)
4. Save settings

**Step 2: Deploy the agent**

```bash
docker run -d \
  --name onlinetracker-agent \
  -e MODE=agent \
  -e SERVER_HOST=your-server-hostname \
  -e COMS_PORT=19443 \
  -e SHARED_SECRET=your-secret-key \
  onlinetracker
```

**Step 3: Authorize the agent**

The agent will attempt to connect and appear in the "Pending Connection Requests" list:

1. In the server UI, go to Settings > Agents
2. Expand **Pending Connection Requests** 
3. Click **Approve** next to the agent's UUID

The UUID will be added to the allowed list and the agent will register on its next attempt.

Alternatively, manually add the UUID:
1. Check the agent container logs: `docker logs onlinetracker-agent`
2. Copy the UUID from the banner
3. Add it to the **Allowed Agent UUIDs** list and save

**Step 4: Assign monitors**
1. Create or edit a monitor
2. Assign it to the agent
3. The agent will start running checks within 30 seconds

### Agent Security

OnlineTracker uses **two-layer authentication** for agents:

1. **Allowed UUIDs**: Pre-authorize which agent UUIDs can register
2. **Shared Secret**: Agents must know the correct password

Both checks must pass for an agent to register. This prevents:
- Unknown agents from connecting (UUID check)
- Spoofed UUIDs without the secret (password check)

## API Endpoints

### Monitors
- `GET /api/monitors` - List all monitors
- `GET /api/monitors/defaults` - Get default threshold values for new monitors
- `POST /api/monitors` - Create monitor
- `GET /api/monitors/{id}` - Get monitor details
- `PUT /api/monitors/{id}` - Update monitor
- `DELETE /api/monitors/{id}` - Delete monitor
- `POST /api/monitors/{id}/test` - Test monitor
- `GET /api/monitors/{id}/history` - Status history (aggregated 15-min buckets)
- `GET /api/monitors/{id}/results` - Paginated individual check results

### Agents
- `GET /api/agents` - List agents
- `PUT /api/agents/{id}/approve` - Approve/reject agent
- `DELETE /api/agents/{id}` - Delete agent
- `GET /api/agents/pending` - List pending connection requests
- `POST /api/agents/pending/{uuid}/approve` - Approve pending agent
- `DELETE /api/agents/pending/{uuid}` - Dismiss pending agent

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
# Requires PostgreSQL running locally or via Docker
DATABASE_URL=postgresql+asyncpg://user:pass@localhost:5432/onlinetracker \
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
┌─────────────────────────────────────────────────────────────┐
│                  OnlineTracker Server                       │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐         │
│  │  FastAPI    │  │  Scheduler  │  │   React     │         │
│  │  Backend    │  │ (Distributed│  │   Frontend  │         │
│  │             │  │  Parallel)  │  │             │         │
│  └──────┬──────┘  └──────┬──────┘  └─────────────┘         │
│         │                │                                  │
│         └────────┬───────┘                                  │
│                  ▼                                          │
│         ┌────────────────┐                                  │
│         │   PostgreSQL   │                                  │
│         └────────────────┘                                  │
└─────────────────────────────────────────────────────────────┘
           ▲                    ▲
           │ Port 19443         │
    ┌──────┴──────┐      ┌──────┴──────┐
    │   Agent 1   │      │   Agent 2   │
    │  (Remote)   │      │  (Remote)   │
    └─────────────┘      └─────────────┘
```

### Scalability

The scheduler uses **distributed check timing** to handle 100+ monitors efficiently:

- **Per-monitor offsets**: Each monitor gets a unique time slot based on its ID
- **No burst traffic**: Checks are spread evenly across their interval window
- **Concurrent execution**: Up to 10 simultaneous checks (configurable)
- **5-second tick**: Fine-grained scheduling for precise timing

**Capacity formula**: `(interval_seconds × max_concurrent) ÷ avg_check_duration`

Example: `(60s × 10) ÷ 5s = ~120 monitors` on 60-second intervals

## License

MIT
