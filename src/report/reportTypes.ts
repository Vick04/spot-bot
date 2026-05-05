// ─────────────────────────────────────────────
// src/report/reportTypes.ts
// ─────────────────────────────────────────────

import { ProcessedCandle } from "../processors/candleProcessor";
import { Trade }           from "../simulator/types";

/** Context slices around the BUY moment */
export interface BuyContext {
  pre1m:  ProcessedCandle[]; // 60 candles before buy
  pre15m: ProcessedCandle[]; // 4 candles before buy
  pre1h:  ProcessedCandle;   // 1 candle before buy (the aligned 1h)
}

/**
 * Momentum of price separation from bbUpper in the N candles before buy.
 * Measures how aggressively price is pulling away from the upper band.
 *
 * separation[i] = close[i] - bbUpper[i]  (positive = price above band)
 *
 * Computed for windows of 3, 5, 10 candles before the buy signal.
 */
export interface BuyMomentum {
  // Raw separation values (close - bbUpper) for last 10 candles before buy
  // Index 0 = oldest, last index = candle immediately before buy
  separations:      number[];

  // Average separation over last 3 / 5 / 10 candles
  avgSep3:          number;
  avgSep5:          number;
  avgSep10:         number;

  // Rate of change: how much the separation grew per candle
  // (separation[last] - separation[first]) / window
  slopeOf3:         number;  // slope over last 3 candles
  slopeOf5:         number;  // slope over last 5 candles
  slopeOf10:        number;  // slope over last 10 candles

  // Separation at the buy candle itself (close_buy - bbUpper_buy)
  separationAtBuy:  number;

  // Max separation seen in the last 10 candles
  maxSep10:         number;

  // How many of the last 10 candles had close > bbUpper (positive separation)
  candlesAboveBB10: number;
}

/** Data about the highest price reached during the trade window */
export interface PeakData {
  price:         number;
  idx1m:         number;
  openTime:      number;
  pre1m:         ProcessedCandle[];
  post1m:        ProcessedCandle[];
  pre15m:        ProcessedCandle[];
  post15m:       ProcessedCandle[];
  aligned1h:     ProcessedCandle;
  missedGainPct: number;
}

/** All data assembled for one trade entry */
export interface TradeReport {
  index:        number;
  trade:        Trade;
  buyContext:   BuyContext;
  buyMomentum:  BuyMomentum;
  peak:         PeakData;
  isPositive:   boolean;
  maxPotPct:    number; // (peak.price - buy.price) / buy.price * 100
}

export interface SimulationReport {
  generatedAt:   string;
  totalTrades:   number;
  positiveCount: number;
  negativeCount: number;
  winRate:       number;
  finalBalance:  number;
  totalPnlUsdt:  number;
  totalPnlPct:   number;
  totalFeesPaid: number;
  // Momentum statistics across all trades — for pattern discovery
  momentumStats: MomentumStats;
  positive:      TradeReport[];
  negative:      TradeReport[];
}

/** Aggregate momentum stats split by outcome — the core pattern analysis */
export interface MomentumStats {
  // Averages by group
  pos: MomentumGroup;
  neg: MomentumGroup;
  // Trades with peak < 0.1% (pure noise) — isolated for comparison
  noise: MomentumGroup;
}

export interface MomentumGroup {
  count:           number;
  avgSep3:         number;
  avgSep5:         number;
  avgSep10:        number;
  avgSlope3:       number;
  avgSlope5:       number;
  avgSlope10:      number;
  avgSepAtBuy:     number;
  avgMaxSep10:     number;
  avgCandlesAbove: number;
  // Distribution of separationAtBuy
  sepAtBuyDist: {
    neg:    number; // close < bbUpper at buy (should be 0 — sanity check)
    p0_50:  number; // 0–50
    p50_100: number;
    p100_200: number;
    p200_500: number;
    p500plus: number;
  };
}
