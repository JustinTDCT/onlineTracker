import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Activity, AlertCircle, CheckCircle, HelpCircle, TrendingUp } from 'lucide-react';
import { getStatusOverview, getMonitorHistory } from '../api/client';
import type { StatusOverview, StatusHistoryPoint } from '../types';
import StatusGraph from './StatusGraph';

export default function Dashboard() {
  const [overview, setOverview] = useState<StatusOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedMonitorId, setSelectedMonitorId] = useState<number | null>(null);
  const [history, setHistory] = useState<StatusHistoryPoint[]>([]);

  useEffect(() => {
    loadOverview();
    const interval = setInterval(loadOverview, 30000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (selectedMonitorId) {
      loadHistory(selectedMonitorId);
    }
  }, [selectedMonitorId]);

  async function loadOverview() {
    try {
      const data = await getStatusOverview();
      setOverview(data);
      setError(null);
      
      // Select first monitor if none selected
      if (!selectedMonitorId && data.monitors.length > 0) {
        setSelectedMonitorId(data.monitors[0].id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }

  async function loadHistory(monitorId: number) {
    try {
      const data = await getMonitorHistory(monitorId, 72);
      setHistory(data);
    } catch (err) {
      console.error('Failed to load history:', err);
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
      <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
        {error}
      </div>
    );
  }

  if (!overview) return null;

  const statusColor = (status: string) => {
    switch (status) {
      case 'up':
        return 'text-green-500';
      case 'down':
        return 'text-red-500';
      case 'degraded':
        return 'text-yellow-500';
      default:
        return 'text-gray-400';
    }
  };

  const statusBgColor = (status: string) => {
    switch (status) {
      case 'up':
        return 'bg-green-100';
      case 'down':
        return 'bg-red-100';
      case 'degraded':
        return 'bg-yellow-100';
      default:
        return 'bg-gray-100';
    }
  };

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-100 rounded-lg">
              <CheckCircle className="h-6 w-6 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Up</p>
              <p className="text-2xl font-bold text-gray-900">{overview.monitors_up}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-red-100 rounded-lg">
              <AlertCircle className="h-6 w-6 text-red-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Down</p>
              <p className="text-2xl font-bold text-gray-900">{overview.monitors_down}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-100 rounded-lg">
              <TrendingUp className="h-6 w-6 text-indigo-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">24h Uptime</p>
              <p className="text-2xl font-bold text-gray-900">{overview.overall_uptime_24h}%</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-gray-100 rounded-lg">
              <Activity className="h-6 w-6 text-gray-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Total Monitors</p>
              <p className="text-2xl font-bold text-gray-900">{overview.total_monitors}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Status graph */}
      {selectedMonitorId && history.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">72-Hour Status</h2>
            <select
              value={selectedMonitorId}
              onChange={(e) => setSelectedMonitorId(Number(e.target.value))}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
            >
              {overview.monitors.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </div>
          <StatusGraph history={history} />
        </div>
      )}

      {/* Monitor list */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">All Monitors</h2>
          <Link
            to="/monitors"
            className="text-sm text-indigo-600 hover:text-indigo-700 font-medium"
          >
            View all →
          </Link>
        </div>
        <div className="divide-y divide-gray-100">
          {overview.monitors.length === 0 ? (
            <div className="px-6 py-12 text-center text-gray-500">
              No monitors configured.{' '}
              <Link to="/monitors" className="text-indigo-600 hover:underline">
                Add one
              </Link>
            </div>
          ) : (
            overview.monitors.map((monitor) => (
              <div
                key={monitor.id}
                className="px-6 py-4 flex items-center justify-between hover:bg-gray-50 cursor-pointer"
                onClick={() => setSelectedMonitorId(monitor.id)}
              >
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-lg ${statusBgColor(monitor.status)}`}>
                    {monitor.status === 'up' && <CheckCircle className={`h-5 w-5 ${statusColor(monitor.status)}`} />}
                    {monitor.status === 'down' && <AlertCircle className={`h-5 w-5 ${statusColor(monitor.status)}`} />}
                    {monitor.status === 'degraded' && <AlertCircle className={`h-5 w-5 ${statusColor(monitor.status)}`} />}
                    {monitor.status === 'unknown' && <HelpCircle className={`h-5 w-5 ${statusColor(monitor.status)}`} />}
                  </div>
                  <div>
                    <p className="font-medium text-gray-900">{monitor.name}</p>
                    <p className="text-sm text-gray-500">{monitor.type.toUpperCase()}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className={`font-medium ${statusColor(monitor.status)}`}>
                    {monitor.status.charAt(0).toUpperCase() + monitor.status.slice(1)}
                  </p>
                  <p className="text-sm text-gray-500">{monitor.uptime_24h}% uptime</p>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Pending agents alert */}
      {overview.agents_pending > 0 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 flex items-center gap-3">
          <AlertCircle className="h-5 w-5 text-yellow-600" />
          <span className="text-yellow-800">
            {overview.agents_pending} agent{overview.agents_pending > 1 ? 's' : ''} pending approval.{' '}
            <Link to="/agents" className="font-medium underline">
              Review
            </Link>
          </span>
        </div>
      )}
    </div>
  );
}
