// Monitor types
export interface MonitorConfig {
  expected_status?: number;
  expected_body_hash?: string;
  expected_content?: string;
  timeout_seconds?: number;
}

export interface LatestStatus {
  status: 'up' | 'down' | 'degraded' | 'unknown';
  response_time_ms?: number;
  checked_at: string;
  details?: string;
}

export interface Monitor {
  id: number;
  agent_id?: string;
  type: 'ping' | 'http' | 'https' | 'ssl';
  name: string;
  description?: string;
  target: string;
  config?: MonitorConfig;
  check_interval: number;
  enabled: boolean;
  created_at: string;
  latest_status?: LatestStatus;
}

export interface MonitorCreate {
  type: 'ping' | 'http' | 'https' | 'ssl';
  name: string;
  description?: string;
  target: string;
  config?: MonitorConfig;
  check_interval?: number;
  enabled?: boolean;
}

export interface StatusHistoryPoint {
  timestamp: string;
  status: 'up' | 'down' | 'degraded' | 'unknown';
  uptime_percent: number;
  response_time_avg_ms?: number;
}

export interface MonitorTestResult {
  status: string;
  response_time_ms?: number;
  details?: string;
  captured_hash?: string;
  ssl_expiry_days?: number;
}

export interface PollPageResult {
  status_code: number;
  content: string;
  content_type?: string;
  response_time_ms: number;
  suggested_content?: string;
}

// Agent types
export interface Agent {
  id: string;
  name?: string;
  status: 'pending' | 'approved' | 'rejected';
  last_seen?: string;
  created_at: string;
  monitor_count: number;
}

// Settings types
export interface Settings {
  agent_timeout_minutes: number;
  check_interval_seconds: number;
  ssl_warn_days: string;
  webhook_url?: string;
}

// Status overview
export interface MonitorSummary {
  id: number;
  name: string;
  type: string;
  status: string;
  uptime_24h: number;
  last_check?: string;
}

export interface StatusOverview {
  total_monitors: number;
  monitors_up: number;
  monitors_down: number;
  monitors_degraded: number;
  monitors_unknown: number;
  agents_total: number;
  agents_pending: number;
  overall_uptime_24h: number;
  monitors: MonitorSummary[];
}
