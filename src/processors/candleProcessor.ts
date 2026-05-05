// ─────────────────────────────────────────────
// src/processors/candleProcessor.ts
// Combines raw klines + all indicators into ProcessedCandle[]
// ─────────────────────────────────────────────

import { RawKline } from "../fetch/binanceFetcher";
import {
  MA_FAST_PERIOD,
  MA_SLOW_PERIOD,
  BB_PERIOD,
  BB_MULT,
  TRIX_PERIOD,
  ST_ATR_PERIOD,
  ST_FACTOR,
} from "../config/constants";
import { calcSMA, calcEMA }  from "../indicators/movingAverages"; // ma20/ma99 = SMA; EMA used by TRIX internally
import { calcBollingerBands } from "../indicators/bollingerBands";
import { calcTRIX }           from "../indicators/trix";
import { calcSuperTrend }     from "../indicators/superTrend";

/** A fully enriched candle row ready for DB insertion */
export interface ProcessedCandle {
  openTime:    number; // UTC ms
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
  stDirection: number | null; // +1 bullish / -1 bearish
}

function nanToNull(v: number): number | null {
  return isNaN(v) ? null : v;
}

/**
 * Process an array of raw klines into fully enriched candles.
 *
 * MA20 and MA99 use SMA — matches TradingView's default MA display.
 * Bollinger Bands also use SMA internally (unchanged).
 * TRIX uses triple EMA internally (unchanged).
 */
export function processCandles(raw: RawKline[]): ProcessedCandle[] {
  const closes = raw.map((k) => k.close);
  const highs  = raw.map((k) => k.high);
  const lows   = raw.map((k) => k.low);

  const ma20 = calcSMA(closes, MA_FAST_PERIOD); // SMA(20) — matches TradingView
  const ma99 = calcSMA(closes, MA_SLOW_PERIOD); // SMA(99) — matches TradingView
  const bb   = calcBollingerBands(closes, BB_PERIOD, BB_MULT);
  const trix = calcTRIX(closes, TRIX_PERIOD);
  const st   = calcSuperTrend(highs, lows, closes, ST_ATR_PERIOD, ST_FACTOR);

  return raw.map((k, i) => ({
    openTime:    k.openTime,
    open:        k.open,
    high:        k.high,
    low:         k.low,
    close:       k.close,
    volume:      k.volume,
    ma20:        nanToNull(ma20[i]),
    ma99:        nanToNull(ma99[i]),
    bbUpper:     nanToNull(bb.upper[i]),
    bbLower:     nanToNull(bb.lower[i]),
    trix:        nanToNull(trix[i]),
    superTrend:  nanToNull(st.superTrend[i]),
    stDirection: isNaN(st.direction[i]) || st.direction[i] === 0
                   ? null
                   : st.direction[i],
  }));
}
