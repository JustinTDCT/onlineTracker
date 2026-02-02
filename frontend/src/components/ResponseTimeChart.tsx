import { useMemo, useState } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';

interface ResponseTimeData {
  timestamp: string;
  response_time_ms: number | null;
  status: string;
}

interface ResponseTimeChartProps {
  data: ResponseTimeData[];
  title?: string;
  okThreshold?: number;
  degradedThreshold?: number;
}

type TimeRangeOption = {
  label: string;
  hours: number;
};

const TIME_RANGE_OPTIONS: TimeRangeOption[] = [
  { label: '1h', hours: 1 },
  { label: '6h', hours: 6 },
  { label: '24h', hours: 24 },
  { label: '7d', hours: 168 },
];

export default function ResponseTimeChart({
  data,
  title = 'Response Time',
  okThreshold,
  degradedThreshold,
}: ResponseTimeChartProps) {
  const [selectedRange, setSelectedRange] = useState<TimeRangeOption>(TIME_RANGE_OPTIONS[2]);

  // Filter data based on selected time range
  const filteredData = useMemo(() => {
    const cutoff = new Date();
    cutoff.setHours(cutoff.getHours() - selectedRange.hours);
    
    return data
      .filter((d) => new Date(d.timestamp) >= cutoff && d.response_time_ms !== null)
      .map((d) => ({
        ...d,
        time: new Date(d.timestamp).getTime(),
        displayTime: formatTime(d.timestamp, selectedRange.hours),
      }));
  }, [data, selectedRange]);

  // Calculate stats
  const stats = useMemo(() => {
    const values = filteredData
      .filter((d) => d.response_time_ms !== null)
      .map((d) => d.response_time_ms as number);
    
    if (values.length === 0) {
      return { avg: 0, min: 0, max: 0 };
    }

    return {
      avg: Math.round(values.reduce((a, b) => a + b, 0) / values.length),
      min: Math.min(...values),
      max: Math.max(...values),
    };
  }, [filteredData]);

  function formatTime(timestamp: string, hours: number): string {
    const date = new Date(timestamp);
    if (hours <= 24) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  }

  function formatTooltipTime(timestamp: string): string {
    return new Date(timestamp).toLocaleString();
  }

  // Custom tooltip
  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="response-chart-tooltip">
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {formatTooltipTime(data.timestamp)}
          </p>
          <p className="text-sm font-medium text-gray-900 dark:text-white">
            {data.response_time_ms}ms
          </p>
          <p className={`text-xs ${
            data.status === 'up' ? 'text-green-500' : 
            data.status === 'degraded' ? 'text-yellow-500' : 
            data.status === 'down' ? 'text-red-500' : 'text-gray-400'
          }`}>
            {data.status?.charAt(0).toUpperCase() + data.status?.slice(1)}
          </p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="response-chart-container">
      <div className="response-chart-header">
        <h3 className="response-chart-title">{title}</h3>
        <div className="response-chart-controls">
          {TIME_RANGE_OPTIONS.map((option) => (
            <button
              key={option.hours}
              onClick={() => setSelectedRange(option)}
              className={`response-chart-range-btn ${
                selectedRange.hours === option.hours ? 'active' : ''
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <div className="response-chart-stats">
        <div className="response-chart-stat">
          <span className="label">Avg</span>
          <span className="value">{stats.avg}ms</span>
        </div>
        <div className="response-chart-stat">
          <span className="label">Min</span>
          <span className="value">{stats.min}ms</span>
        </div>
        <div className="response-chart-stat">
          <span className="label">Max</span>
          <span className="value">{stats.max}ms</span>
        </div>
      </div>

      <div className="response-chart-wrapper">
        {filteredData.length === 0 ? (
          <div className="response-chart-empty">
            No data available for this time range
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={filteredData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="currentColor"
                className="text-gray-200 dark:text-gray-700"
              />
              <XAxis
                dataKey="displayTime"
                tick={{ fontSize: 11 }}
                stroke="currentColor"
                className="text-gray-400 dark:text-gray-500"
                tickLine={false}
                interval="preserveStartEnd"
              />
              <YAxis
                tick={{ fontSize: 11 }}
                stroke="currentColor"
                className="text-gray-400 dark:text-gray-500"
                tickLine={false}
                axisLine={false}
                tickFormatter={(value) => `${value}ms`}
                width={60}
              />
              <Tooltip content={<CustomTooltip />} />
              
              {/* Threshold lines */}
              {okThreshold && (
                <ReferenceLine
                  y={okThreshold}
                  stroke="#22c55e"
                  strokeDasharray="5 5"
                  label={{ value: 'OK', fill: '#22c55e', fontSize: 10 }}
                />
              )}
              {degradedThreshold && (
                <ReferenceLine
                  y={degradedThreshold}
                  stroke="#eab308"
                  strokeDasharray="5 5"
                  label={{ value: 'Degraded', fill: '#eab308', fontSize: 10 }}
                />
              )}

              <Line
                type="monotone"
                dataKey="response_time_ms"
                stroke="#6366f1"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, fill: '#6366f1' }}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
