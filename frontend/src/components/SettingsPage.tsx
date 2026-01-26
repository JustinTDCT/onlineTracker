import { useEffect, useState } from 'react';
import { Save, X } from 'lucide-react';
import { getSettings, updateSettings } from '../api/client';
import type { Settings } from '../types';

export default function SettingsPage() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Form state
  const [agentTimeout, setAgentTimeout] = useState(5);
  const [checkInterval, setCheckInterval] = useState(60);
  const [sslWarnDays, setSslWarnDays] = useState('30,14,7');
  const [webhookUrl, setWebhookUrl] = useState('');

  useEffect(() => {
    loadSettings();
  }, []);

  async function loadSettings() {
    try {
      const data = await getSettings();
      setSettings(data);
      setAgentTimeout(data.agent_timeout_minutes);
      setCheckInterval(data.check_interval_seconds);
      setSslWarnDays(data.ssl_warn_days);
      setWebhookUrl(data.webhook_url || '');
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load settings');
    } finally {
      setLoading(false);
    }
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
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Settings</h1>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700 mb-6 flex items-center justify-between">
          {error}
          <button onClick={() => setError(null)}>
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {success && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-green-700 mb-6">
          Settings saved successfully!
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 space-y-6">
          <h2 className="text-lg font-semibold text-gray-900">Monitoring</h2>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Default Check Interval (seconds)
            </label>
            <input
              type="number"
              value={checkInterval}
              onChange={(e) => setCheckInterval(parseInt(e.target.value, 10))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2"
              min={10}
              max={3600}
            />
            <p className="mt-1 text-sm text-gray-500">
              Default interval for new monitors (10-3600 seconds)
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              SSL Warning Thresholds (days)
            </label>
            <input
              type="text"
              value={sslWarnDays}
              onChange={(e) => setSslWarnDays(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2"
              placeholder="30,14,7"
            />
            <p className="mt-1 text-sm text-gray-500">
              Comma-separated days before expiry to trigger warnings
            </p>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 space-y-6">
          <h2 className="text-lg font-semibold text-gray-900">Agents</h2>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Agent Timeout (minutes)
            </label>
            <input
              type="number"
              value={agentTimeout}
              onChange={(e) => setAgentTimeout(parseInt(e.target.value, 10))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2"
              min={1}
              max={60}
            />
            <p className="mt-1 text-sm text-gray-500">
              Consider agent offline after this many minutes without reporting
            </p>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 space-y-6">
          <h2 className="text-lg font-semibold text-gray-900">Alerts</h2>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Webhook URL
            </label>
            <input
              type="url"
              value={webhookUrl}
              onChange={(e) => setWebhookUrl(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2"
              placeholder="https://hooks.slack.com/services/..."
            />
            <p className="mt-1 text-sm text-gray-500">
              Receive alerts via webhook (Slack, Discord, etc.)
            </p>
          </div>

          <div className="bg-gray-50 rounded-lg p-4">
            <h3 className="text-sm font-medium text-gray-700 mb-2">Webhook Payload Example</h3>
            <pre className="text-xs text-gray-600 overflow-x-auto">
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
