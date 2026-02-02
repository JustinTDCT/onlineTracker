import { Link } from 'react-router-dom';
import type { Monitor } from '../types';

interface MonitorSidebarItemProps {
  monitor: Monitor;
  isActive: boolean;
}

export default function MonitorSidebarItem({ monitor, isActive }: MonitorSidebarItemProps) {
  const status = monitor.latest_status?.status;

  const statusDot = () => {
    switch (status) {
      case 'up': return 'bg-green-500';
      case 'down': return 'bg-red-500';
      case 'degraded': return 'bg-yellow-500';
      default: return 'bg-gray-400';
    }
  };


  return (
    <Link
      to={`/monitor/${monitor.id}`}
      className={`sidebar-monitor-item ${isActive ? 'sidebar-monitor-item-active' : ''}`}
    >
      <div className="flex items-center gap-3 min-w-0">
        <div className={`sidebar-status-dot ${statusDot()}`} />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium text-gray-900 dark:text-white truncate">
            {monitor.name}
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
            {monitor.type.toUpperCase()}
          </div>
        </div>
      </div>
      <div className="text-right shrink-0">
        {monitor.type === 'ssl' ? (
          <span className="text-xs text-gray-500 dark:text-gray-400">
            {monitor.latest_status?.ssl_expiry_days !== undefined
              ? `${monitor.latest_status.ssl_expiry_days}d`
              : '-'}
          </span>
        ) : (
          <span className="text-xs text-gray-500 dark:text-gray-400">
            {monitor.latest_status?.response_time_ms !== undefined
              ? `${monitor.latest_status.response_time_ms}ms`
              : '-'}
          </span>
        )}
      </div>
    </Link>
  );
}
