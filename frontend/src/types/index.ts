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
  ssl_expiry_days?: number;
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
  agent_id?: string;  // Assign to agent, or undefined/empty for server-side monitoring
}

export interface StatusHistoryPoint {
  timestamp: string;
  status: 'up' | 'down' | 'degraded' | 'unknown';
  uptime_percent: number;
  response_time_avg_ms?: number;
}

export interface MonitorResult {
  id: number;
  checked_at: string;
  status: 'up' | 'down' | 'degraded' | 'unknown';
  response_time_ms?: number;
  details?: string;
  ssl_expiry_days?: number;
}

export interface ResultsPage {
  items: MonitorResult[];
  total: number;
  page: number;
  per_page: number;
  total_pages: number;
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

export interface PendingAgent {
  uuid: string;
  name?: string;
  first_attempt: string;
  last_attempt: string;
  attempt_count: number;
}

// Settings types
export interface Settings {
  // Monitoring
  check_interval_seconds: number;
  ssl_warn_days: string;
  
  // Agents
  agent_timeout_minutes: number;
  shared_secret?: string;
  allowed_agent_uuids?: string;
  
  // Alerts
  alert_type: 'once' | 'repeated' | 'none';
  alert_repeat_frequency_minutes: number;
  alert_on_restored: boolean;
  alert_include_history: 'event_only' | 'last_24h';
  
  // Webhook
  webhook_url?: string;
  
  // Email
  email_alerts_enabled: boolean;
  smtp_host?: string;
  smtp_port: number;
  smtp_username?: string;
  smtp_password?: string;
  smtp_use_tls: boolean;
  alert_email_from?: string;
  alert_email_to?: string;
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
