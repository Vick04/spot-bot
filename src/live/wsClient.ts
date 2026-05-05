// ─────────────────────────────────────────────
// src/live/wsClient.ts
// Binance WebSocket client for kline streams.
// Reconnects automatically with exponential backoff.
// Emits "candle" for closed candles.
// Emits "reconnected" after a successful reconnect
// so the engine can re-seed its buffers.
// ─────────────────────────────────────────────

import WebSocket    from "ws";
import { EventEmitter } from "events";
import { LiveCandle }   from "./types";
import { Timeframe }    from "../config/constants";

const BINANCE_WS_BASE = "wss://stream.binance.com:9443/stream";
const PING_INTERVAL_MS = 20_000;

// Backoff: starts at 3s, doubles on each failure, caps at 60s
const RECONNECT_BASE_MS = 3_000;
const RECONNECT_MAX_MS  = 60_000;

export interface CandleEvent {
  timeframe: Timeframe;
  candle:    LiveCandle;
}

export class BinanceWsClient extends EventEmitter {
  private ws:              WebSocket | null = null;
  private pingTimer:       NodeJS.Timeout  | null = null;
  private reconnectTimer:  NodeJS.Timeout  | null = null;
  private reconnecting:    boolean = false;
  private stopped:         boolean = false;
  private isFirstConnect:  boolean = true;
  private failCount:       number  = 0; // consecutive failures for backoff

  constructor(
    private readonly symbol:     string,
    private readonly timeframes: Timeframe[]
  ) {
    super();
    // Prevent unhandled rejection crashes from the WS library
    this.setMaxListeners(20);
  }

  connect(): void {
    this.stopped        = false;
    this.isFirstConnect = true;
    this.failCount      = 0;
    this._open();
  }

  disconnect(): void {
    this.stopped = true;
    this._clearPing();
    this._clearReconnect();
    this.ws?.terminate();
  }

  private _streamUrl(): string {
    const streams = this.timeframes
      .map((tf) => `${this.symbol.toLowerCase()}@kline_${tf}`)
      .join("/");
    return `${BINANCE_WS_BASE}?streams=${streams}`;
  }

  private _backoffMs(): number {
    const ms = RECONNECT_BASE_MS * Math.pow(2, this.failCount);
    return Math.min(ms, RECONNECT_MAX_MS);
  }

  private _open(): void {
    if (this.stopped) return;

    const url = this._streamUrl();
    console.log(`[WS] Connecting to ${url}`);

    try {
      this.ws = new WebSocket(url);
    } catch (err) {
      // WebSocket constructor itself can throw on bad URLs
      console.error("[WS] Failed to create socket:", err);
      this._scheduleReconnect();
      return;
    }

    // Prevent unhandled "error" events from crashing Node
    this.ws.on("error", (err) => {
      console.error("[WS] Error:", err.message);
      // "close" will fire right after — reconnect is handled there
    });

    this.ws.on("open", () => {
      console.log("[WS] Connected");
      this.failCount    = 0; // reset backoff on success
      this.reconnecting = false;
      this._startPing();

      if (!this.isFirstConnect) {
        console.log("[WS] Emitting reconnected — engine will re-seed buffers");
        this.emit("reconnected");
      }
      this.isFirstConnect = false;
    });

    this.ws.on("message", (data: WebSocket.RawData) => {
      try {
        const msg = JSON.parse(data.toString());
        const k   = msg?.data?.k;
        if (!k) return;

        const candle: LiveCandle = {
          openTime: k.t,
          open:     parseFloat(k.o),
          high:     parseFloat(k.h),
          low:      parseFloat(k.l),
          close:    parseFloat(k.c),
          volume:   parseFloat(k.v),
          isClosed: k.x,
        };

        const tf = k.i as Timeframe;

        if (candle.isClosed) {
          this.emit("candle", { timeframe: tf, candle } as CandleEvent);
        }
        this.emit("tick", { timeframe: tf, candle });

      } catch {
        // Malformed frame — ignore
      }
    });

    this.ws.on("ping", () => {
      try { this.ws?.pong(); } catch { /* ignore */ }
    });

    this.ws.on("close", (code, reason) => {
      const r = reason?.toString() || "";
      console.warn(`[WS] Disconnected (${code}${r ? ": " + r : ""})`);
      this._clearPing();
      if (!this.stopped) this._scheduleReconnect();
    });
  }

  private _scheduleReconnect(): void {
    if (this.reconnecting || this.stopped) return;
    this.reconnecting = true;
    this.failCount++;

    const delay = this._backoffMs();
    console.log(`[WS] Reconnecting in ${delay / 1000}s (attempt ${this.failCount})...`);

    this._clearReconnect();
    this.reconnectTimer = setTimeout(() => {
      this.reconnecting = false;
      this._open();
    }, delay);
  }

  private _startPing(): void {
    this._clearPing();
    this.pingTimer = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        try { this.ws.ping(); } catch { /* ignore */ }
      }
    }, PING_INTERVAL_MS);
  }

  private _clearPing(): void {
    if (this.pingTimer) { clearInterval(this.pingTimer); this.pingTimer = null; }
  }

  private _clearReconnect(): void {
    if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null; }
  }
}
