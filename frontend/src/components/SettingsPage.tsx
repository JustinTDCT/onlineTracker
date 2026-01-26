import { useEffect, useState } from 'react';
import { Save, X, Eye, EyeOff, UserPlus, UserX, Clock, RefreshCw } from 'lucide-react';
import { getSettings, updateSettings, getPendingAgents, approvePendingAgent, dismissPendingAgent } from '../api/client';
import type { PendingAgent } from '../types';

export default function SettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Form state
  const [agentTimeout, setAgentTimeout] = useState(5);
  const [checkInterval, setCheckInterval] = useState(60);
  const [sslWarnDays, setSslWarnDays] = useState('30,14,7');
  const [webhookUrl, setWebhookUrl] = useState('');
  const [sharedSecret, setSharedSecret] = useState('');
  const [allowedAgentUuids, setAllowedAgentUuids] = useState('');
  const [showSecret, setShowSecret] = useState(false);
  
  // Pending agents state
  const [pendingAgents, setPendingAgents] = useState<PendingAgent[]>([]);
  const [loadingPending, setLoadingPending] = useState(false);
  const [showPendingAgents, setShowPendingAgents] = useState(false);

  useEffect(() => {
    loadSettings();
    loadPendingAgents();
  }, []);

  async function loadSettings() {
    try {
      const data = await getSettings();
      setAgentTimeout(data.agent_timeout_minutes);
      setCheckInterval(data.check_interval_seconds);
      setSslWarnDays(data.ssl_warn_days);
      setWebhookUrl(data.webhook_url || '');
      setSharedSecret(data.shared_secret || '');
      setAllowedAgentUuids(data.allowed_agent_uuids || '');
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
      // Reload both pending agents and settings (allowed UUIDs changed)
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
      await updateSettings({
        agent_timeout_minutes: agentTimeout,
        check_interval_seconds: checkInterval,
        ssl_warn_days: sslWarnDays,
        webhook_url: webhookUrl || undefined,
        shared_secret: sharedSecret || undefined,
        allowed_agent_uuids: allowedAgentUuids || undefined,
      });
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

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6 space-y-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Monitoring</h2>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Default Check Interval (seconds)
            </label>
            <input
              type="number"
              value={checkInterval}
              onChange={(e) => setCheckInterval(parseInt(e.target.value, 10))}
              className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-lg px-3 py-2"
              min={10}
              max={3600}
            />
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Default interval for new monitors (10-3600 seconds)
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              SSL Warning Thresholds (days)
            </label>
            <input
              type="text"
              value={sslWarnDays}
              onChange={(e) => setSslWarnDays(e.target.value)}
              className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-lg px-3 py-2"
              placeholder="30,14,7"
            />
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Comma-separated days before expiry to trigger warnings
            </p>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6 space-y-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Agents</h2>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Agent Timeout (minutes)
            </label>
            <input
              type="number"
              value={agentTimeout}
              onChange={(e) => setAgentTimeout(parseInt(e.target.value, 10))}
              className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-lg px-3 py-2"
              min={1}
              max={60}
            />
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Consider agent offline after this many minutes without reporting
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Shared Secret
            </label>
            <div className="relative">
              <input
                type={showSecret ? 'text' : 'password'}
                value={sharedSecret}
                onChange={(e) => setSharedSecret(e.target.value)}
                className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-lg px-3 py-2 pr-10"
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
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Agents must know this secret to register. Set SHARED_SECRET env var on agents.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Allowed Agent UUIDs
            </label>
            <textarea
              value={allowedAgentUuids}
              onChange={(e) => setAllowedAgentUuids(e.target.value)}
              className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-lg px-3 py-2"
              rows={3}
              placeholder="uuid-1, uuid-2, uuid-3"
            />
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Comma-separated list of agent UUIDs allowed to register. Find the UUID in agent logs on first startup.
            </p>
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

        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6 space-y-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Alerts</h2>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Webhook URL
            </label>
            <input
              type="url"
              value={webhookUrl}
              onChange={(e) => setWebhookUrl(e.target.value)}
              className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-lg px-3 py-2"
              placeholder="https://hooks.slack.com/services/..."
            />
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Receive alerts via webhook (Slack, Discord, etc.)
            </p>
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
