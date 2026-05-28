import { useEffect, useState, useRef, useCallback } from 'react';

export const useWebSocket = () => {
  const [isConnected, setIsConnected] = useState(false);
  const [gainers, setGainers] = useState([]);
  const [totalSymbols, setTotalSymbols] = useState(0);
  const [lastUpdate, setLastUpdate] = useState(null);
  const wsRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);
  const reconnectAttemptsRef = useRef(0);

  const fetchGainers = useCallback(async () => {
    try {
      const apiUrl = import.meta.env.VITE_API_BASE_URL;
      const response = await fetch(`${apiUrl}/api/gainers?limit=10`);
      const data = await response.json();
      setGainers(data.gainers);
      setLastUpdate(new Date());
    } catch (error) {
      console.error('Error fetching gainers:', error);
    }
  }, []);

  const connectWebSocket = useCallback(() => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      console.log('WebSocket already connected');
      return;
    }

    const wsUrl = import.meta.env.VITE_WS_URL;
    console.log(`Connecting to ${wsUrl}`);

    wsRef.current = new WebSocket(wsUrl);

    wsRef.current.onopen = () => {
      console.log('✅ WebSocket connected');
      setIsConnected(true);
      reconnectAttemptsRef.current = 0;
    };

    wsRef.current.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        if (data.type === 'welcome') {
          console.log('Received welcome message');
          setTotalSymbols(data.status.totalSymbols);
          fetchGainers();
        } else if (data.type === 'manager-status') {
          setTotalSymbols(data.status.totalSymbols);
        } else if (data.type === 'gainers-update') {
          console.log('Received gainers update');
          setGainers(data.gainers);
          setLastUpdate(new Date(data.timestamp));
        }
      } catch (error) {
        console.error('Error parsing WebSocket message:', error);
      }
    };

    wsRef.current.onerror = (error) => {
      console.error('WebSocket error:', error);
    };

    wsRef.current.onclose = () => {
      console.log('❌ WebSocket disconnected');
      setIsConnected(false);
      attemptReconnect();
    };
  }, [fetchGainers]);

  const attemptReconnect = useCallback(() => {
    if (reconnectAttemptsRef.current >= 10) {
      console.error('Max reconnection attempts reached');
      return;
    }

    reconnectAttemptsRef.current++;
    const delay = 2000 * Math.pow(1.5, reconnectAttemptsRef.current - 1);
    console.log(`Reconnecting in ${Math.round(delay / 1000)}s (attempt ${reconnectAttemptsRef.current})...`);

    reconnectTimeoutRef.current = setTimeout(() => {
      connectWebSocket();
    }, delay);
  }, [connectWebSocket]);

  useEffect(() => {
    connectWebSocket();

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [connectWebSocket]);

  const fetchStatus = useCallback(async () => {
    try {
      const apiUrl = import.meta.env.VITE_API_BASE_URL;
      const response = await fetch(`${apiUrl}/api/status`);
      const data = await response.json();
      setTotalSymbols(data.totalSymbols);
    } catch (error) {
      console.error('Error fetching status:', error);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 10000);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  return {
    isConnected,
    gainers,
    totalSymbols,
    lastUpdate,
  };
};
