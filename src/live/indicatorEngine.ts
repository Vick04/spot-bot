// ─────────────────────────────────────────────
// src/live/indicatorEngine.ts
// Computes all indicators over a CandleBuffer.
// Exports two functions:
//   computeLatestIndicators — enriched last candle only (used on each tick)
//   computeAllIndicators    — enriched array for all candles (used for prev10)
// ─────────────────────────────────────────────

import { LiveCandle, LiveProcessedCandle } from "./types";
import { calcSMA }            from "../indicators/movingAverages";
import { calcBollingerBands } from "../indicators/bollingerBands";
import { calcTRIX }           from "../indicators/trix";
import { calcSuperTrend }     from "../indicators/superTrend";
import {
  MA_FAST_PERIOD,
  MA_SLOW_PERIOD,
  BB_PERIOD,
  BB_MULT,
  TRIX_PERIOD,
  ST_ATR_PERIOD,
  ST_FACTOR,
} from "../config/constants";

function nanToNull(v: number): number | null {
  return isNaN(v) ? null : v;
}

function stDir(v: number): number | null {
  return isNaN(v) || v === 0 ? null : v;
}

/**
 * Compute all indicator arrays over the candle buffer.
 * Returns one LiveProcessedCandle per input candle.
 * Shared by both computeLatestIndicators and computeAllIndicators.
 */
function computeAll(candles: LiveCandle[]): LiveProcessedCandle[] {
  if (candles.length === 0) return [];

  const closes = candles.map((c) => c.close);
  const highs  = candles.map((c) => c.high);
  const lows   = candles.map((c) => c.low);

  const ma20 = calcSMA(closes, MA_FAST_PERIOD);
  const ma99 = calcSMA(closes, MA_SLOW_PERIOD);
  const bb   = calcBollingerBands(closes, BB_PERIOD, BB_MULT);
  const trix = calcTRIX(closes, TRIX_PERIOD);
  const st   = calcSuperTrend(highs, lows, closes, ST_ATR_PERIOD, ST_FACTOR);

  return candles.map((c, i) => ({
    openTime:    c.openTime,
    open:        c.open,
    high:        c.high,
    low:         c.low,
    close:       c.close,
    volume:      c.volume,
    ma20:        nanToNull(ma20[i]),
    ma99:        nanToNull(ma99[i]),
    bbUpper:     nanToNull(bb.upper[i]),
    bbLower:     nanToNull(bb.lower[i]),
    trix:        nanToNull(trix[i]),
    superTrend:  nanToNull(st.superTrend[i]),
    stDirection: stDir(st.direction[i]),
  }));
}

/**
 * Run all indicators over the buffer and return ONLY the last enriched candle.
 * Used on every 1m tick to update the LiveContext.
 */
export function computeLatestIndicators(
  candles: LiveCandle[]
): LiveProcessedCandle | null {
  const all = computeAll(candles);
  return all.length > 0 ? all[all.length - 1] : null;
}

/**
 * Run all indicators over the buffer and return ALL enriched candles.
 * Used to build the prev10 window for sell condition candidates C, D, E.
 */
export function computeAllIndicators(
  candles: LiveCandle[]
): LiveProcessedCandle[] {
  return computeAll(candles);
}
