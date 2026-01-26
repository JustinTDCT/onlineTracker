import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, CheckCircle, AlertCircle, HelpCircle, Clock, Activity } from 'lucide-react';
import { getMonitor, getMonitorHistory } from '../api/client';
import type { Monitor, StatusHistoryPoint } from '../types';
import StatusHistogram from './StatusHistogram';
import ResultsTable from './ResultsTable';

interface HistoryData {
  hours24: StatusHistoryPoint[];
  week: StatusHistoryPoint[];
  month: StatusHistoryPoint[];
  year: StatusHistoryPoint[];
}

export default function MonitorDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [monitor, setMonitor] = useState<Monitor | null>(null);
  const [history, setHistory] = useState<HistoryData>({ hours24: [], week: [], month: [], year: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    loadMonitor(Number(id));
  }, [id]);

  async function loadMonitor(monitorId: number) {
    try {
      setLoading(true);
      const [monitorData, h24, hWeek, hMonth, hYear] = await Promise.all([
        getMonitor(monitorId),
        getMonitorHistory(monitorId, 24),
        getMonitorHistory(monitorId, 168),
        getMonitorHistory(monitorId, 720),
        getMonitorHistory(monitorId, 8760),
      ]);
      setMonitor(monitorData);
      setHistory({ hours24: h24, week: hWeek, month: hMonth, year: hYear });
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load monitor');
    } finally {
      setLoading(false);
    }
  }

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
    const className = `h-6 w-6 ${statusColor(status)}`;
    switch (status) {
      case 'up': return <CheckCircle className={className} />;
      case 'down': return <AlertCircle className={className} />;
      case 'degraded': return <AlertCircle className={className} />;
      default: return <HelpCircle className={className} />;
    }
  };

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleString();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  if (error || !monitor) {
    return (
      <div className="space-y-4">
        <button onClick={() => navigate('/')} className="flex items-center gap-2 text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white">
          <ArrowLeft className="h-4 w-4" />
          Back to Dashboard
        </button>
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 text-red-700 dark:text-red-400">
          {error || 'Monitor not found'}
        </div>
      </div>
    );
  }

  const currentStatus = monitor.latest_status;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <button onClick={() => navigate('/')} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{monitor.name}</h1>
            <span className="px-2 py-1 text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded">
              {monitor.type.toUpperCase()}
            </span>
          </div>
          {monitor.description && <p className="text-gray-500 dark:text-gray-400 mt-1">{monitor.description}</p>}
          <p className="text-sm text-gray-400 dark:text-gray-500">{monitor.target}</p>
        </div>
      </div>

      <div className="monitor-detail-status-card">
        <div className="flex items-center gap-4">
          <div className={`p-3 rounded-xl ${statusBgColor(currentStatus?.status)}`}>
            {statusIcon(currentStatus?.status)}
          </div>
          <div>
            <p className="text-sm text-gray-500 dark:text-gray-400">Current Status</p>
            <p className={`text-xl font-bold ${statusColor(currentStatus?.status)}`}>
              {currentStatus?.status ? currentStatus.status.charAt(0).toUpperCase() + currentStatus.status.slice(1) : 'Unknown'}
            </p>
          </div>
        </div>
        <div className="monitor-detail-status-metrics">
          {monitor.type === 'ssl' ? (
            <div className="monitor-detail-metric">
              <Clock className="h-5 w-5 text-gray-400" />
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">SSL Expiry</p>
                <p className="font-medium text-gray-900 dark:text-white">{currentStatus?.ssl_expiry_days !== undefined ? `${currentStatus.ssl_expiry_days} days` : '-'}</p>
              </div>
            </div>
          ) : (
            <div className="monitor-detail-metric">
              <Activity className="h-5 w-5 text-gray-400" />
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">Response Time</p>
                <p className="font-medium text-gray-900 dark:text-white">{currentStatus?.response_time_ms !== undefined ? `${currentStatus.response_time_ms} ms` : '-'}</p>
              </div>
            </div>
          )}
          <div className="monitor-detail-metric">
            <Clock className="h-5 w-5 text-gray-400" />
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Last Checked</p>
              <p className="font-medium text-gray-900 dark:text-white">{formatDate(currentStatus?.checked_at)}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="monitor-detail-section">
        <h2 className="monitor-detail-section-title">Uptime History</h2>
        <div className="histogram-grid">
          <StatusHistogram history={history.hours24} title="Last 24 Hours" periodLabel="24 hours" />
          <StatusHistogram history={history.week} title="Last Week" periodLabel="7 days" />
          <StatusHistogram history={history.month} title="Last Month" periodLabel="30 days" />
          <StatusHistogram history={history.year} title="Last Year" periodLabel="365 days" />
        </div>
      </div>

      <div className="monitor-detail-section">
        <ResultsTable monitorId={monitor.id} monitorType={monitor.type} />
      </div>
    </div>
  );
}
