// ─────────────────────────────────────────────
// src/report/reportTypes.ts
// ─────────────────────────────────────────────

import { ProcessedCandle } from "../processors/candleProcessor";
import { Trade }           from "../simulator/types";

/** Volume data at the buy candle and surrounding context */
export interface BuyVolumeData {
  // The trigger candle (cond2 — close > ma20)
  volume:    number;
  volAvg:    number | null;
  volRatio:  number | null;

  // Last 5 closed 1h candles before buy (for context)
  pre5h:     ProcessedCandle[];
}

/** Aggregate volume stats for a group of trades */
export interface VolumeGroup {
  count:          number;
  avgVolume:      number;
  avgVolRatio:    number;
  medianVolRatio: number;
  // Distribution of volRatio at buy
  ratioDist: {
    below1:   number; // volRatio < 1    (below average)
    r1_1_5:   number; // 1.0 – 1.5
    r1_5_2:   number; // 1.5 – 2.0
    r2_3:     number; // 2.0 – 3.0
    above3:   number; // > 3.0
    noData:   number; // volRatio null
  };
}

/** All data for one trade */
export interface TradeReport {
  index:      number;
  trade:      Trade;
  buyVolume:  BuyVolumeData;
  isPositive: boolean;
  pnlPct:     number;
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
  // Volume analysis split by outcome
  volumeStats: {
    pos:   VolumeGroup;
    neg:   VolumeGroup;
  };
  positive: TradeReport[];
  negative: TradeReport[];
}
