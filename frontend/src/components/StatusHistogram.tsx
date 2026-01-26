import { useMemo } from 'react';
import type { StatusHistoryPoint } from '../types';

interface StatusHistogramProps {
  history: StatusHistoryPoint[];
  title: string;
  periodLabel: string;
}

export default function StatusHistogram({ history, title, periodLabel }: StatusHistogramProps) {
  // Aggregate history into buckets based on the time period
  const buckets = useMemo(() => {
    if (!history.length) return [];
    
    // Determine bucket count based on period (aim for ~24-48 bars)
    const bucketCount = Math.min(48, history.length);
    const pointsPerBucket = Math.ceil(history.length / bucketCount);
    
    const aggregated: { status: string; uptime: number; timestamp: string }[] = [];
    
    for (let i = 0; i < history.length; i += pointsPerBucket) {
      const slice = history.slice(i, i + pointsPerBucket);
      if (!slice.length) continue;
      
      const upCount = slice.filter(h => h.status === 'up').length;
      const downCount = slice.filter(h => h.status === 'down').length;
      const degradedCount = slice.filter(h => h.status === 'degraded').length;
      
      let status: string;
      if (downCount > 0) {
        status = 'down';
      } else if (degradedCount > 0) {
        status = 'degraded';
      } else if (upCount > 0) {
        status = 'up';
      } else {
        status = 'unknown';
      }
      
      const uptime = slice.length > 0 ? (upCount / slice.length) * 100 : 0;
      
      aggregated.push({
        status,
        uptime,
        timestamp: slice[0].timestamp,
      });
    }
    
    return aggregated;
  }, [history]);

  // Calculate overall uptime for this period
  const overallUptime = useMemo(() => {
    if (!history.length) return 0;
    const upCount = history.filter(h => h.status === 'up').length;
    return (upCount / history.length) * 100;
  }, [history]);

  const getBarColor = (status: string) => {
    switch (status) {
      case 'up': return 'bg-green-500';
      case 'down': return 'bg-red-500';
      case 'degraded': return 'bg-yellow-500';
      default: return 'bg-gray-300 dark:bg-gray-600';
    }
  };

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  };

  return (
    <div className="histogram-card">
      <div className="histogram-header">
        <h3 className="histogram-title">{title}</h3>
        <span className="histogram-uptime">{overallUptime.toFixed(1)}% uptime</span>
      </div>
      <div className="histogram-chart">
        {buckets.length === 0 ? (
          <div className="histogram-empty">No data for {periodLabel}</div>
        ) : (
          <div className="histogram-bars">
            {buckets.map((bucket, index) => (
              <div
                key={index}
                className="histogram-bar-wrapper group"
                title={`${formatTimestamp(bucket.timestamp)}: ${bucket.uptime.toFixed(1)}% uptime`}
              >
                <div
                  className={`histogram-bar ${getBarColor(bucket.status)}`}
                  style={{ height: `${Math.max(bucket.uptime, 5)}%` }}
                />
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="histogram-footer">
        <span className="histogram-period-label">{periodLabel}</span>
      </div>
    </div>
  );
}
