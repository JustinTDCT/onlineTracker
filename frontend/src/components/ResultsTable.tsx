import { useState, useEffect, useCallback } from 'react';
import { ChevronLeft, ChevronRight, CheckCircle, AlertCircle, HelpCircle, Calendar } from 'lucide-react';
import { getMonitorResults } from '../api/client';
import type { MonitorResult, ResultsPage } from '../types';

interface ResultsTableProps {
  monitorId: number;
  monitorType: string;
}

type TimeRange = {
  label: string;
  hours: number;
};

const TIME_RANGES: TimeRange[] = [
  { label: 'Last 24 Hours', hours: 24 },
  { label: 'Last Week', hours: 168 },
  { label: 'Last Month', hours: 720 },
  { label: 'Last 3 Months', hours: 2160 },
  { label: 'Last Year', hours: 8760 },
];

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

export default function ResultsTable({ monitorId, monitorType }: ResultsTableProps) {
  const [results, setResults] = useState<MonitorResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedRange, setSelectedRange] = useState<TimeRange>(TIME_RANGES[0]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  const loadResults = useCallback(async () => {
    try {
      setLoading(true);
      const data: ResultsPage = await getMonitorResults(
        monitorId,
        selectedRange.hours,
        page,
        pageSize
      );
      setResults(data.items);
      setTotalPages(data.total_pages);
      setTotal(data.total);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load results');
    } finally {
      setLoading(false);
    }
  }, [monitorId, selectedRange.hours, page, pageSize]);

  useEffect(() => {
    loadResults();
  }, [loadResults]);

  useEffect(() => {
    setPage(1);
  }, [selectedRange, pageSize]);

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleString();
  };

  const statusColor = (status: string) => {
    switch (status) {
      case 'up': return 'text-green-500';
      case 'down': return 'text-red-500';
      case 'degraded': return 'text-yellow-500';
      default: return 'text-gray-400';
    }
  };

  const statusBgColor = (status: string) => {
    switch (status) {
      case 'up': return 'bg-green-100 dark:bg-green-900/30';
      case 'down': return 'bg-red-100 dark:bg-red-900/30';
      case 'degraded': return 'bg-yellow-100 dark:bg-yellow-900/30';
      default: return 'bg-gray-100 dark:bg-gray-800';
    }
  };

  const statusIcon = (status: string) => {
    const className = `h-4 w-4 ${statusColor(status)}`;
    switch (status) {
      case 'up': return <CheckCircle className={className} />;
      case 'down': return <AlertCircle className={className} />;
      case 'degraded': return <AlertCircle className={className} />;
      default: return <HelpCircle className={className} />;
    }
  };

  const startIndex = (page - 1) * pageSize + 1;
  const endIndex = Math.min(page * pageSize, total);

  return (
    <div className="results-table-container">
      <div className="results-table-header">
        <h3 className="results-table-title">Check Results</h3>
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-gray-400" />
          <select
            value={selectedRange.hours}
            onChange={(e) => {
              const range = TIME_RANGES.find(r => r.hours === Number(e.target.value));
              if (range) setSelectedRange(range);
            }}
            className="results-table-select"
          >
            {TIME_RANGES.map((range) => (
              <option key={range.hours} value={range.hours}>
                {range.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {loading ? (
        <div className="results-table-loading">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-600"></div>
        </div>
      ) : error ? (
        <div className="results-table-error">{error}</div>
      ) : results.length === 0 ? (
        <div className="results-table-empty">No results for the selected time range.</div>
      ) : (
        <>
          <table className="results-table">
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>Status</th>
                {monitorType === 'ssl' ? (
                  <th>SSL Expiry</th>
                ) : (
                  <th>Response Time</th>
                )}
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              {results.map((result) => (
                <tr key={result.id}>
                  <td className="results-table-timestamp">
                    {formatTimestamp(result.checked_at)}
                  </td>
                  <td>
                    <span className={`results-table-status ${statusBgColor(result.status)}`}>
                      {statusIcon(result.status)}
                      <span className={statusColor(result.status)}>
                        {result.status.charAt(0).toUpperCase() + result.status.slice(1)}
                      </span>
                    </span>
                  </td>
                  <td className="results-table-response">
                    {monitorType === 'ssl' ? (
                      result.ssl_expiry_days !== undefined ? `${result.ssl_expiry_days} days` : '-'
                    ) : (
                      result.response_time_ms !== undefined ? `${result.response_time_ms} ms` : '-'
                    )}
                  </td>
                  <td className="results-table-details">
                    {result.details || '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="pagination">
            <div className="pagination-info">
              Showing {startIndex}-{endIndex} of {total}
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
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="pagination-btn"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="text-sm text-gray-600 dark:text-gray-300">
                Page {page} of {totalPages}
              </span>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="pagination-btn"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
