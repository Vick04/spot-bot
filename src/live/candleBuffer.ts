// ─────────────────────────────────────────────
// src/live/candleBuffer.ts
// Fixed-size sliding window of OHLCV candles.
// Holds exactly BUFFER_SIZE candles per timeframe.
// Pre-seeded with historical data on startup.
// ─────────────────────────────────────────────

import { LiveCandle } from "./types";

/** How many candles to keep in each buffer.
 *  Must be >= the largest indicator warm-up period.
 *  TRIX(19) needs 19*3=57, EMA(99) needs 99 → use 200 to be safe. */
export const BUFFER_SIZE = 200;

export class CandleBuffer {
  private buf: LiveCandle[] = [];
  readonly timeframe: string;

  constructor(timeframe: string) {
    this.timeframe = timeframe;
  }

  /** Seed with historical candles (oldest first). */
  seed(candles: LiveCandle[]): void {
    // Take the last BUFFER_SIZE candles
    this.buf = candles.slice(-BUFFER_SIZE);
  }

  /**
   * Push a closed candle into the buffer.
   * If a candle with the same openTime already exists (rare WS duplicate),
   * it is replaced rather than appended.
   */
  push(candle: LiveCandle): void {
    if (!candle.isClosed) return; // ignore in-progress candles

    const existing = this.buf.findIndex((c) => c.openTime === candle.openTime);
    if (existing !== -1) {
      this.buf[existing] = candle; // replace (e.g. late update)
    } else {
      this.buf.push(candle);
      if (this.buf.length > BUFFER_SIZE) {
        this.buf.shift(); // drop oldest
      }
    }
  }

  /** Returns a shallow copy of the internal buffer (oldest → newest). */
  getAll(): LiveCandle[] {
    return [...this.buf];
  }

  /** Returns the most recent closed candle, or null if buffer is empty. */
  latest(): LiveCandle | null {
    return this.buf.length > 0 ? this.buf[this.buf.length - 1] : null;
  }

  get size(): number {
    return this.buf.length;
  }
}
