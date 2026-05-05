// ─────────────────────────────────────────────
// src/live/types.ts
// Types exclusive to the live trading engine
// ─────────────────────────────────────────────

/** A single OHLCV candle as received from the WebSocket */
export interface LiveCandle {
  openTime:  number; // UTC ms
  open:      number;
  high:      number;
  low:       number;
  close:     number;
  volume:    number;
  isClosed:  boolean; // true = candle fully closed, safe to use
}

/** Fully enriched candle with all indicators computed */
export interface LiveProcessedCandle {
  openTime:    number;
  open:        number;
  high:        number;
  low:         number;
  close:       number;
  volume:      number;
  ma20:        number | null;
  ma99:        number | null;
  bbUpper:     number | null;
  bbLower:     number | null;
  trix:        number | null;
  superTrend:  number | null;
  stDirection: number | null;
}

/** The three aligned candles available at any given 1m tick */
export interface LiveCandleContext {
  candle1m:  LiveProcessedCandle;
  candle15m: LiveProcessedCandle;
  candle1h:  LiveProcessedCandle;
}

/** Live wallet — persisted across ticks via liveExecutor */
export interface LiveWallet {
  usdt:    number;
  btc:     number;
  inTrade: boolean;
}

/** Open position tracking */
export interface OpenPosition {
  liveTradeId: number;  // DB row id for update on sell
  buyTime:     number;  // UTC ms
  buyPrice:    number;
  usdtSpent:   number;
  btcNet:      number;
  feeRate:     number;
}
