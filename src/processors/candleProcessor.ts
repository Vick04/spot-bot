// ─────────────────────────────────────────────
// src/processors/candleProcessor.ts
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
  VOLUME_AVG_PERIOD,
} from "../config/constants";
import { calcSMA }            from "../indicators/movingAverages";
import { calcBollingerBands } from "../indicators/bollingerBands";
import { calcTRIX }           from "../indicators/trix";
import { calcSuperTrend }     from "../indicators/superTrend";

/** A fully enriched candle row ready for DB insertion */
export interface ProcessedCandle {
  openTime:    number;
  open:        number;
  high:        number;
  low:         number;
  close:       number;
  volume:      number;
  closeTime:   number;
  ma20:        number | null;
  ma99:        number | null;
  bbUpper:     number | null;
  bbLower:     number | null;
  trix:        number | null;
  superTrend:  number | null;
  stDirection: number | null;
  // ── Volume indicators ──────────────────────────────────────────────────
  volAvg:      number | null; // SMA(volume, VOLUME_AVG_PERIOD)
  volRatio:    number | null; // volume / volAvg  (>1 = above average)
}

function nanToNull(v: number): number | null {
  return isNaN(v) ? null : v;
}

export function processCandles(raw: RawKline[]): ProcessedCandle[] {
  const closes  = raw.map((k) => k.close);
  const highs   = raw.map((k) => k.high);
  const lows    = raw.map((k) => k.low);
  const volumes = raw.map((k) => k.volume);

  const ma20   = calcSMA(closes, MA_FAST_PERIOD);
  const ma99   = calcSMA(closes, MA_SLOW_PERIOD);
  const bb     = calcBollingerBands(closes, BB_PERIOD, BB_MULT);
  const trix   = calcTRIX(closes, TRIX_PERIOD);
  const st     = calcSuperTrend(highs, lows, closes, ST_ATR_PERIOD, ST_FACTOR);
  const volAvg = calcSMA(volumes, VOLUME_AVG_PERIOD);

  return raw.map((k, i) => {
    const avg      = volAvg[i];
    const volRatio = (!isNaN(avg) && avg > 0) ? k.volume / avg : NaN;

    return {
      openTime:    k.openTime,
      open:        k.open,
      high:        k.high,
      low:         k.low,
      close:       k.close,
      volume:      k.volume,
      closeTime:   k.closeTime,
      ma20:        nanToNull(ma20[i]),
      ma99:        nanToNull(ma99[i]),
      bbUpper:     nanToNull(bb.upper[i]),
      bbLower:     nanToNull(bb.lower[i]),
      trix:        nanToNull(trix[i]),
      superTrend:  nanToNull(st.superTrend[i]),
      stDirection: isNaN(st.direction[i]) || st.direction[i] === 0
                     ? null
                     : st.direction[i],
      volAvg:      nanToNull(avg),
      volRatio:    nanToNull(volRatio),
    };
  });
}
