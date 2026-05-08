// ─────────────────────────────────────────────
// src/live/indicatorEngine.ts
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
  VOLUME_AVG_PERIOD,
} from "../config/constants";

function nanToNull(v: number): number | null {
  return isNaN(v) ? null : v;
}

function stDir(v: number): number | null {
  return isNaN(v) || v === 0 ? null : v;
}

function computeAll(candles: LiveCandle[]): LiveProcessedCandle[] {
  if (candles.length === 0) return [];

  const closes  = candles.map((c) => c.close);
  const highs   = candles.map((c) => c.high);
  const lows    = candles.map((c) => c.low);
  const volumes = candles.map((c) => c.volume);

  const ma20   = calcSMA(closes, MA_FAST_PERIOD);
  const ma99   = calcSMA(closes, MA_SLOW_PERIOD);
  const bb     = calcBollingerBands(closes, BB_PERIOD, BB_MULT);
  const trix   = calcTRIX(closes, TRIX_PERIOD);
  const st     = calcSuperTrend(highs, lows, closes, ST_ATR_PERIOD, ST_FACTOR);
  const volAvg = calcSMA(volumes, VOLUME_AVG_PERIOD);

  return candles.map((c, i) => {
    const avg      = volAvg[i];
    const volRatio = (!isNaN(avg) && avg > 0) ? c.volume / avg : NaN;
    return {
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
      volAvg:      nanToNull(avg),
      volRatio:    nanToNull(volRatio),
    };
  });
}

export function computeLatestIndicators(
  candles: LiveCandle[]
): LiveProcessedCandle | null {
  const all = computeAll(candles);
  return all.length > 0 ? all[all.length - 1] : null;
}

export function computeAllIndicators(
  candles: LiveCandle[]
): LiveProcessedCandle[] {
  return computeAll(candles);
}
