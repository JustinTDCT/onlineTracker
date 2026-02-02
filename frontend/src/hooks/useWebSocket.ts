import { useEffect, useRef, useState, useCallback } from 'react';

export interface StatusUpdate {
  type: 'status_update';
  monitor_id: number;
  monitor_name: string;
  status: 'up' | 'down' | 'degraded' | 'unknown';
  response_time_ms?: number;
  ssl_expiry_days?: number;
  details?: string;
  checked_at: string;
}

type WebSocketMessage = StatusUpdate;

interface UseWebSocketOptions {
  onStatusUpdate?: (update: StatusUpdate) => void;
  reconnectInterval?: number;
  maxReconnectAttempts?: number;
}

interface UseWebSocketReturn {
  isConnected: boolean;
  connectionState: 'connecting' | 'connected' | 'disconnected' | 'error';
  reconnectAttempts: number;
}

export function useWebSocket(options: UseWebSocketOptions = {}): UseWebSocketReturn {
  const {
    onStatusUpdate,
    reconnectInterval = 3000,
    maxReconnectAttempts = 10,
  } = options;

  const [isConnected, setIsConnected] = useState(false);
  const [connectionState, setConnectionState] = useState<'connecting' | 'connected' | 'disconnected' | 'error'>('disconnected');
  const [reconnectAttempts, setReconnectAttempts] = useState(0);
  
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const onStatusUpdateRef = useRef(onStatusUpdate);

  // Keep the callback ref up to date
  useEffect(() => {
    onStatusUpdateRef.current = onStatusUpdate;
  }, [onStatusUpdate]);

  const connect = useCallback(() => {
    // Don't reconnect if we've exceeded max attempts
    if (reconnectAttempts >= maxReconnectAttempts) {
      setConnectionState('error');
      return;
    }

    // Clean up existing connection
    if (wsRef.current) {
      wsRef.current.close();
    }

    setConnectionState('connecting');

    // Determine WebSocket URL based on current page location
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;

    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setIsConnected(true);
        setConnectionState('connected');
        setReconnectAttempts(0);
        console.log('WebSocket connected');

        // Start ping interval to keep connection alive
        pingIntervalRef.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send('ping');
          }
        }, 30000);
      };

      ws.onmessage = (event) => {
        try {
          const message: WebSocketMessage = JSON.parse(event.data);
          
          if (message.type === 'status_update' && onStatusUpdateRef.current) {
            onStatusUpdateRef.current(message);
          }
        } catch (e) {
          console.error('Failed to parse WebSocket message:', e);
        }
      };

      ws.onclose = (event) => {
        setIsConnected(false);
        setConnectionState('disconnected');
        console.log('WebSocket closed:', event.code, event.reason);

        // Clear ping interval
        if (pingIntervalRef.current) {
          clearInterval(pingIntervalRef.current);
          pingIntervalRef.current = null;
        }

        // Schedule reconnection
        if (reconnectAttempts < maxReconnectAttempts) {
          reconnectTimeoutRef.current = setTimeout(() => {
            setReconnectAttempts((prev) => prev + 1);
            connect();
          }, reconnectInterval);
        }
      };

      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        setConnectionState('error');
      };
    } catch (e) {
      console.error('Failed to create WebSocket:', e);
      setConnectionState('error');
    }
  }, [reconnectAttempts, reconnectInterval, maxReconnectAttempts]);

  useEffect(() => {
    connect();

    return () => {
      // Cleanup on unmount
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (pingIntervalRef.current) {
        clearInterval(pingIntervalRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, []); // Only run on mount

  return {
    isConnected,
    connectionState,
    reconnectAttempts,
  };
}
