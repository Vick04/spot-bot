// ─────────────────────────────────────────────
// src/core/types.ts
// Unified types for trading manager, wallet, orders, and configuration
// ─────────────────────────────────────────────

import { ProcessedCandle, RawCandle } from "./candle";
import { SymbolParams } from "../config/constants";

/**
 * Wallet state - tracks USDT and BTC balances
 */
export interface Wallet {
  usdt: number;        // USDT balance (fiat)
  btc: number;         // BTC balance (crypto)
  inTrade: boolean;    // Whether currently holding a position
}

/**
 * Open position information
 * Represents an active buy position waiting to be sold
 */
export interface OpenPosition {
  liveTradeId?: number;      // Database trade ID (live mode only)
  symbol: string;            // Trading pair (e.g., "BTCUSDT")
  buyTime: number;           // Timestamp when bought (ms)
  buyPrice: number;          // Price paid per BTC (USDT)
  usdtSpent: number;         // Total USDT spent
  btcNet: number;            // BTC received after fees
  feeRate: number;           // Fee rate applied
}

/**
 * Active trade with current market info and strategy
 * Used by manager to track open position with latest price
 */
export interface ActiveTrade {
  position: OpenPosition;
  currentPrice: number;      // Latest market price from Binance
  strategy: "up" | "down";   // Which strategy triggered buy
  sellMult: number;          // Sell target multiplier
}

/**
 * Closed trade record
 * Represents a completed buy-sell cycle
 */
export interface ClosedTrade {
  id?: number;
  sessionId?: number;
  symbol: string;
  buyTime: Date;
  buyPrice: number;
  usdtSpent: number;
  btcGross: number;
  feeBtc: number;
  btcNet: number;
  sellTime: Date;
  sellPrice: number;
  usdtGross: number;
  feeUsdt: number;
  usdtNet: number;
  pnlUsdt: number;
  pnlPct: number;
  balanceAfter: number;
}

/**
 * Daily statistics - tracks P&L and trade count for the day
 */
export interface DailyStats {
  date: Date;              // Date in GMT-3
  totalTrades: number;     // Number of trades executed today
  totalPnlUsdt: number;    // Cumulative P&L in USDT
  totalPnlPct: number;     // Cumulative P&L percentage
}

/**
 * Trading configuration
 * Can come from database (live mode) or config file (simulator mode)
 */
export interface TradingConfig {
  upMaxStreak: number;        // Max consecutive up candles for buy signal
  dailyMaxTrades: number;     // Max trades per day (GMT-3)
  dailyMaxPnlPct: number;     // Max P&L% per day before stopping
  feeRate: number;            // Trading fee rate
  initialBalanceUsdt: number; // Starting balance
  symbolParams: Record<string, SymbolParams>; // Per-symbol buy/sell parameters
}

/**
 * Session information (live mode only)
 * Tracks start/end and balance for a trading session
 */
export interface Session {
  id?: number;
  initialBalance: number;
  feeRate: number;
  startedAt?: Date;
  endedAt?: Date;
  finalBalance?: number;
}

/**
 * Event emitted by TradingManager
 * Used for communication with data providers and API server
 */
export type ManagerEvent =
  | { type: "price"; symbol: string; price: number; timestamp: number }
  | { type: "buy"; symbol: string; price: number; timestamp: number; btcAmount: number }
  | { type: "sell"; symbol: string; price: number; timestamp: number; pnl: number; pnlPct: number }
  | { type: "config"; config: TradingConfig }
  | { type: "status"; running: boolean; balance: number; inTrade: boolean }
  | { type: "daily_limit"; reason: "max_trades" | "max_pnl" };

/**
 * Candle stream source (data provider)
 * Abstract interface for candle data sources
 */
export interface CandleSource {
  name: string; // e.g., "BinanceWebSocket", "FileBacktest", "DatabaseBacktest"

  // Load initial warmup candles
  loadWarmupCandles(symbol: string): Promise<RawCandle[]>;

  // Start providing candles
  start(): Promise<void>;

  // Stop providing candles
  stop(): Promise<void>;

  // Register callback for new candles
  onCandle(callback: (symbol: string, candle: ProcessedCandle) => Promise<void>): void;
}

/**
 * Order executor (execution layer)
 * Abstract interface for executing buy/sell orders
 */
export interface OrderExecutor {
  name: string; // e.g., "LiveExecutor", "SimulatorExecutor"

  // Execute buy order
  executeBuy(
    symbol: string,
    price: number,
    timeMs: number,
    wallet: Wallet
  ): Promise<OpenPosition>;

  // Execute sell order
  executeSell(
    symbol: string,
    price: number,
    timeMs: number,
    position: OpenPosition,
    wallet: Wallet
  ): Promise<void>;

  // Persist session state
  persistSession(session: Session): Promise<void>;
}
