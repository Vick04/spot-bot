// ─────────────────────────────────────────────
// src/simulator/types.ts
// Shared types for the simulation engine
// ─────────────────────────────────────────────

import { ProcessedCandle } from "../processors/candleProcessor";

/** Snapshot of the wallet at any point in time */
export interface WalletState {
  usdt:    number;
  btc:     number;
  inTrade: boolean;
}

export interface CandleContext {
  candle1m:  ProcessedCandle;
  candle15m: ProcessedCandle;
  candle1h:  ProcessedCandle;
}

export interface BuyOrder {
  type:         "BUY";
  openTime:     number;
  price:        number;
  usdtSpent:    number;
  btcGross:     number;
  feeBtc:       number;
  btcNet:       number;
  feeRate:      number;
  idx1m:        number; // index in candles1m array — used for report context
}

export interface SellOrder {
  type:       "SELL";
  closeTime:  number;
  price:      number;
  btcSold:    number;
  usdtGross:  number;
  feeUsdt:    number;
  usdtNet:    number;
  feeRate:    number;
  idx1m:      number; // index in candles1m array — used for report context
}

export interface Trade {
  buy:      BuyOrder;
  sell:     SellOrder;
  pnlUsdt:  number;
  pnlPct:   number;
}

export interface SimulationResult {
  trades:        Trade[];
  finalBalance:  number;
  totalPnlUsdt:  number;
  totalPnlPct:   number;
  totalFeesPaid: number;
  winRate:       number;
}
