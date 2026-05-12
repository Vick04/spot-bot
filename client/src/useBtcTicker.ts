import { useEffect, useState } from "react";

const WS_URL = "wss://stream.binance.com:9443/ws/btcusdt@ticker";

export interface Ticker {
  price:   number;
  change:  number;  // 24h change %
  high:    number;  // 24h high
  low:     number;  // 24h low
  volume:  number;  // 24h volume in BTC
}

export function useBtcTicker() {
  const [ticker, setTicker] = useState<Ticker | null>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    let ws: WebSocket;
    let reconnectTimer: ReturnType<typeof setTimeout>;

    function connect() {
      ws = new WebSocket(WS_URL);

      ws.onopen  = () => setConnected(true);
      ws.onclose = () => {
        setConnected(false);
        reconnectTimer = setTimeout(connect, 3000);
      };
      ws.onerror = () => ws.close();

      ws.onmessage = (e) => {
        try {
          const d = JSON.parse(e.data);
          setTicker({
            price:  parseFloat(d.c),
            change: parseFloat(d.P),
            high:   parseFloat(d.h),
            low:    parseFloat(d.l),
            volume: parseFloat(d.v),
          });
        } catch { /* ignore */ }
      };
    }

    connect();
    return () => {
      clearTimeout(reconnectTimer);
      ws?.close();
    };
  }, []);

  return { ticker, connected };
}
