// ─────────────────────────────────────────────
// src/api/wsEventBus.ts
// Global event bus for broadcasting WebSocket events to connected clients
// ─────────────────────────────────────────────

import { EventEmitter } from "events";
import { BotConfigValues } from "../live/multiLiveManager";

export class WSEventBus extends EventEmitter {
  // Price update: { symbol, price, timestamp }
  broadcastPrice(symbol: string, price: number): void {
    this.emit("price", { symbol, price, timestamp: Date.now() });
  }

  // Status update: full status object (running, balance, activeTrade, etc)
  broadcastStatus(status: any): void {
    this.emit("status", { ...status, timestamp: Date.now() });
  }

  // Config update: updated config values
  broadcastConfig(config: BotConfigValues): void {
    this.emit("config", { ...config, timestamp: Date.now() });
  }

  // Watchlist update: changed symbols
  broadcastWatchlist(symbols: Array<{ symbol: string; lastPrice: number | null }>): void {
    this.emit("watchlist", { symbols, timestamp: Date.now() });
  }

  // Trade update: new closed trade
  broadcastTrade(trade: any): void {
    this.emit("trade", { ...trade, timestamp: Date.now() });
  }
}

export const wsEventBus = new WSEventBus();
