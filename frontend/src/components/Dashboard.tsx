import { useEffect, useState, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Activity, AlertCircle, Calendar, CheckCircle, ChevronLeft, ChevronRight, Clock, Filter, HelpCircle, Search, Server, TrendingUp } from 'lucide-react';
import { getMonitors, getMonitorHistory, getAgents } from '../api/client';
import type { Monitor, StatusHistoryPoint, Agent } from '../types';
import MiniStatusGraph from './MiniStatusGraph';

type TypeFilter = 'all' | 'ping' | 'http' | 'ssl';

interface MonitorWithHistory extends Monitor {
  history: StatusHistoryPoint[];
}

type TimeRange = {
  label: string;
  hours: number;
  uptimeLabel: string;
};

const TIME_RANGES: TimeRange[] = [
  { label: 'Last 24 Hours', hours: 24, uptimeLabel: '24h Uptime' },
  { label: 'Last Week', hours: 168, uptimeLabel: '7d Uptime' },
  { label: 'Last Month', hours: 720, uptimeLabel: '30d Uptime' },
  { label: 'Last 3 Months', hours: 2160, uptimeLabel: '90d Uptime' },
  { label: 'Last Year', hours: 8760, uptimeLabel: '1y Uptime' },
];

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

export default function Dashboard() {
  const navigate = useNavigate();
  const [monitors, setMonitors] = useState<MonitorWithHistory[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedRange, setSelectedRange] = useState<TimeRange>(TIME_RANGES[0]);
  const [selectedAgent, setSelectedAgent] = useState<string>('all'); // 'all', 'server', or agent_id
  const [selectedType, setSelectedType] = useState<TypeFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  useEffect(() => {
    loadAgents();
  }, []);

  useEffect(() => {
    loadMonitors();
    const interval = setInterval(loadMonitors, 30000);
    return () => clearInterval(interval);
  }, [selectedRange]);

  async function loadAgents() {
    try {
      const agentList = await getAgents();
      setAgents(agentList.filter(a => a.status === 'approved'));
    } catch {
      // Ignore errors loading agents
    }
  }

  async function loadMonitors() {
    try {
      setLoading(true);
      const monitorList = await getMonitors();
      
      // Load history for each monitor
      const monitorsWithHistory = await Promise.all(
        monitorList.map(async (monitor) => {
          try {
            const history = await getMonitorHistory(monitor.id, selectedRange.hours);
            return { ...monitor, history };
          } catch {
            return { ...monitor, history: [] };
          }
        })
      );
      
      setMonitors(monitorsWithHistory);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }

  // Filter monitors based on selected agent, type, and search query
  const filteredMonitors = useMemo(() => {
    let result = monitors;
    
    // Filter by agent
    if (selectedAgent === 'server') {
      result = result.filter(m => !m.agent_id);
    } else if (selectedAgent !== 'all') {
      result = result.filter(m => m.agent_id === selectedAgent);
    }
    
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
  }, [monitors, selectedAgent, selectedType, searchQuery]);

  // Reset to page 1 when filter changes
  useEffect(() => {
    setCurrentPage(1);
  }, [selectedAgent, selectedType, searchQuery, pageSize]);

  // Pagination calculations
  const totalPages = Math.ceil(filteredMonitors.length / pageSize);
  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = startIndex + pageSize;
  const paginatedMonitors = filteredMonitors.slice(startIndex, endIndex);

  // Create agent lookup map for display
  const agentMap = useMemo(() => {
    const map: Record<string, string> = {};
    agents.forEach(a => {
      map[a.id] = a.name || a.id.substring(0, 8);
    });
    return map;
  }, [agents]);

  // Get display name for agent
  const getAgentDisplayName = (agentId?: string) => {
    if (!agentId) return 'Server';
    return agentMap[agentId] || agentId.substring(0, 8);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 text-red-700 dark:text-red-400">
        {error}
      </div>
    );
  }

  // Calculate stats from filtered monitors
  const stats = {
    total: filteredMonitors.length,
    up: filteredMonitors.filter(m => m.latest_status?.status === 'up').length,
    down: filteredMonitors.filter(m => m.latest_status?.status === 'down').length,
    degraded: filteredMonitors.filter(m => m.latest_status?.status === 'degraded').length,
  };

  // Calculate overall uptime from filtered monitors
  const uptimes = filteredMonitors.map(m => {
    if (!m.history.length) return 0;
    const upCount = m.history.filter(h => h.status === 'up').length;
    return (upCount / m.history.length) * 100;
  });
  const overallUptime = uptimes.length ? uptimes.reduce((a, b) => a + b, 0) / uptimes.length : 0;

  const statusColor = (status?: string) => {
    switch (status) {
      case 'up': return 'text-green-500';
      case 'down': return 'text-red-500';
      case 'degraded': return 'text-yellow-500';
      default: return 'text-gray-400';
    }
  };

  const statusBgColor = (status?: string) => {
    switch (status) {
      case 'up': return 'bg-green-100 dark:bg-green-900/30';
      case 'down': return 'bg-red-100 dark:bg-red-900/30';
      case 'degraded': return 'bg-yellow-100 dark:bg-yellow-900/30';
      default: return 'bg-gray-100 dark:bg-gray-800';
    }
  };

  const statusIcon = (status?: string) => {
    switch (status) {
      case 'up': return <CheckCircle className={`h-5 w-5 ${statusColor(status)}`} />;
      case 'down': return <AlertCircle className={`h-5 w-5 ${statusColor(status)}`} />;
      case 'degraded': return <AlertCircle className={`h-5 w-5 ${statusColor(status)}`} />;
      default: return <HelpCircle className={`h-5 w-5 ${statusColor(status)}`} />;
    }
  };

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-lg">
              <CheckCircle className="h-6 w-6 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Up</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats.up}</p>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-red-100 dark:bg-red-900/30 rounded-lg">
              <AlertCircle className="h-6 w-6 text-red-600 dark:text-red-400" />
            </div>
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Down</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats.down}</p>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-100 dark:bg-indigo-900/30 rounded-lg">
              <TrendingUp className="h-6 w-6 text-indigo-600 dark:text-indigo-400" />
            </div>
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">{selectedRange.uptimeLabel}</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{overallUptime.toFixed(1)}%</p>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-gray-100 dark:bg-gray-700 rounded-lg">
              <Activity className="h-6 w-6 text-gray-600 dark:text-gray-400" />
            </div>
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Total Monitors</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats.total}</p>
            </div>
          </div>
        </div>
      </div>

      {/* All Monitors section */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">All Monitors</h2>
          <div className="flex items-center gap-4">
            <div className="search-wrapper">
              <Search className="search-icon" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search monitors..."
                className="search-input w-48"
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
            <div className="flex items-center gap-2">
              <Server className="h-4 w-4 text-gray-400" />
              <select
                value={selectedAgent}
                onChange={(e) => setSelectedAgent(e.target.value)}
                className="text-sm bg-gray-100 dark:bg-gray-700 border-0 rounded-lg px-3 py-1.5 text-gray-700 dark:text-gray-300 focus:ring-2 focus:ring-indigo-500"
              >
                <option value="all">All Agents</option>
                <option value="server">Server</option>
                {agents.map((agent) => (
                  <option key={agent.id} value={agent.id}>
                    {agent.name || agent.id.substring(0, 8)}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-gray-400" />
              <select
                value={selectedRange.hours}
                onChange={(e) => {
                  const range = TIME_RANGES.find(r => r.hours === Number(e.target.value));
                  if (range) setSelectedRange(range);
                }}
                className="text-sm bg-gray-100 dark:bg-gray-700 border-0 rounded-lg px-3 py-1.5 text-gray-700 dark:text-gray-300 focus:ring-2 focus:ring-indigo-500"
              >
                {TIME_RANGES.map((range) => (
                  <option key={range.hours} value={range.hours}>
                    {range.label}
                  </option>
                ))}
              </select>
            </div>
            <Link
              to="/monitors"
              className="text-sm text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 font-medium"
            >
              Manage →
            </Link>
          </div>
        </div>
        
        {filteredMonitors.length === 0 ? (
          <div className="px-6 py-12 text-center text-gray-500 dark:text-gray-400">
            {monitors.length === 0 ? (
              <>
                No monitors configured.{' '}
                <Link to="/monitors" className="text-indigo-600 dark:text-indigo-400 hover:underline">
                  Add one
                </Link>
              </>
            ) : (
              'No monitors match your filters.'
            )}
          </div>
        ) : (
          <>
            <div className="divide-y divide-gray-100 dark:divide-gray-700">
              {paginatedMonitors.map((monitor) => {
                const uptime = monitor.history.length
                  ? (monitor.history.filter(h => h.status === 'up').length / monitor.history.length) * 100
                  : 0;
                
                return (
                  <div
                    key={monitor.id}
                    onClick={() => navigate(`/monitor/${monitor.id}`)}
                    className="clickable-row px-6 py-4 hover:bg-gray-50 dark:hover:bg-gray-700/50"
                  >
                    {/* Row 1: Status icon + Name + Type tag (full width, no truncation) */}
                    <div className="flex items-center gap-3 mb-2">
                      <div className={`p-2 rounded-lg shrink-0 ${statusBgColor(monitor.latest_status?.status)}`}>
                        {statusIcon(monitor.latest_status?.status)}
                      </div>
                      <h3 className="font-medium text-gray-900 dark:text-white">{monitor.name}</h3>
                      <span className="px-1.5 py-0.5 text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded shrink-0">
                        {monitor.type.toUpperCase()}
                      </span>
                    </div>
                    
                    {/* Row 2: Description/target, Agent, Response, Graph, Status */}
                    <div className="flex items-center gap-4 pl-12">
                      {/* Description and target */}
                      <div className="min-w-0 w-64 shrink-0">
                        {monitor.description && (
                          <p className="text-sm text-gray-500 dark:text-gray-400 truncate">{monitor.description}</p>
                        )}
                        <p className="text-xs text-gray-400 dark:text-gray-500 truncate">{monitor.target}</p>
                      </div>
                      
                      {/* Agent column */}
                      <div className="shrink-0 w-20 text-center">
                        <span className="text-xs px-2 py-1 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
                          {getAgentDisplayName(monitor.agent_id)}
                        </span>
                      </div>
                      
                      {/* Response column */}
                      <div className="shrink-0 w-20 text-center">
                        {monitor.type === 'ssl' ? (
                          <div className="flex items-center justify-center gap-1">
                            <Clock className="h-4 w-4 text-gray-400" />
                            <span className="text-sm text-gray-600 dark:text-gray-300">
                              {monitor.latest_status?.ssl_expiry_days !== undefined
                                ? `${monitor.latest_status.ssl_expiry_days}d`
                                : '-'}
                            </span>
                          </div>
                        ) : (
                          <span className="text-sm text-gray-600 dark:text-gray-300">
                            {monitor.latest_status?.response_time_ms !== undefined
                              ? `${monitor.latest_status.response_time_ms}ms`
                              : '-'}
                          </span>
                        )}
                      </div>
                      
                      {/* Mini status graph - takes remaining space */}
                      <div className="flex-1 min-w-0">
                        <MiniStatusGraph history={monitor.history} />
                      </div>
                      
                      {/* Status and uptime */}
                      <div className="text-right shrink-0 w-24">
                        <p className={`font-medium ${statusColor(monitor.latest_status?.status)}`}>
                          {monitor.latest_status?.status
                            ? monitor.latest_status.status.charAt(0).toUpperCase() + monitor.latest_status.status.slice(1)
                            : 'Unknown'}
                        </p>
                        <p className="text-sm text-gray-500 dark:text-gray-400">{uptime.toFixed(1)}%</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            
            {/* Pagination controls */}
            {totalPages > 1 && (
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
          </>
        )}
      </div>
    </div>
  );
}
