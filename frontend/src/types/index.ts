// Monitor types
export interface MonitorConfig {
  expected_status?: number;
  expected_body_hash?: string;
  expected_content?: string;
  timeout_seconds?: number;
  
  // Ping/HTTP/HTTPS settings
  ping_count?: number;  // Number of pings to send (1-10)
  
  // PING thresholds (latency in ms)
  ping_ok_threshold_ms?: number;
  ping_degraded_threshold_ms?: number;
  
  // HTTP/HTTPS thresholds (latency in ms)
  http_ok_threshold_ms?: number;
  http_degraded_threshold_ms?: number;
  
  // SSL thresholds (days until expiry)
  ssl_ok_threshold_days?: number;
  ssl_warning_threshold_days?: number;
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
  
  // Default thresholds for PING monitors
  default_ping_count: number;
  default_ping_ok_threshold_ms: number;
  default_ping_degraded_threshold_ms: number;
  
  // Default thresholds for HTTP/HTTPS monitors
  default_http_ok_threshold_ms: number;
  default_http_degraded_threshold_ms: number;
  
  // Default thresholds for SSL monitors
  default_ssl_ok_threshold_days: number;
  default_ssl_warning_threshold_days: number;
  
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
  
  // Push notifications (iOS APNs)
  push_alerts_enabled: boolean;
  apns_key_id?: string;
  apns_team_id?: string;
  apns_bundle_id?: string;
  apns_use_sandbox: boolean;
}

// Monitor defaults from system settings
export interface MonitorDefaults {
  check_interval: number;
  ping_count: number;
  ping_ok_threshold_ms: number;
  ping_degraded_threshold_ms: number;
  http_ok_threshold_ms: number;
  http_degraded_threshold_ms: number;
  ssl_ok_threshold_days: number;
  ssl_warning_threshold_days: number;
}

// Export/Import types
export interface ExportMonitor {
  type: string;
  name: string;
  description?: string;
  target: string;
  config?: MonitorConfig;
  check_interval: number;
  enabled: boolean;
}

export interface ExportAgent {
  id: string;
  name?: string;
  status: string;
}

export interface ExportData {
  version: string;
  exported_at: string;
  settings: Record<string, string>;
  monitors: ExportMonitor[];
  agents: ExportAgent[];
}

export interface ImportData {
  version?: string;
  settings?: Record<string, string>;
  monitors?: ExportMonitor[];
  agents?: ExportAgent[];
}

export interface ImportResult {
  success: boolean;
  message: string;
  settings_imported: number;
  monitors_imported: number;
  agents_imported: number;
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
