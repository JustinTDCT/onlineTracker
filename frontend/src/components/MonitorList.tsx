import { useEffect, useState, useMemo } from 'react';
import {
  Plus,
  Pencil,
  Trash2,
  Play,
  CheckCircle,
  AlertCircle,
  HelpCircle,
  X,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import {
  getMonitors,
  createMonitor,
  updateMonitor,
  deleteMonitor,
  testMonitor,
  pollPage,
  getAgents,
} from '../api/client';
import type { Monitor, MonitorCreate, MonitorTestResult, Agent } from '../types';

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

export default function MonitorList() {
  const [monitors, setMonitors] = useState<Monitor[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingMonitor, setEditingMonitor] = useState<Monitor | null>(null);
  const [testResult, setTestResult] = useState<{ id: number; result: MonitorTestResult } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Pagination calculations
  const totalPages = useMemo(() => Math.ceil(monitors.length / pageSize), [monitors.length, pageSize]);
  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = startIndex + pageSize;
  const paginatedMonitors = useMemo(() => monitors.slice(startIndex, endIndex), [monitors, startIndex, endIndex]);

  // Reset to page 1 when page size changes
  useEffect(() => {
    setCurrentPage(1);
  }, [pageSize]);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      const [monitorsData, agentsData] = await Promise.all([
        getMonitors(),
        getAgents(),
      ]);
      setMonitors(monitorsData);
      // Only show approved agents
      setAgents(agentsData.filter(a => a.status === 'approved'));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      setLoading(false);
    }
  }

  async function loadMonitors() {
    try {
      const data = await getMonitors();
      setMonitors(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load monitors');
    }
  }

  function getAgentName(agentId?: string): string {
    if (!agentId) return 'Server';
    const agent = agents.find(a => a.id === agentId);
    return agent?.name || agentId.slice(0, 8) + '...';
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
      case 'up': return <CheckCircle className="h-5 w-5 text-green-500" />;
      case 'down': return <AlertCircle className="h-5 w-5 text-red-500" />;
      case 'degraded': return <AlertCircle className="h-5 w-5 text-yellow-500" />;
      default: return <HelpCircle className="h-5 w-5 text-gray-400" />;
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
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Monitors</h1>
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
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 text-red-700 dark:text-red-400 flex items-center justify-between">
          {error}
          <button onClick={() => setError(null)}>
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {showForm && (
        <MonitorForm
          monitor={editingMonitor}
          agents={agents}
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
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
          <thead className="bg-gray-50 dark:bg-gray-900">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Status</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Name</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Type</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Target</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Agent</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Interval</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Response</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
            {monitors.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-6 py-12 text-center text-gray-500 dark:text-gray-400">
                  No monitors configured. Click "Add Monitor" to create one.
                </td>
              </tr>
            ) : (
              paginatedMonitors.map((monitor) => (
                <tr key={monitor.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    {statusIcon(monitor.latest_status?.status)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="font-medium text-gray-900 dark:text-white">{monitor.name}</div>
                    {monitor.description && (
                      <div className="text-sm text-gray-500 dark:text-gray-400">{monitor.description}</div>
                    )}
                    {!monitor.enabled && (
                      <span className="text-xs text-gray-500 dark:text-gray-400">Disabled</span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="px-2 py-1 text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded">
                      {monitor.type.toUpperCase()}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600 dark:text-gray-400 max-w-xs truncate">
                    {monitor.target}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-2 py-1 text-xs font-medium rounded ${
                      monitor.agent_id 
                        ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300' 
                        : 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                    }`}>
                      {getAgentName(monitor.agent_id)}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600 dark:text-gray-400">
                    {monitor.check_interval}s
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600 dark:text-gray-400">
                    {monitor.latest_status?.response_time_ms
                      ? `${monitor.latest_status.response_time_ms}ms`
                      : '-'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => handleTest(monitor)}
                        className="p-2 text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
                        title="Test"
                      >
                        <Play className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => {
                          setEditingMonitor(monitor);
                          setShowForm(true);
                        }}
                        className="p-2 text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
                        title="Edit"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(monitor)}
                        className="p-2 text-gray-400 hover:text-red-600 dark:hover:text-red-400 transition-colors"
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
        
        {/* Pagination controls */}
        {monitors.length > 0 && totalPages > 1 && (
          <div className="pagination">
            <div className="pagination-info">
              Showing {startIndex + 1}-{Math.min(endIndex, monitors.length)} of {monitors.length}
            </div>
            <div className="pagination-controls">
              <select
                value={pageSize}
                onChange={(e) => setPageSize(Number(e.target.value))}
                className="pagination-select"
              >
                {PAGE_SIZE_OPTIONS.map((size) => (
                  <option key={size} value={size}>{size} per page</option>
                ))}
              </select>
              <button
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="pagination-btn"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="text-sm text-gray-600 dark:text-gray-300">
                Page {currentPage} of {totalPages}
              </span>
              <button
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="pagination-btn"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Test result modal */}
      {testResult && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl p-6 max-w-md w-full mx-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Test Result</h3>
              <button onClick={() => setTestResult(null)}>
                <X className="h-5 w-5 text-gray-400" />
              </button>
            </div>
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                {statusIcon(testResult.result.status)}
                <span className="font-medium capitalize text-gray-900 dark:text-white">{testResult.result.status}</span>
              </div>
              {testResult.result.response_time_ms && (
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Response time: {testResult.result.response_time_ms}ms
                </p>
              )}
              {testResult.result.details && (
                <p className="text-sm text-gray-600 dark:text-gray-400">Details: {testResult.result.details}</p>
              )}
              {testResult.result.captured_hash && (
                <p className="text-sm text-gray-600 dark:text-gray-400 font-mono text-xs">
                  Body hash: {testResult.result.captured_hash}
                </p>
              )}
              {testResult.result.ssl_expiry_days !== undefined && (
                <p className="text-sm text-gray-600 dark:text-gray-400">
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
  agents: Agent[];
  onClose: () => void;
  onSave: (data: MonitorCreate) => Promise<void>;
}

function MonitorForm({ monitor, agents, onClose, onSave }: FormProps) {
  const [type, setType] = useState<'ping' | 'http' | 'https' | 'ssl'>(
    monitor?.type || 'ping'
  );
  const [name, setName] = useState(monitor?.name || '');
  const [description, setDescription] = useState(monitor?.description || '');
  const [target, setTarget] = useState(monitor?.target || '');
  const [interval, setInterval] = useState(monitor?.check_interval || 60);
  const [enabled, setEnabled] = useState(monitor?.enabled ?? true);
  const [agentId, setAgentId] = useState(monitor?.agent_id || '');
  const [expectedStatus, setExpectedStatus] = useState(
    monitor?.config?.expected_status?.toString() || ''
  );
  const [expectedContent, setExpectedContent] = useState(
    monitor?.config?.expected_content || ''
  );
  const [saving, setSaving] = useState(false);
  const [polling, setPolling] = useState(false);
  const [pollError, setPollError] = useState<string | null>(null);
  const [pollSuccess, setPollSuccess] = useState<string | null>(null);

  async function handlePollPage() {
    if (!target) return;
    setPolling(true);
    setPollError(null);
    setPollSuccess(null);
    
    try {
      const result = await pollPage(target, type === 'https');
      
      if (result.suggested_content) {
        setExpectedContent(result.suggested_content);
        setPollSuccess(`Found: "${result.suggested_content}"`);
      } else {
        setPollError('Could not extract page title or heading. Enter text manually.');
      }
    } catch (err) {
      setPollError(err instanceof Error ? err.message : 'Poll failed');
    } finally {
      setPolling(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    
    const config: Record<string, unknown> = {};
    if (expectedStatus) {
      config.expected_status = parseInt(expectedStatus, 10);
    }
    if (expectedContent) {
      config.expected_content = expectedContent;
    }

    await onSave({
      type,
      name,
      description: description || undefined,
      target,
      check_interval: interval,
      enabled,
      agent_id: agentId || undefined,
      config: Object.keys(config).length > 0 ? config : undefined,
    });
    
    setSaving(false);
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl p-6 max-w-lg w-full mx-4">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            {monitor ? 'Edit Monitor' : 'Add Monitor'}
          </h3>
          <button onClick={onClose}>
            <X className="h-5 w-5 text-gray-400" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Type</label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as typeof type)}
              className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-lg px-3 py-2"
              disabled={!!monitor}
            >
              <option value="ping">Ping</option>
              <option value="http">HTTP</option>
              <option value="https">HTTPS</option>
              <option value="ssl">SSL Certificate</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-lg px-3 py-2"
              placeholder="My Server"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Description (optional)</label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-lg px-3 py-2"
              placeholder="Production Hyper-V host in rack 2"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Target</label>
            <input
              type="text"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-lg px-3 py-2"
              placeholder={type === 'ping' ? '192.168.1.100' : 'https://example.com'}
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Check Interval (seconds)
            </label>
            <input
              type="number"
              value={interval}
              onChange={(e) => setInterval(parseInt(e.target.value, 10))}
              className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-lg px-3 py-2"
              min={10}
              max={3600}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Run From
            </label>
            <select
              value={agentId}
              onChange={(e) => setAgentId(e.target.value)}
              className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-lg px-3 py-2"
            >
              <option value="">Server (local)</option>
              {agents.map((agent) => (
                <option key={agent.id} value={agent.id}>
                  {agent.name || agent.id.slice(0, 8) + '...'} (Agent)
                </option>
              ))}
            </select>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Choose where this monitor runs from. Use agents to check from remote locations.
            </p>
          </div>

          {(type === 'http' || type === 'https') && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Expected Status Code (optional)
                </label>
                <input
                  type="number"
                  value={expectedStatus}
                  onChange={(e) => setExpectedStatus(e.target.value)}
                  className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-lg px-3 py-2"
                  placeholder="200"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Expected Content (optional)
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={expectedContent}
                    onChange={(e) => setExpectedContent(e.target.value)}
                    className="flex-1 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-lg px-3 py-2"
                    placeholder="Text that must appear on the page"
                  />
                  <button
                    type="button"
                    onClick={handlePollPage}
                    disabled={!target || polling}
                    className="px-3 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-50 text-sm whitespace-nowrap"
                  >
                    {polling ? 'Polling...' : 'Poll Page'}
                  </button>
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Monitor will be marked DOWN if this text is not found in the response
                </p>
                {pollError && (
                  <p className="text-xs text-red-500 mt-1">{pollError}</p>
                )}
                {pollSuccess && (
                  <p className="text-xs text-green-500 mt-1">{pollSuccess}</p>
                )}
              </div>
            </>
          )}

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="enabled"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
              className="rounded border-gray-300 dark:border-gray-600"
            />
            <label htmlFor="enabled" className="text-sm text-gray-700 dark:text-gray-300">
              Enabled
            </label>
          </div>

          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700"
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
