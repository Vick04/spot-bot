// ─────────────────────────────────────────────
// src/core/candle.ts
// Unified candle type definitions for simulator and live engine
// ─────────────────────────────────────────────

/**
 * Raw candle data from Binance or any data source
 * Contains OHLCV without any technical indicators
 */
export interface RawCandle {
  openTime: number;      // Unix timestamp in milliseconds
  open: number;          // Opening price
  high: number;          // Highest price in period
  low: number;           // Lowest price in period
  close: number;         // Closing price
  volume: number;        // Trading volume
  closeTime: number;     // Unix timestamp when candle closed (openTime + 60_000 for 1m)
}

/**
 * Processed candle with calculated technical indicators
 * Extends RawCandle with indicators calculated from 600-candle rolling window
 */
export interface ProcessedCandle extends RawCandle {
  // Moving averages (calculated over 600-candle window)
  ma20: number | null;       // 20-period moving average
  ma99: number | null;       // 99-period moving average

  // Bollinger Bands (20-period, 1 std dev)
  bbUpper: number | null;    // Upper band
  bbLower: number | null;    // Lower band

  // Trend indicators
  trix: number | null;       // TRIX (19-period)
  superTrend: number | null; // SuperTrend value
  stDirection: number | null; // SuperTrend direction (1 = up, -1 = down, 0 = neutral)

  // Volume indicators
  volAvg: number | null;     // Average volume (20-period)
  volRatio: number | null;   // Current volume / average volume
}

/**
 * Candle buffer for a single symbol
 * Maintains rolling window of latest candles and latest processed candle
 */
export interface CandleBuffer {
  symbol: string;
  candles: RawCandle[];        // Last 600 raw candles (rolling window)
  processed: ProcessedCandle | null; // Latest processed candle with indicators
}

/**
 * Helper function to create empty RawCandle
 */
export function createEmptyRawCandle(openTime: number): RawCandle {
  return {
    openTime,
    open: 0,
    high: 0,
    low: 0,
    close: 0,
    volume: 0,
    closeTime: openTime + 60_000,
  };
}

/**
 * Helper function to convert RawCandle to ProcessedCandle with empty indicators
 */
export function rawToProcessed(raw: RawCandle): ProcessedCandle {
  return {
    ...raw,
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
}
