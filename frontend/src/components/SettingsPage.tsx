import { useEffect, useState } from 'react';
import { Save, X, Eye, EyeOff, UserPlus, UserX, Clock, RefreshCw, Activity, Users, Bell } from 'lucide-react';
import { getSettings, updateSettings, getPendingAgents, approvePendingAgent, dismissPendingAgent } from '../api/client';
import type { PendingAgent, Settings } from '../types';

type SettingsTab = 'monitoring' | 'agents' | 'alerts';

export default function SettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [activeTab, setActiveTab] = useState<SettingsTab>('monitoring');

  // Form state - Monitoring
  const [checkInterval, setCheckInterval] = useState(60);
  const [sslWarnDays, setSslWarnDays] = useState('30,14,7');

  // Form state - Agents
  const [agentTimeout, setAgentTimeout] = useState(5);
  const [sharedSecret, setSharedSecret] = useState('');
  const [allowedAgentUuids, setAllowedAgentUuids] = useState('');
  const [showSecret, setShowSecret] = useState(false);
  
  // Pending agents state
  const [pendingAgents, setPendingAgents] = useState<PendingAgent[]>([]);
  const [loadingPending, setLoadingPending] = useState(false);
  const [showPendingAgents, setShowPendingAgents] = useState(false);

  // Form state - Alerts
  const [alertType, setAlertType] = useState<'once' | 'repeated' | 'none'>('once');
  const [alertRepeatFrequency, setAlertRepeatFrequency] = useState(15);
  const [alertOnRestored, setAlertOnRestored] = useState(true);
  const [alertIncludeHistory, setAlertIncludeHistory] = useState<'event_only' | 'last_24h'>('event_only');
  const [webhookUrl, setWebhookUrl] = useState('');
  
  // Email settings
  const [emailAlertsEnabled, setEmailAlertsEnabled] = useState(false);
  const [smtpHost, setSmtpHost] = useState('');
  const [smtpPort, setSmtpPort] = useState(587);
  const [smtpUsername, setSmtpUsername] = useState('');
  const [smtpPassword, setSmtpPassword] = useState('');
  const [smtpUseTls, setSmtpUseTls] = useState(true);
  const [alertEmailFrom, setAlertEmailFrom] = useState('');
  const [alertEmailTo, setAlertEmailTo] = useState('');
  const [showSmtpPassword, setShowSmtpPassword] = useState(false);

  useEffect(() => {
    loadSettings();
    loadPendingAgents();
  }, []);

  async function loadSettings() {
    try {
      const data = await getSettings();
      // Monitoring
      setCheckInterval(data.check_interval_seconds);
      setSslWarnDays(data.ssl_warn_days);
      // Agents
      setAgentTimeout(data.agent_timeout_minutes);
      setSharedSecret(data.shared_secret || '');
      setAllowedAgentUuids(data.allowed_agent_uuids || '');
      // Alerts
      setAlertType(data.alert_type);
      setAlertRepeatFrequency(data.alert_repeat_frequency_minutes);
      setAlertOnRestored(data.alert_on_restored);
      setAlertIncludeHistory(data.alert_include_history);
      setWebhookUrl(data.webhook_url || '');
      // Email
      setEmailAlertsEnabled(data.email_alerts_enabled);
      setSmtpHost(data.smtp_host || '');
      setSmtpPort(data.smtp_port);
      setSmtpUsername(data.smtp_username || '');
      setSmtpPassword(data.smtp_password || '');
      setSmtpUseTls(data.smtp_use_tls);
      setAlertEmailFrom(data.alert_email_from || '');
      setAlertEmailTo(data.alert_email_to || '');
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load settings');
    } finally {
      setLoading(false);
    }
  }
  
  async function loadPendingAgents() {
    setLoadingPending(true);
    try {
      const data = await getPendingAgents();
      setPendingAgents(data);
    } catch (err) {
      console.error('Failed to load pending agents:', err);
    } finally {
      setLoadingPending(false);
    }
  }
  
  async function handleApprovePending(uuid: string) {
    try {
      await approvePendingAgent(uuid);
      await Promise.all([loadPendingAgents(), loadSettings()]);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to approve agent');
    }
  }
  
  async function handleDismissPending(uuid: string) {
    try {
      await dismissPendingAgent(uuid);
      await loadPendingAgents();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to dismiss agent');
    }
  }
  
  function formatTimeAgo(dateStr: string): string {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);
    
    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${diffDays}d ago`;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(false);

    try {
      const updateData: Partial<Settings> = {
        // Monitoring
        check_interval_seconds: checkInterval,
        ssl_warn_days: sslWarnDays,
        // Agents
        agent_timeout_minutes: agentTimeout,
        shared_secret: sharedSecret || undefined,
        allowed_agent_uuids: allowedAgentUuids || undefined,
        // Alerts
        alert_type: alertType,
        alert_repeat_frequency_minutes: alertRepeatFrequency,
        alert_on_restored: alertOnRestored,
        alert_include_history: alertIncludeHistory,
        webhook_url: webhookUrl || undefined,
        // Email
        email_alerts_enabled: emailAlertsEnabled,
        smtp_host: smtpHost || undefined,
        smtp_port: smtpPort,
        smtp_username: smtpUsername || undefined,
        smtp_password: smtpPassword || undefined,
        smtp_use_tls: smtpUseTls,
        alert_email_from: alertEmailFrom || undefined,
        alert_email_to: alertEmailTo || undefined,
      };
      
      await updateSettings(updateData);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  const tabs: { id: SettingsTab; label: string; icon: React.ReactNode }[] = [
    { id: 'monitoring', label: 'Monitoring', icon: <Activity className="h-4 w-4" /> },
    { id: 'agents', label: 'Agents', icon: <Users className="h-4 w-4" /> },
    { id: 'alerts', label: 'Alerts', icon: <Bell className="h-4 w-4" /> },
  ];

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">Settings</h1>

      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 text-red-700 dark:text-red-400 mb-6 flex items-center justify-between">
          {error}
          <button onClick={() => setError(null)}>
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {success && (
        <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4 text-green-700 dark:text-green-400 mb-6">
          Settings saved successfully!
        </div>
      )}

      {/* Tabs */}
      <div className="settings-tabs">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`settings-tab flex items-center gap-2 ${activeTab === tab.id ? 'settings-tab-active' : ''}`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Monitoring Tab */}
        {activeTab === 'monitoring' && (
          <div className="settings-card">
            <h2 className="settings-card-title">Monitoring Settings</h2>

            <div>
              <label className="settings-label">Default Check Interval (seconds)</label>
              <input
                type="number"
                value={checkInterval}
                onChange={(e) => setCheckInterval(parseInt(e.target.value, 10))}
                className="settings-input"
                min={10}
                max={3600}
              />
              <p className="settings-help">Default interval for new monitors (10-3600 seconds)</p>
            </div>

            <div>
              <label className="settings-label">SSL Warning Thresholds (days)</label>
              <input
                type="text"
                value={sslWarnDays}
                onChange={(e) => setSslWarnDays(e.target.value)}
                className="settings-input"
                placeholder="30,14,7"
              />
              <p className="settings-help">Comma-separated days before expiry to trigger warnings</p>
            </div>
          </div>
        )}

        {/* Agents Tab */}
        {activeTab === 'agents' && (
          <div className="settings-card">
            <h2 className="settings-card-title">Agent Settings</h2>

            <div>
              <label className="settings-label">Agent Timeout (minutes)</label>
              <input
                type="number"
                value={agentTimeout}
                onChange={(e) => setAgentTimeout(parseInt(e.target.value, 10))}
                className="settings-input"
                min={1}
                max={60}
              />
              <p className="settings-help">Consider agent offline after this many minutes without reporting</p>
            </div>

            <div>
              <label className="settings-label">Shared Secret</label>
              <div className="relative">
                <input
                  type={showSecret ? 'text' : 'password'}
                  value={sharedSecret}
                  onChange={(e) => setSharedSecret(e.target.value)}
                  className="settings-input pr-10"
                  placeholder="Enter a secure shared secret"
                />
                <button
                  type="button"
                  onClick={() => setShowSecret(!showSecret)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                >
                  {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <p className="settings-help">Agents must know this secret to register. Set SHARED_SECRET env var on agents.</p>
            </div>

            <div>
              <label className="settings-label">Allowed Agent UUIDs</label>
              <textarea
                value={allowedAgentUuids}
                onChange={(e) => setAllowedAgentUuids(e.target.value)}
                className="settings-textarea"
                rows={3}
                placeholder="uuid-1, uuid-2, uuid-3"
              />
              <p className="settings-help">Comma-separated list of agent UUIDs allowed to register.</p>
            </div>

            {/* Pending Agents Section */}
            <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
              <div className="flex items-center justify-between mb-3">
                <button
                  type="button"
                  onClick={() => setShowPendingAgents(!showPendingAgents)}
                  className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-indigo-600 dark:hover:text-indigo-400"
                >
                  <Clock className="h-4 w-4" />
                  Pending Connection Requests
                  {pendingAgents.length > 0 && (
                    <span className="bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 px-2 py-0.5 rounded-full text-xs font-medium">
                      {pendingAgents.length}
                    </span>
                  )}
                </button>
                <button
                  type="button"
                  onClick={loadPendingAgents}
                  disabled={loadingPending}
                  className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                  title="Refresh pending requests"
                >
                  <RefreshCw className={`h-4 w-4 ${loadingPending ? 'animate-spin' : ''}`} />
                </button>
              </div>
              
              {showPendingAgents && (
                <div className="space-y-2">
                  {pendingAgents.length === 0 ? (
                    <p className="text-sm text-gray-500 dark:text-gray-400 italic">
                      No pending requests. Agents with valid secrets but unknown UUIDs will appear here.
                    </p>
                  ) : (
                    pendingAgents.map((agent) => (
                      <div
                        key={agent.uuid}
                        className="flex items-center justify-between bg-gray-50 dark:bg-gray-900 rounded-lg p-3 border border-gray-200 dark:border-gray-700"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-sm text-gray-900 dark:text-white truncate">
                              {agent.uuid}
                            </span>
                            {agent.name && (
                              <span className="text-xs bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400 px-2 py-0.5 rounded">
                                {agent.name}
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                            {agent.attempt_count} attempt{agent.attempt_count !== 1 ? 's' : ''} · Last: {formatTimeAgo(agent.last_attempt)}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 ml-3">
                          <button
                            type="button"
                            onClick={() => handleApprovePending(agent.uuid)}
                            className="flex items-center gap-1 px-3 py-1.5 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700"
                            title="Approve and add to allowed list"
                          >
                            <UserPlus className="h-4 w-4" />
                            Approve
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDismissPending(agent.uuid)}
                            className="flex items-center gap-1 px-3 py-1.5 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 text-sm rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600"
                            title="Dismiss request"
                          >
                            <UserX className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>

            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
              <h3 className="text-sm font-medium text-blue-800 dark:text-blue-300 mb-2">Agent Setup Steps</h3>
              <ol className="text-sm text-blue-700 dark:text-blue-400 list-decimal list-inside space-y-1">
                <li>Set a shared secret above and save</li>
                <li>Start the agent container - it will log its UUID</li>
                <li>The agent will appear in "Pending Connection Requests" above</li>
                <li>Click Approve to allow the agent to register</li>
              </ol>
            </div>
          </div>
        )}

        {/* Alerts Tab */}
        {activeTab === 'alerts' && (
          <div className="space-y-6">
            {/* Alert Behavior */}
            <div className="settings-card">
              <h2 className="settings-card-title">Alert Behavior</h2>

              <div>
                <label className="settings-label">Alert Type</label>
                <select
                  value={alertType}
                  onChange={(e) => setAlertType(e.target.value as 'once' | 'repeated' | 'none')}
                  className="settings-select"
                >
                  <option value="once">Once - Alert only when status changes</option>
                  <option value="repeated">Repeated - Continue alerting while down</option>
                  <option value="none">None - Disable all alerts</option>
                </select>
              </div>

              {alertType === 'repeated' && (
                <div>
                  <label className="settings-label">Repeat Frequency (minutes)</label>
                  <input
                    type="number"
                    value={alertRepeatFrequency}
                    onChange={(e) => setAlertRepeatFrequency(parseInt(e.target.value, 10))}
                    className="settings-input"
                    min={1}
                    max={1440}
                  />
                  <p className="settings-help">How often to resend alerts while service is down</p>
                </div>
              )}

              <div className="settings-checkbox-wrapper">
                <input
                  type="checkbox"
                  id="alertOnRestored"
                  checked={alertOnRestored}
                  onChange={(e) => setAlertOnRestored(e.target.checked)}
                  className="settings-checkbox"
                />
                <label htmlFor="alertOnRestored" className="settings-checkbox-label">
                  Alert when service is restored
                </label>
              </div>

              <div>
                <label className="settings-label">Include History</label>
                <select
                  value={alertIncludeHistory}
                  onChange={(e) => setAlertIncludeHistory(e.target.value as 'event_only' | 'last_24h')}
                  className="settings-select"
                >
                  <option value="event_only">Event only - Just the current event details</option>
                  <option value="last_24h">Last 24 hours - Include recent status history</option>
                </select>
              </div>
            </div>

            {/* Webhook Settings */}
            <div className="settings-card">
              <h2 className="settings-card-title">Webhook</h2>

              <div>
                <label className="settings-label">Webhook URL</label>
                <input
                  type="url"
                  value={webhookUrl}
                  onChange={(e) => setWebhookUrl(e.target.value)}
                  className="settings-input"
                  placeholder="https://hooks.slack.com/services/..."
                />
                <p className="settings-help">Receive alerts via webhook (Slack, Discord, etc.)</p>
              </div>

              <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4">
                <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Webhook Payload Example</h3>
                <pre className="text-xs text-gray-600 dark:text-gray-400 overflow-x-auto">
{`{
  "monitor": "API Server",
  "type": "http",
  "target": "https://api.example.com",
  "event": "down",
  "details": "HTTP 503",
  "timestamp": "2026-01-26T10:30:00Z"
}`}
                </pre>
              </div>
            </div>

            {/* Email Settings */}
            <div className="settings-card">
              <h2 className="settings-card-title">Email Alerts</h2>

              <div className="settings-checkbox-wrapper">
                <input
                  type="checkbox"
                  id="emailAlertsEnabled"
                  checked={emailAlertsEnabled}
                  onChange={(e) => setEmailAlertsEnabled(e.target.checked)}
                  className="settings-checkbox"
                />
                <label htmlFor="emailAlertsEnabled" className="settings-checkbox-label">
                  Enable email alerts
                </label>
              </div>

              <div className={!emailAlertsEnabled ? 'settings-disabled' : ''}>
                <div className="space-y-4">
                  <div>
                    <label className="settings-label">Alert Email (To)</label>
                    <input
                      type="text"
                      value={alertEmailTo}
                      onChange={(e) => setAlertEmailTo(e.target.value)}
                      className="settings-input"
                      placeholder="alerts@company.com, ops@company.com"
                      disabled={!emailAlertsEnabled}
                    />
                    <p className="settings-help">Comma-separated list of email addresses</p>
                  </div>

                  <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
                    <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-4">SMTP Settings</h3>
                    
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="settings-label">SMTP Host</label>
                        <input
                          type="text"
                          value={smtpHost}
                          onChange={(e) => setSmtpHost(e.target.value)}
                          className="settings-input"
                          placeholder="smtp.gmail.com"
                          disabled={!emailAlertsEnabled}
                        />
                      </div>
                      <div>
                        <label className="settings-label">SMTP Port</label>
                        <input
                          type="number"
                          value={smtpPort}
                          onChange={(e) => setSmtpPort(parseInt(e.target.value, 10))}
                          className="settings-input"
                          min={1}
                          max={65535}
                          disabled={!emailAlertsEnabled}
                        />
                      </div>
                    </div>

                    <div className="mt-4">
                      <label className="settings-label">SMTP Username</label>
                      <input
                        type="text"
                        value={smtpUsername}
                        onChange={(e) => setSmtpUsername(e.target.value)}
                        className="settings-input"
                        placeholder="your-email@gmail.com"
                        disabled={!emailAlertsEnabled}
                      />
                    </div>

                    <div className="mt-4">
                      <label className="settings-label">SMTP Password</label>
                      <div className="relative">
                        <input
                          type={showSmtpPassword ? 'text' : 'password'}
                          value={smtpPassword}
                          onChange={(e) => setSmtpPassword(e.target.value)}
                          className="settings-input pr-10"
                          placeholder="App password or SMTP password"
                          disabled={!emailAlertsEnabled}
                        />
                        <button
                          type="button"
                          onClick={() => setShowSmtpPassword(!showSmtpPassword)}
                          className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                          disabled={!emailAlertsEnabled}
                        >
                          {showSmtpPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                    </div>

                    <div className="mt-4">
                      <label className="settings-label">From Address</label>
                      <input
                        type="email"
                        value={alertEmailFrom}
                        onChange={(e) => setAlertEmailFrom(e.target.value)}
                        className="settings-input"
                        placeholder="noreply@yourcompany.com"
                        disabled={!emailAlertsEnabled}
                      />
                      <p className="settings-help">Leave blank to use SMTP username</p>
                    </div>

                    <div className="mt-4 settings-checkbox-wrapper">
                      <input
                        type="checkbox"
                        id="smtpUseTls"
                        checked={smtpUseTls}
                        onChange={(e) => setSmtpUseTls(e.target.checked)}
                        className="settings-checkbox"
                        disabled={!emailAlertsEnabled}
                      />
                      <label htmlFor="smtpUseTls" className="settings-checkbox-label">
                        Use TLS/STARTTLS
                      </label>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={saving}
            className="flex items-center gap-2 px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
          >
            <Save className="h-4 w-4" />
            {saving ? 'Saving...' : 'Save Settings'}
          </button>
        </div>
      </form>
    </div>
  );
}
