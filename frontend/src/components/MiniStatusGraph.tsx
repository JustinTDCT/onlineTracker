import type { StatusHistoryPoint } from '../types';

interface Props {
  history: StatusHistoryPoint[];
}

export default function MiniStatusGraph({ history }: Props) {
  const getColor = (status: string, uptime: number) => {
    if (status === 'unknown' || uptime === 0) return 'bg-gray-300 dark:bg-gray-600';
    if (status === 'down' || uptime < 50) return 'bg-red-500';
    if (status === 'degraded' || uptime < 90) return 'bg-yellow-500';
    return 'bg-green-500';
  };

  // Take last 72 points (or fewer if not available)
  const displayPoints = history.slice(-72);

  if (displayPoints.length === 0) {
    return (
      <div className="flex gap-0.5 h-6 rounded overflow-hidden">
        {Array.from({ length: 72 }).map((_, i) => (
          <div key={i} className="flex-1 bg-gray-200 dark:bg-gray-700" />
        ))}
      </div>
    );
  }

  return (
    <div className="flex gap-0.5 h-6 rounded overflow-hidden">
      {displayPoints.map((point, index) => (
        <div
          key={index}
          className={`flex-1 ${getColor(point.status, point.uptime_percent)} hover:opacity-80 transition-opacity`}
          title={`${point.status} - ${point.uptime_percent}%`}
        />
      ))}
    </div>
  );
}
