import { useCallback, useEffect, useRef, useState } from 'react';

export function useWebSocket(onMessage) {
  const wsRef = useRef(null);
  const reconnectTimerRef = useRef(null);
  const onMessageRef = useRef(onMessage);
  const [status, setStatus] = useState('disconnected');

  useEffect(() => {
    onMessageRef.current = onMessage;
  }, [onMessage]);

  const connect = useCallback(() => {
    const token = sessionStorage.getItem('access_token');
    if (!token || !import.meta.env.VITE_WS_URL) {
      return;
    }

    setStatus('connecting');
    const socket = new WebSocket(`${import.meta.env.VITE_WS_URL}?token=${token}`);
    wsRef.current = socket;

    socket.onopen = () => {
      setStatus('connected');
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
    };

    socket.onmessage = (event) => {
      try {
        onMessageRef.current(JSON.parse(event.data));
      } catch (error) {
        console.error('WebSocket message parsing failed', error);
      }
    };

    socket.onclose = (event) => {
      setStatus('disconnected');
      if (event.code !== 1000) {
        reconnectTimerRef.current = setTimeout(connect, 3000);
      }
    };

    socket.onerror = (error) => {
      console.error('WebSocket error', error);
      setStatus('error');
    };
  }, []);

  useEffect(() => {
    connect();
    return () => {
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
      }
      wsRef.current?.close(1000);
    };
  }, [connect]);

  const send = useCallback((data) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(data));
      return true;
    }
    return false;
  }, []);

  return { send, wsRef, status, reconnect: connect };
}
