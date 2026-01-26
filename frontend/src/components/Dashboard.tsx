import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Activity, AlertCircle, CheckCircle, HelpCircle, TrendingUp } from 'lucide-react';
import { getMonitors, getMonitorHistory } from '../api/client';
import type { Monitor, StatusHistoryPoint } from '../types';
import MiniStatusGraph from './MiniStatusGraph';

interface MonitorWithHistory extends Monitor {
  history: StatusHistoryPoint[];
}

export default function Dashboard() {
  const [monitors, setMonitors] = useState<MonitorWithHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadMonitors();
    const interval = setInterval(loadMonitors, 30000);
    return () => clearInterval(interval);
  }, []);

  async function loadMonitors() {
    try {
      const monitorList = await getMonitors();
      
      // Load history for each monitor
      const monitorsWithHistory = await Promise.all(
        monitorList.map(async (monitor) => {
          try {
            const history = await getMonitorHistory(monitor.id, 72);
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

  // Calculate stats
  const stats = {
    total: monitors.length,
    up: monitors.filter(m => m.latest_status?.status === 'up').length,
    down: monitors.filter(m => m.latest_status?.status === 'down').length,
    degraded: monitors.filter(m => m.latest_status?.status === 'degraded').length,
  };

  // Calculate overall uptime
  const uptimes = monitors.map(m => {
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
              <p className="text-sm text-gray-500 dark:text-gray-400">24h Uptime</p>
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
          <Link
            to="/monitors"
            className="text-sm text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 font-medium"
          >
            Manage →
          </Link>
        </div>
        
        {monitors.length === 0 ? (
          <div className="px-6 py-12 text-center text-gray-500 dark:text-gray-400">
            No monitors configured.{' '}
            <Link to="/monitors" className="text-indigo-600 dark:text-indigo-400 hover:underline">
              Add one
            </Link>
          </div>
        ) : (
          <div className="divide-y divide-gray-100 dark:divide-gray-700">
            {monitors.map((monitor) => {
              const uptime = monitor.history.length
                ? (monitor.history.filter(h => h.status === 'up').length / monitor.history.length) * 100
                : 0;
              
              return (
                <div
                  key={monitor.id}
                  className="px-6 py-4 hover:bg-gray-50 dark:hover:bg-gray-700/50"
                >
                  {/* Top row: status, name, type badge, uptime */}
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-lg ${statusBgColor(monitor.latest_status?.status)}`}>
                        {statusIcon(monitor.latest_status?.status)}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-gray-900 dark:text-white">{monitor.name}</p>
                          <span className="px-2 py-0.5 text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded">
                            {monitor.type.toUpperCase()}
                          </span>
                        </div>
                        {monitor.description && (
                          <p className="text-sm text-gray-500 dark:text-gray-400">{monitor.description}</p>
                        )}
                        <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{monitor.target}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className={`font-medium ${statusColor(monitor.latest_status?.status)}`}>
                        {monitor.latest_status?.status
                          ? monitor.latest_status.status.charAt(0).toUpperCase() + monitor.latest_status.status.slice(1)
                          : 'Unknown'}
                      </p>
                      <p className="text-sm text-gray-500 dark:text-gray-400">{uptime.toFixed(1)}% uptime</p>
                    </div>
                  </div>
                  
                  {/* Mini status graph */}
                  <MiniStatusGraph history={monitor.history} />
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
