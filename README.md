# OnlineTracker

A Docker-based service monitoring system with support for distributed agents.

## Features

- **Multiple check types**: Ping, HTTP/HTTPS, SSL certificate monitoring
- **72-hour status history** with visual graphs (like status.cursor.com)
- **Monitor detail page**: Click any monitor to view detailed status, uptime histograms (24h/week/month/year), and paginated check results
- **Webhook alerts** for status changes and SSL expiry warnings
- **Agent mode** for distributed monitoring from multiple locations
- **SQLite database** - no external dependencies

## Quick Start

### Using Docker Compose

```bash
# Build and start the server
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
  -v agent-data:/data \
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
