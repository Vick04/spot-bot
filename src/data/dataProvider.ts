// ─────────────────────────────────────────────
// src/data/dataProvider.ts
// Abstract interface for candle data sources
// Allows both live (WebSocket) and simulator (batch) modes
// ─────────────────────────────────────────────

import { ProcessedCandle, RawCandle } from "../core/candle";

/**
 * Data provider for candle streams
 * Abstractly provides candles regardless of source (WebSocket, file, database)
 * Implementors: BinanceWebSocketProvider, FileBacktestProvider, DatabaseBacktestProvider
 */
export interface DataProvider {
  /**
   * Name of the provider for logging
   * Examples: "BinanceWebSocket", "FileBacktest", "DatabaseBacktest"
   */
  readonly name: string;

  /**
   * Load warmup candles for a symbol
   * These are the initial candles needed to calculate indicators before live trading
   * @param symbol - Trading pair (e.g., "BTCUSDT")
   * @returns Array of raw candles (usually 500+ for warmup)
   * @throws Error if loading fails
   */
  loadWarmupCandles(symbol: string): Promise<RawCandle[]>;

  /**
   * Register callback for when a candle is ready
   * The callback is called once per candle close, in chronological order
   * For live mode: called every minute when Binance sends new candle
   * For backtest: called for each candle in the dataset
   *
   * @param callback - Function to call with (symbol, processedCandle)
   */
  onCandle(
    callback: (symbol: string, candle: ProcessedCandle) => Promise<void>
  ): void;

  /**
   * Start the data provider
   * Live mode: connects to WebSocket
   * Backtest: loads dataset and begins processing
   * @throws Error if startup fails
   */
  start(): Promise<void>;

  /**
   * Stop the data provider
   * Live mode: closes WebSocket connection
   * Backtest: ends processing (may be a no-op)
   * @throws Error if shutdown fails
   */
  stop(): Promise<void>;

  /**
   * Check if provider is currently running
   */
  isRunning(): boolean;

  /**
   * Get list of symbols being streamed
   */
  getSymbols(): string[];
}

/**
 * Base class for common data provider functionality
 */
export abstract class BaseDataProvider implements DataProvider {
  protected _name: string;
  protected _symbols: string[];
  protected _running: boolean = false;
  protected _candleCallback:
    | ((symbol: string, candle: ProcessedCandle) => Promise<void>)
    | null = null;

  constructor(name: string, symbols: string[]) {
    this._name = name;
    this._symbols = symbols;
  }

  get name(): string {
    return this._name;
  }

  isRunning(): boolean {
    return this._running;
  }

  getSymbols(): string[] {
    return [...this._symbols];
  }

  onCandle(
    callback: (symbol: string, candle: ProcessedCandle) => Promise<void>
  ): void {
    this._candleCallback = callback;
  }

  abstract loadWarmupCandles(symbol: string): Promise<RawCandle[]>;
  abstract start(): Promise<void>;
  abstract stop(): Promise<void>;

  /**
   * Call the registered candle callback (for subclasses to use)
   */
  protected async emitCandle(symbol: string, candle: ProcessedCandle): Promise<void> {
    if (!this._candleCallback) {
      console.warn(`[${this._name}] No candle callback registered`);
      return;
    }
    try {
      await this._candleCallback(symbol, candle);
    } catch (e) {
      console.error(`[${this._name}] Error processing candle:`, (e as Error).message);
      throw e;
    }
  }
}
