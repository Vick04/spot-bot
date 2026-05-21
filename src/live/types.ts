// ─────────────────────────────────────────────
// src/live/types.ts
// ─────────────────────────────────────────────

export interface LiveCandle {
  openTime:  number;
  open:      number;
  high:      number;
  low:       number;
  close:     number;
  volume:    number;
  isClosed:  boolean;
}

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
  volAvg:      number | null;
  volRatio:    number | null;
}

export interface LiveWallet {
  usdt:    number;
  btc:     number;
  inTrade: boolean;
}

export interface OpenPosition {
  liveTradeId: number;
  symbol:      string;
  buyTime:     number;
  buyPrice:    number;
  usdtSpent:   number;
  btcNet:      number;
  feeRate:     number;
}
