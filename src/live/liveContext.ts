// ─────────────────────────────────────────────
// src/live/liveContext.ts
// Holds the current enriched candle for each
// timeframe and exposes a snapshot for conditions.
// Updated independently as each timeframe closes.
// ─────────────────────────────────────────────

import { LiveProcessedCandle } from "./types";
// LiveCandleContext is deprecated - use ProcessedCandle from core/candle.ts instead
// import { LiveCandleContext } from "./types";

export class LiveContext {
  private _1m:  LiveProcessedCandle | null = null;
  private _15m: LiveProcessedCandle | null = null;
  private _1h:  LiveProcessedCandle | null = null;

  set1m (c: LiveProcessedCandle): void { this._1m  = c; }
  set15m(c: LiveProcessedCandle): void { this._15m = c; }
  set1h (c: LiveProcessedCandle): void { this._1h  = c; }

  get1m (): LiveProcessedCandle | null { return this._1m;  }
  get15m(): LiveProcessedCandle | null { return this._15m; }
  get1h (): LiveProcessedCandle | null { return this._1h;  }

  /**
   * Returns a complete context snapshot only when all three timeframes
   * have at least one closed candle with computed indicators.
   * Returns null otherwise (bot waits silently).
   */
  snapshot(): any | null { // LiveCandleContext - type no longer defined
    if (!this._1m || !this._15m || !this._1h) return null;
    return {
      candle1m:  this._1m,
      candle15m: this._15m,
      candle1h:  this._1h,
    };
  }
}
