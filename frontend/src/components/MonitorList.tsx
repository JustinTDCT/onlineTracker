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
  Search,
  Filter,
} from 'lucide-react';
import {
  getMonitors,
  createMonitor,
  updateMonitor,
  deleteMonitor,
  testMonitor,
  pollPage,
  getAgents,
  getMonitorDefaults,
  getTags,
  setMonitorTags,
} from '../api/client';
import type { Monitor, MonitorCreate, MonitorTestResult, Agent, MonitorDefaults, Tag } from '../types';

type TypeFilter = 'all' | 'ping' | 'http' | 'ssl';

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

export default function MonitorList() {
  const [monitors, setMonitors] = useState<Monitor[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [defaults, setDefaults] = useState<MonitorDefaults | null>(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingMonitor, setEditingMonitor] = useState<Monitor | null>(null);
  const [testResult, setTestResult] = useState<{ id: number; result: MonitorTestResult } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedType, setSelectedType] = useState<TypeFilter>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Filter monitors based on search query and type
  const filteredMonitors = useMemo(() => {
    let result = monitors;
    
    // Filter by type
    if (selectedType !== 'all') {
      if (selectedType === 'http') {
        result = result.filter(m => m.type === 'http' || m.type === 'https');
      } else {
        result = result.filter(m => m.type === selectedType);
      }
    }
    
    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      result = result.filter(m => 
        m.name.toLowerCase().includes(query) ||
        (m.description && m.description.toLowerCase().includes(query)) ||
        m.target.toLowerCase().includes(query)
      );
    }
    
    return result;
  }, [monitors, selectedType, searchQuery]);

  // Pagination calculations
  const totalPages = useMemo(() => Math.ceil(filteredMonitors.length / pageSize), [filteredMonitors.length, pageSize]);
  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = startIndex + pageSize;
  const paginatedMonitors = useMemo(() => filteredMonitors.slice(startIndex, endIndex), [filteredMonitors, startIndex, endIndex]);

  // Reset to page 1 when filter or page size changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, selectedType, pageSize]);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      const [monitorsData, agentsData, defaultsData, tagsData] = await Promise.all([
        getMonitors(),
        getAgents(),
        getMonitorDefaults(),
        getTags(),
      ]);
      setMonitors(monitorsData);
      // Only show approved agents
      setAgents(agentsData.filter(a => a.status === 'approved'));
      setDefaults(defaultsData);
      setTags(tagsData);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      setLoading(false);
    }
  }

  async function loadMonitors() {
    try {
      const [monitorsData, tagsData] = await Promise.all([
        getMonitors(),
        getTags(),
      ]);
      setMonitors(monitorsData);
      setTags(tagsData);
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
        <div className="flex items-center gap-4">
          <div className="search-wrapper">
            <Search className="search-icon" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search monitors..."
              className="search-input w-64"
            />
          </div>
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-gray-400" />
            <select
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value as TypeFilter)}
              className="text-sm bg-gray-100 dark:bg-gray-700 border-0 rounded-lg px-3 py-1.5 text-gray-700 dark:text-gray-300 focus:ring-2 focus:ring-indigo-500"
            >
              <option value="all">All Types</option>
              <option value="ping">Ping</option>
              <option value="http">HTTP/HTTPS</option>
              <option value="ssl">SSL</option>
            </select>
          </div>
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
          tags={tags}
          defaults={defaults}
          onClose={() => {
            setShowForm(false);
            setEditingMonitor(null);
          }}
          onSave={async (data, tagIds) => {
            try {
              let monitorId: number;
              if (editingMonitor) {
                await updateMonitor(editingMonitor.id, data);
                monitorId = editingMonitor.id;
              } else {
                const created = await createMonitor(data);
                monitorId = created.id;
              }
              // Update tags
              if (tagIds.length > 0 || (editingMonitor?.tags?.length ?? 0) > 0) {
                await setMonitorTags(monitorId, tagIds);
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
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-x-auto">
        <table className="w-full min-w-[1100px] divide-y divide-gray-200 dark:divide-gray-700">
          <thead className="bg-gray-50 dark:bg-gray-900">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Status</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Name</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Type</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Tags</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Target</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Agent</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Interval</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Response</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
            {filteredMonitors.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-4 py-12 text-center text-gray-500 dark:text-gray-400">
                  {monitors.length === 0 
                    ? 'No monitors configured. Click "Add Monitor" to create one.'
                    : 'No monitors match your filters.'}
                </td>
              </tr>
            ) : (
              paginatedMonitors.map((monitor) => (
                <tr key={monitor.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                  <td className="px-4 py-3 whitespace-nowrap">
                    {statusIcon(monitor.latest_status?.status)}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <div className="font-medium text-gray-900 dark:text-white">{monitor.name}</div>
                    {monitor.description && (
                      <div className="text-sm text-gray-500 dark:text-gray-400">{monitor.description}</div>
                    )}
                    {!monitor.enabled && (
                      <span className="text-xs text-gray-500 dark:text-gray-400">Disabled</span>
                    )}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className="px-2 py-1 text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded">
                      {monitor.type.toUpperCase()}
                    </span>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <div className="flex flex-wrap gap-1">
                      {monitor.tags && monitor.tags.length > 0 ? (
                        monitor.tags.map((tag) => (
                          <span
                            key={tag.id}
                            className="tag-badge"
                            style={{
                              backgroundColor: tag.color + '20',
                              color: tag.color,
                              borderColor: tag.color,
                            }}
                          >
                            {tag.name}
                          </span>
                        ))
                      ) : (
                        <span className="text-xs text-gray-400">-</span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600 dark:text-gray-400 max-w-xs truncate">
                    {monitor.target}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className={`px-2 py-1 text-xs font-medium rounded ${
                      monitor.agent_id 
                        ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300' 
                        : 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                    }`}>
                      {getAgentName(monitor.agent_id)}
                    </span>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600 dark:text-gray-400">
                    {monitor.check_interval}s
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600 dark:text-gray-400">
                    {monitor.latest_status?.response_time_ms
                      ? `${monitor.latest_status.response_time_ms}ms`
                      : '-'}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-right">
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
        {filteredMonitors.length > 0 && totalPages > 1 && (
          <div className="pagination">
            <div className="pagination-info">
              Showing {startIndex + 1}-{Math.min(endIndex, filteredMonitors.length)} of {filteredMonitors.length}
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
  tags: Tag[];
  defaults: MonitorDefaults | null;
  onClose: () => void;
  onSave: (data: MonitorCreate, tagIds: number[]) => Promise<void>;
}

function MonitorForm({ monitor, agents, tags, defaults, onClose, onSave }: FormProps) {
  const [type, setType] = useState<'ping' | 'http' | 'https' | 'ssl'>(
    monitor?.type || 'ping'
  );
  const [name, setName] = useState(monitor?.name || '');
  const [description, setDescription] = useState(monitor?.description || '');
  const [target, setTarget] = useState(monitor?.target || '');
  const [interval, setInterval] = useState(monitor?.check_interval || defaults?.check_interval || 60);
  const [enabled, setEnabled] = useState(monitor?.enabled ?? true);
  const [agentId, setAgentId] = useState(monitor?.agent_id || '');
  const [selectedTagIds, setSelectedTagIds] = useState<number[]>(
    monitor?.tags?.map(t => t.id) || []
  );
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
  
  // Threshold states - prefill from monitor config or defaults
  const [pingCount, setPingCount] = useState(
    monitor?.config?.ping_count || defaults?.ping_count || 5
  );
  const [pingOkThreshold, setPingOkThreshold] = useState(
    monitor?.config?.ping_ok_threshold_ms || defaults?.ping_ok_threshold_ms || 80
  );
  const [pingDegradedThreshold, setPingDegradedThreshold] = useState(
    monitor?.config?.ping_degraded_threshold_ms || defaults?.ping_degraded_threshold_ms || 200
  );
  const [httpOkThreshold, setHttpOkThreshold] = useState(
    monitor?.config?.http_ok_threshold_ms || defaults?.http_ok_threshold_ms || 80
  );
  const [httpDegradedThreshold, setHttpDegradedThreshold] = useState(
    monitor?.config?.http_degraded_threshold_ms || defaults?.http_degraded_threshold_ms || 200
  );
  const [sslOkThreshold, setSslOkThreshold] = useState(
    monitor?.config?.ssl_ok_threshold_days || defaults?.ssl_ok_threshold_days || 30
  );
  const [sslWarningThreshold, setSslWarningThreshold] = useState(
    monitor?.config?.ssl_warning_threshold_days || defaults?.ssl_warning_threshold_days || 14
  );
  
  // Show advanced options
  const [showAdvanced, setShowAdvanced] = useState(false);

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
    
    // Add type-specific thresholds
    if (type === 'ping') {
      // Validate ping count
      let validPingCount = pingCount;
      if (validPingCount > 10) {
        validPingCount = 10;
      } else if (validPingCount < 1) {
        validPingCount = 1;
      }
      config.ping_count = validPingCount;
      config.ping_ok_threshold_ms = pingOkThreshold;
      config.ping_degraded_threshold_ms = pingDegradedThreshold;
    } else if (type === 'http' || type === 'https') {
      // HTTP/HTTPS also use ping_count for number of requests to average
      let validPingCount = pingCount;
      if (validPingCount > 10) {
        validPingCount = 10;
      } else if (validPingCount < 1) {
        validPingCount = 1;
      }
      config.ping_count = validPingCount;
      config.http_ok_threshold_ms = httpOkThreshold;
      config.http_degraded_threshold_ms = httpDegradedThreshold;
    } else if (type === 'ssl') {
      config.ssl_ok_threshold_days = sslOkThreshold;
      config.ssl_warning_threshold_days = sslWarningThreshold;
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
    }, selectedTagIds);
    
    setSaving(false);
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-lg w-full max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-6 pb-4 border-b border-gray-200 dark:border-gray-700 shrink-0">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            {monitor ? 'Edit Monitor' : 'Add Monitor'}
          </h3>
          <button onClick={onClose}>
            <X className="h-5 w-5 text-gray-400" />
          </button>
        </div>

        <form id="monitor-form" onSubmit={handleSubmit} className="space-y-4 p-6 overflow-y-auto flex-1">
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

          {tags.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Tags
              </label>
              <div className="flex flex-wrap gap-2">
                {tags.map((tag) => (
                  <label
                    key={tag.id}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full cursor-pointer transition-all ${
                      selectedTagIds.includes(tag.id)
                        ? 'ring-2 ring-offset-1'
                        : 'opacity-60 hover:opacity-100'
                    }`}
                    style={{
                      backgroundColor: tag.color + '20',
                      color: tag.color,
                      borderColor: tag.color,
                      ...(selectedTagIds.includes(tag.id) ? { ringColor: tag.color } : {}),
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={selectedTagIds.includes(tag.id)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedTagIds([...selectedTagIds, tag.id]);
                        } else {
                          setSelectedTagIds(selectedTagIds.filter(id => id !== tag.id));
                        }
                      }}
                      className="sr-only"
                    />
                    <span className="text-sm font-medium">{tag.name}</span>
                  </label>
                ))}
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Click tags to assign them to this monitor
              </p>
            </div>
          )}

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

          {/* Advanced Thresholds Section */}
          <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
            <button
              type="button"
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-indigo-600 dark:hover:text-indigo-400"
            >
              {showAdvanced ? '▼' : '►'} Threshold Settings
            </button>
            
            {showAdvanced && (
              <div className="mt-4 space-y-4 pl-4 border-l-2 border-gray-200 dark:border-gray-700">
                {/* PING Thresholds */}
                {type === 'ping' && (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Number of Pings
                      </label>
                      <input
                        type="number"
                        value={pingCount}
                        onChange={(e) => {
                          let val = parseInt(e.target.value, 10);
                          if (val > 10) {
                            val = 10;
                            alert('Maximum ping count is 10. Setting to 10.');
                          } else if (val < 1) {
                            val = 1;
                            alert('Minimum ping count is 1. Setting to 1.');
                          }
                          setPingCount(val);
                        }}
                        className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-lg px-3 py-2"
                        min={1}
                        max={10}
                      />
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        Number of pings to send per check (1-10)
                      </p>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                          OK Threshold (ms)
                        </label>
                        <input
                          type="number"
                          value={pingOkThreshold}
                          onChange={(e) => setPingOkThreshold(parseInt(e.target.value, 10))}
                          className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-lg px-3 py-2"
                          min={1}
                        />
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                          Latency ≤ this = OK
                        </p>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                          Degraded Threshold (ms)
                        </label>
                        <input
                          type="number"
                          value={pingDegradedThreshold}
                          onChange={(e) => setPingDegradedThreshold(parseInt(e.target.value, 10))}
                          className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-lg px-3 py-2"
                          min={1}
                        />
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                          Latency ≤ this = Degraded, &gt; = Down
                        </p>
                      </div>
                    </div>
                  </>
                )}
                
                {/* HTTP/HTTPS Thresholds */}
                {(type === 'http' || type === 'https') && (
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        OK Threshold (ms)
                      </label>
                      <input
                        type="number"
                        value={httpOkThreshold}
                        onChange={(e) => setHttpOkThreshold(parseInt(e.target.value, 10))}
                        className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-lg px-3 py-2"
                        min={1}
                      />
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        Latency ≤ this = OK
                      </p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Degraded Threshold (ms)
                      </label>
                      <input
                        type="number"
                        value={httpDegradedThreshold}
                        onChange={(e) => setHttpDegradedThreshold(parseInt(e.target.value, 10))}
                        className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-lg px-3 py-2"
                        min={1}
                      />
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        Latency ≤ this = Degraded, &gt; = Down
                      </p>
                    </div>
                  </div>
                )}
                
                {/* SSL Thresholds */}
                {type === 'ssl' && (
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        OK Threshold (days)
                      </label>
                      <input
                        type="number"
                        value={sslOkThreshold}
                        onChange={(e) => setSslOkThreshold(parseInt(e.target.value, 10))}
                        className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-lg px-3 py-2"
                        min={1}
                      />
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        Days ≥ this = OK
                      </p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Warning Threshold (days)
                      </label>
                      <input
                        type="number"
                        value={sslWarningThreshold}
                        onChange={(e) => setSslWarningThreshold(parseInt(e.target.value, 10))}
                        className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-lg px-3 py-2"
                        min={1}
                      />
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        Days ≥ this = Warning, &lt; = Down
                      </p>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

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

        </form>

        <div className="flex gap-3 p-6 pt-4 border-t border-gray-200 dark:border-gray-700 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700"
          >
            Cancel
          </button>
          <button
            type="submit"
            form="monitor-form"
            disabled={saving}
            className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
