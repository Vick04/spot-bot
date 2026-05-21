// ─────────────────────────────────────────────
// src/data/sources/live.ts
// Live data provider using Binance WebSocket streams
// Refactored from src/liveMulti.ts and BinanceWsClient
// ─────────────────────────────────────────────

import WebSocket from "ws";
import { BaseDataProvider } from "../dataProvider";
import { RawCandle, ProcessedCandle } from "../../core/candle";
import { CANDLE_INTERVAL_MS, WARMUP_CANDLES, BINANCE_BASE_URL } from "../../config/constants";
import { prisma } from "../../db/prismaClient";

/**
 * Live data provider using Binance WebSocket
 * Subscribes to 1-minute klines for multiple symbols
 */
export class BinanceWebSocketProvider extends BaseDataProvider {
  private _ws: WebSocket | null = null;
  private _reconnectAttempts = 0;
  private _maxReconnectAttempts = 10;
  private _reconnectDelay = 5000;
  private _heartbeatInterval: NodeJS.Timeout | null = null;

  constructor(symbols: string[]) {
    super("BinanceWebSocket", symbols);
  }

  async loadWarmupCandles(symbol: string): Promise<RawCandle[]> {
    try {
      console.log(`[${this._name}] Loading ${WARMUP_CANDLES} warmup candles for ${symbol}...`);

      // Try to load from database first
      const rows = await (prisma.symbolCandle1m as any).findMany({
        where: { symbol },
        orderBy: { openTime: "desc" },
        take: WARMUP_CANDLES,
      });

      if (rows.length >= WARMUP_CANDLES) {
        console.log(`[${this._name}] Loaded ${rows.length} warmup candles from database`);
        return rows
          .reverse()
          .map((r: any) => ({
            openTime: Number(r.openTime),
            open: r.open,
            high: r.high,
            low: r.low,
            close: r.close,
            volume: r.volume,
            closeTime: Number(r.closeTime),
          }));
      }

      // Fall back to fetching from Binance API
      console.log(`[${this._name}] Database has ${rows.length} candles, fetching from Binance API...`);
      const candles = await this._fetchFromBinanceAPI(symbol, WARMUP_CANDLES);
      console.log(`[${this._name}] Fetched ${candles.length} candles from Binance API`);
      return candles;
    } catch (e) {
      const err = (e as Error).message;
      console.error(`[${this._name}] Failed to load warmup candles for ${symbol}: ${err}`);
      throw e;
    }
  }

  async start(): Promise<void> {
    if (this._running) {
      console.warn(`[${this._name}] Already running`);
      return;
    }

    try {
      console.log(`[${this._name}] Starting...`);
      this._connect();
      this._running = true;
      console.log(`[${this._name}] Started`);
    } catch (e) {
      console.error(`[${this._name}] Failed to start:`, (e as Error).message);
      throw e;
    }
  }

  async stop(): Promise<void> {
    if (!this._running) return;

    console.log(`[${this._name}] Stopping...`);
    this._running = false;

    if (this._heartbeatInterval) {
      clearInterval(this._heartbeatInterval);
      this._heartbeatInterval = null;
    }

    if (this._ws) {
      this._ws.close();
      this._ws = null;
    }

    console.log(`[${this._name}] Stopped`);
  }

  private _connect(): void {
    const streams = this._symbols.map((s) => `${s.toLowerCase()}@kline_1m`).join("/");
    const wsUrl = `wss://stream.binance.com:9443/stream?streams=${streams}`;

    console.log(`[${this._name}] Connecting to Binance WebSocket...`);

    this._ws = new WebSocket(wsUrl);

    this._ws.on("open", () => {
      console.log(`[${this._name}] ✅ Connected to Binance`);
      this._reconnectAttempts = 0;

      // Heartbeat to detect connection issues
      this._heartbeatInterval = setInterval(() => {
        if (this._ws && this._ws.readyState === WebSocket.OPEN) {
          this._ws.ping();
        }
      }, 30_000);
    });

    this._ws.on("message", (data: string) => {
      try {
        const msg = JSON.parse(data);
        if (msg.stream && msg.data.e === "kline") {
          this._handleKline(msg.data);
        }
      } catch (e) {
        console.error(`[${this._name}] Failed to parse WebSocket message:`, (e as Error).message);
      }
    });

    this._ws.on("error", (e: Error) => {
      console.error(`[${this._name}] ❌ WebSocket error:`, e.message);
    });

    this._ws.on("close", () => {
      console.log(`[${this._name}] ❌ Disconnected from Binance`);
      this._ws = null;

      if (this._heartbeatInterval) {
        clearInterval(this._heartbeatInterval);
        this._heartbeatInterval = null;
      }

      if (this._running && this._reconnectAttempts < this._maxReconnectAttempts) {
        this._reconnectAttempts++;
        const delay = this._reconnectDelay * this._reconnectAttempts;
        console.log(
          `[${this._name}] Reconnecting in ${delay}ms (attempt ${this._reconnectAttempts}/${this._maxReconnectAttempts})...`
        );
        setTimeout(() => this._connect(), delay);
      }
    });
  }

  private _handleKline(klineData: any): void {
    const k = klineData.k;
    const symbol = k.s;

    if (!this._symbols.includes(symbol)) {
      return; // Ignore symbols we don't care about
    }

    // Only process closed candles (k.x = true)
    if (!k.x) return;

    const rawCandle: RawCandle = {
      openTime: k.t,
      open: parseFloat(k.o),
      high: parseFloat(k.h),
      low: parseFloat(k.l),
      close: parseFloat(k.c),
      volume: parseFloat(k.v),
      closeTime: k.T,
    };

    // Process indicators (this would need the last 600 candles in a real implementation)
    // For now, just emit raw candle and let manager handle indicator calculation
    const processed: ProcessedCandle = {
      ...rawCandle,
      ma20: null,
      ma99: null,
      bbUpper: null,
      bbLower: null,
      trix: null,
      superTrend: null,
      stDirection: null,
      volAvg: null,
      volRatio: null,
    };

    // Emit to callback without awaiting (fire and forget for live mode)
    this.emitCandle(symbol, processed).catch((e) => {
      console.error(`[${this._name}] Error emitting candle:`, (e as Error).message);
    });
  }

  private async _fetchFromBinanceAPI(symbol: string, limit: number): Promise<RawCandle[]> {
    // This would call Binance REST API to fetch historical candles
    // For now, return empty array (would be implemented in full refactoring)
    console.log(`[${this._name}] Note: Binance API fetch not yet implemented`);
    return [];
  }
}
