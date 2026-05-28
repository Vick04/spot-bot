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
    this.subscribedSymbols = new Set();
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
   * Emits 'candle' event with the new candle data
   * @private
   */
  _handleMessage(message) {
    try {
      // Handle kline data from stream
      if (message.data && message.data.k) {
        const k = message.data.k;

        // Only emit closed candles (k.x === true means candle just closed)
        if (k.x === true) {
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
          };

          this.emit("candle", candle);
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
   * Close the WebSocket connection
   */
  close() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.subscribedSymbols.clear();
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
