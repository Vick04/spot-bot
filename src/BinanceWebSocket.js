// ─────────────────────────────────────────────
// src/BinanceWebSocket.js
// Binance WebSocket connection for real-time 1m candles
// ─────────────────────────────────────────────

const WebSocket = require("ws");
const EventEmitter = require("events");

const BINANCE_WS_URL = "wss://stream.binance.com:9443/stream";

class BinanceWebSocket extends EventEmitter {
  constructor() {
    super();
    this.ws = null;
    this.subscribedSymbols = new Set(); // 1m klines
    this.subscribedSymbols1s = new Set(); // 1s klines for active orders
    this._reconnectAttempts = 0;
    this._maxReconnectAttempts = 5;
    this._reconnectDelay = 3000; // ms
  }

  /**
   * Connect to Binance WebSocket and subscribe to symbols
   * @param {Array<string>} symbols - Array of symbols to subscribe (e.g., ['BTCUSDT', 'ETHUSDT'])
   */
  async connect(symbols) {
    return new Promise((resolve, reject) => {
      try {
        // Build stream URL with all symbols
        const streams = symbols.map((symbol) => `${symbol.toLowerCase()}@kline_1m`).join('/');
        const wsUrl = `${BINANCE_WS_URL}?streams=${streams}`;

        console.log(`[BinanceWS] Connecting to Binance WebSocket with ${symbols.length} symbols...`);

        this.ws = new WebSocket(wsUrl);

        this.ws.on("open", () => {
          console.log("[BinanceWS] ✅ Connected");
          this._reconnectAttempts = 0;
          this.subscribedSymbols = new Set(symbols);
          console.log(`[BinanceWS] Subscribed to ${symbols.length} symbols (via URL)`);
          resolve();
        });

        this.ws.on("message", (data) => {
          try {
            const message = JSON.parse(data);
            this._handleMessage(message);
          } catch (error) {
            console.error("[BinanceWS] Error parsing message:", error.message);
          }
        });

        this.ws.on("error", (error) => {
          console.error("[BinanceWS] Error:", error.message);
          reject(error);
        });

        this.ws.on("close", () => {
          console.log("[BinanceWS] ❌ Disconnected");
          this._attemptReconnect(symbols);
        });
      } catch (error) {
        reject(error);
      }
    });
  }


  /**
   * Handle incoming WebSocket messages
   * Differentiates between 1m and 1s candles
   * Emits 'candle' for 1m and 'candle1s' for 1s
   * @private
   */
  _handleMessage(message) {
    try {
      // Handle kline data from stream
      if (message.data && message.data.k) {
        const k = message.data.k;
        const interval = k.i; // "1m", "1s", etc.

        // Build candle object
        const candle = {
          symbol: k.s,
          openTime: k.t,
          open: parseFloat(k.o),
          high: parseFloat(k.h),
          low: parseFloat(k.l),
          close: parseFloat(k.c),
          volume: parseFloat(k.v),
          closeTime: k.T,
          quoteAssetVolume: parseFloat(k.q),
          takerBuyBaseAssetVolume: parseFloat(k.V), // Buy volume for buy ratio calculation
          interval: interval,
        };

        // For 1m candles: emit only when closed
        if (interval === "1m" && k.x === true) {
          this.emit("candle", candle);
        }
        // For 1s candles: emit for any new price (don't wait for close)
        else if (interval === "1s") {
          this.emit("candle1s", candle);
        }
      }
    } catch (error) {
      console.error("[BinanceWS] Error handling message:", error.message);
    }
  }

  /**
   * Attempt to reconnect with exponential backoff
   * @private
   */
  _attemptReconnect(symbols) {
    if (this._reconnectAttempts >= this._maxReconnectAttempts) {
      console.error(
        `[BinanceWS] Max reconnection attempts reached (${this._maxReconnectAttempts})`
      );
      this.emit("error", new Error("Max reconnection attempts reached"));
      return;
    }

    this._reconnectAttempts++;
    const delay = this._reconnectDelay * Math.pow(2, this._reconnectAttempts - 1);
    console.log(
      `[BinanceWS] Attempting reconnection in ${delay}ms (attempt ${this._reconnectAttempts}/${this._maxReconnectAttempts})...`
    );

    setTimeout(() => {
      this.connect(symbols).catch((error) => {
        console.error("[BinanceWS] Reconnection failed:", error.message);
      });
    }, delay);
  }

  /**
   * Subscribe to 1-second candles for active order monitoring
   * Uses dynamic subscription on existing WebSocket connection
   *
   * @param {string} symbol - Symbol to subscribe (e.g., 'BTCUSDT')
   */
  subscribe1s(symbol) {
    if (!this.isConnected) {
      console.warn(`[BinanceWS] Cannot subscribe to 1s - not connected`);
      return;
    }

    if (this.subscribedSymbols1s.has(symbol)) {
      console.warn(`[BinanceWS] Already subscribed to 1s for ${symbol}`);
      return;
    }

    const stream = `${symbol.toLowerCase()}@kline_1s`;
    const message = {
      method: "SUBSCRIBE",
      params: [stream],
      id: Date.now(),
    };

    try {
      this.ws.send(JSON.stringify(message));
      this.subscribedSymbols1s.add(symbol);
      console.log(`[BinanceWS] ✅ Subscribed to 1s candles for ${symbol}`);
    } catch (error) {
      console.error(`[BinanceWS] Failed to subscribe 1s for ${symbol}:`, error.message);
    }
  }

  /**
   * Unsubscribe from 1-second candles when order closes
   *
   * @param {string} symbol - Symbol to unsubscribe
   */
  unsubscribe1s(symbol) {
    if (!this.isConnected) {
      console.warn(`[BinanceWS] Cannot unsubscribe from 1s - not connected`);
      return;
    }

    if (!this.subscribedSymbols1s.has(symbol)) {
      console.warn(`[BinanceWS] Not subscribed to 1s for ${symbol}`);
      return;
    }

    const stream = `${symbol.toLowerCase()}@kline_1s`;
    const message = {
      method: "UNSUBSCRIBE",
      params: [stream],
      id: Date.now(),
    };

    try {
      this.ws.send(JSON.stringify(message));
      this.subscribedSymbols1s.delete(symbol);
      console.log(`[BinanceWS] ✅ Unsubscribed from 1s candles for ${symbol}`);
    } catch (error) {
      console.error(`[BinanceWS] Failed to unsubscribe 1s for ${symbol}:`, error.message);
    }
  }

  /**
   * Close the WebSocket connection
   */
  close() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.subscribedSymbols.clear();
    this.subscribedSymbols1s.clear();
    console.log("[BinanceWS] Connection closed");
  }

  /**
   * Check if connected
   */
  get isConnected() {
    return this.ws && this.ws.readyState === WebSocket.OPEN;
  }

  /**
   * Get subscribed symbols count
   */
  get subscribedCount() {
    return this.subscribedSymbols.size;
  }
}

module.exports = BinanceWebSocket;
