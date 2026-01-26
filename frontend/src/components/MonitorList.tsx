import { useEffect, useState } from 'react';
import {
  Plus,
  Pencil,
  Trash2,
  Play,
  CheckCircle,
  AlertCircle,
  HelpCircle,
  X,
} from 'lucide-react';
import {
  getMonitors,
  createMonitor,
  updateMonitor,
  deleteMonitor,
  testMonitor,
} from '../api/client';
import type { Monitor, MonitorCreate, MonitorTestResult } from '../types';

export default function MonitorList() {
  const [monitors, setMonitors] = useState<Monitor[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingMonitor, setEditingMonitor] = useState<Monitor | null>(null);
  const [testResult, setTestResult] = useState<{ id: number; result: MonitorTestResult } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadMonitors();
  }, []);

  async function loadMonitors() {
    try {
      const data = await getMonitors();
      setMonitors(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load monitors');
    } finally {
      setLoading(false);
    }
  }

  async function handleTest(monitor: Monitor) {
    try {
      const result = await testMonitor(monitor.id);
      setTestResult({ id: monitor.id, result });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Test failed');
    }
  }

  async function handleDelete(monitor: Monitor) {
    if (!confirm(`Delete monitor "${monitor.name}"?`)) return;
    
    try {
      await deleteMonitor(monitor.id);
      await loadMonitors();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
    }
  }

  const statusIcon = (status?: string) => {
    switch (status) {
      case 'up':
        return <CheckCircle className="h-5 w-5 text-green-500" />;
      case 'down':
        return <AlertCircle className="h-5 w-5 text-red-500" />;
      case 'degraded':
        return <AlertCircle className="h-5 w-5 text-yellow-500" />;
      default:
        return <HelpCircle className="h-5 w-5 text-gray-400" />;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Monitors</h1>
        <button
          onClick={() => {
            setEditingMonitor(null);
            setShowForm(true);
          }}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
        >
          <Plus className="h-4 w-4" />
          Add Monitor
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700 flex items-center justify-between">
          {error}
          <button onClick={() => setError(null)}>
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {showForm && (
        <MonitorForm
          monitor={editingMonitor}
          onClose={() => {
            setShowForm(false);
            setEditingMonitor(null);
          }}
          onSave={async (data) => {
            try {
              if (editingMonitor) {
                await updateMonitor(editingMonitor.id, data);
              } else {
                await createMonitor(data);
              }
              await loadMonitors();
              setShowForm(false);
              setEditingMonitor(null);
            } catch (err) {
              setError(err instanceof Error ? err.message : 'Save failed');
            }
          }}
        />
      )}

      {/* Monitor table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Target</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Interval</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Response</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {monitors.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-6 py-12 text-center text-gray-500">
                  No monitors configured. Click "Add Monitor" to create one.
                </td>
              </tr>
            ) : (
              monitors.map((monitor) => (
                <tr key={monitor.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    {statusIcon(monitor.latest_status?.status)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="font-medium text-gray-900">{monitor.name}</div>
                    {!monitor.enabled && (
                      <span className="text-xs text-gray-500">Disabled</span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="px-2 py-1 text-xs font-medium bg-gray-100 text-gray-700 rounded">
                      {monitor.type.toUpperCase()}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600 max-w-xs truncate">
                    {monitor.target}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                    {monitor.check_interval}s
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                    {monitor.latest_status?.response_time_ms
                      ? `${monitor.latest_status.response_time_ms}ms`
                      : '-'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => handleTest(monitor)}
                        className="p-2 text-gray-400 hover:text-indigo-600 transition-colors"
                        title="Test"
                      >
                        <Play className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => {
                          setEditingMonitor(monitor);
                          setShowForm(true);
                        }}
                        className="p-2 text-gray-400 hover:text-indigo-600 transition-colors"
                        title="Edit"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(monitor)}
                        className="p-2 text-gray-400 hover:text-red-600 transition-colors"
                        title="Delete"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Test result modal */}
      {testResult && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl p-6 max-w-md w-full mx-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Test Result</h3>
              <button onClick={() => setTestResult(null)}>
                <X className="h-5 w-5 text-gray-400" />
              </button>
            </div>
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                {statusIcon(testResult.result.status)}
                <span className="font-medium capitalize">{testResult.result.status}</span>
              </div>
              {testResult.result.response_time_ms && (
                <p className="text-sm text-gray-600">
                  Response time: {testResult.result.response_time_ms}ms
                </p>
              )}
              {testResult.result.details && (
                <p className="text-sm text-gray-600">Details: {testResult.result.details}</p>
              )}
              {testResult.result.captured_hash && (
                <p className="text-sm text-gray-600 font-mono text-xs">
                  Body hash: {testResult.result.captured_hash}
                </p>
              )}
              {testResult.result.ssl_expiry_days !== undefined && (
                <p className="text-sm text-gray-600">
                  SSL expires in: {testResult.result.ssl_expiry_days} days
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Monitor form component
interface FormProps {
  monitor: Monitor | null;
  onClose: () => void;
  onSave: (data: MonitorCreate) => Promise<void>;
}

function MonitorForm({ monitor, onClose, onSave }: FormProps) {
  const [type, setType] = useState<'ping' | 'http' | 'https' | 'ssl'>(
    monitor?.type || 'http'
  );
  const [name, setName] = useState(monitor?.name || '');
  const [target, setTarget] = useState(monitor?.target || '');
  const [interval, setInterval] = useState(monitor?.check_interval || 60);
  const [enabled, setEnabled] = useState(monitor?.enabled ?? true);
  const [expectedStatus, setExpectedStatus] = useState(
    monitor?.config?.expected_status?.toString() || ''
  );
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    
    const config: Record<string, unknown> = {};
    if (expectedStatus) {
      config.expected_status = parseInt(expectedStatus, 10);
    }

    await onSave({
      type,
      name,
      target,
      check_interval: interval,
      enabled,
      config: Object.keys(config).length > 0 ? config : undefined,
    });
    
    setSaving(false);
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-xl p-6 max-w-lg w-full mx-4">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-semibold">
            {monitor ? 'Edit Monitor' : 'Add Monitor'}
          </h3>
          <button onClick={onClose}>
            <X className="h-5 w-5 text-gray-400" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as typeof type)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2"
              disabled={!!monitor}
            >
              <option value="ping">Ping</option>
              <option value="http">HTTP</option>
              <option value="https">HTTPS</option>
              <option value="ssl">SSL Certificate</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2"
              placeholder="My Website"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Target</label>
            <input
              type="text"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2"
              placeholder={type === 'ping' ? 'example.com' : 'https://example.com'}
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Check Interval (seconds)
            </label>
            <input
              type="number"
              value={interval}
              onChange={(e) => setInterval(parseInt(e.target.value, 10))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2"
              min={10}
              max={3600}
            />
          </div>

          {(type === 'http' || type === 'https') && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Expected Status Code (optional)
              </label>
              <input
                type="number"
                value={expectedStatus}
                onChange={(e) => setExpectedStatus(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2"
                placeholder="200"
              />
            </div>
          )}

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="enabled"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
              className="rounded border-gray-300"
            />
            <label htmlFor="enabled" className="text-sm text-gray-700">
              Enabled
            </label>
          </div>

          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
