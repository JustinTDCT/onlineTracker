import type { StatusHistoryPoint } from '../types';

interface Props {
  history: StatusHistoryPoint[];
}

export default function StatusGraph({ history }: Props) {
  // Calculate segment width based on number of points
  const segmentWidth = Math.max(2, Math.floor(100 / history.length));

  const getColor = (status: string, uptime: number) => {
    if (status === 'unknown' || uptime === 0) return 'bg-gray-200';
    if (status === 'down' || uptime < 50) return 'bg-red-500';
    if (status === 'degraded' || uptime < 90) return 'bg-yellow-500';
    return 'bg-green-500';
  };

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // Group history into chunks for display
  const displayPoints = history.slice(-96); // Last 24 hours at 15-min intervals

  return (
    <div className="space-y-2">
      {/* Status bar */}
      <div className="flex gap-0.5 h-10 rounded-lg overflow-hidden">
        {displayPoints.map((point, index) => (
          <div
            key={index}
            className={`flex-1 ${getColor(point.status, point.uptime_percent)} hover:opacity-80 transition-opacity cursor-pointer group relative`}
            title={`${formatTime(point.timestamp)}\n${point.status} - ${point.uptime_percent}% uptime`}
          >
            {/* Tooltip */}
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block z-10">
              <div className="bg-gray-900 text-white text-xs rounded-lg px-3 py-2 whitespace-nowrap shadow-lg">
                <p className="font-medium">{formatTime(point.timestamp)}</p>
                <p className="text-gray-300">
                  {point.status.charAt(0).toUpperCase() + point.status.slice(1)} - {point.uptime_percent}%
                </p>
                {point.response_time_avg_ms && (
                  <p className="text-gray-300">{point.response_time_avg_ms}ms avg</p>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Time labels */}
      <div className="flex justify-between text-xs text-gray-500">
        <span>72 hours ago</span>
        <span>48 hours ago</span>
        <span>24 hours ago</span>
        <span>Now</span>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 text-xs text-gray-600 pt-2">
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded bg-green-500"></div>
          <span>Up</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded bg-yellow-500"></div>
          <span>Degraded</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded bg-red-500"></div>
          <span>Down</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded bg-gray-200"></div>
          <span>No data</span>
        </div>
      </div>
    </div>
  );
}
