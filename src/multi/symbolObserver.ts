// ─────────────────────────────────────────────
// src/multi/symbolObserver.ts
// ─────────────────────────────────────────────

import { ProcessedCandle }      from "../processors/candleProcessor";
import { prisma }               from "../db/prismaClient";
import {
  evaluateBuySequence,
  initialBuyState,
  BuySequenceState,
  ActiveStrategy,
} from "../simulator/conditions";
import { getSymbolParams, SymbolParams } from "../config/constants";

export class SymbolObserver {
  readonly symbol: string;
  readonly params: SymbolParams;

  private buyState: BuySequenceState = initialBuyState();

  // Exposed to manager — read after each tick
  match:       boolean          = false;
  strategy:    ActiveStrategy   = null;
  matchCandle: ProcessedCandle | null = null;

  constructor(symbol: string) {
    this.symbol = symbol;
    this.params = getSymbolParams(symbol);
  }

  /**
   * Warm up buyState by replaying last 500 candles from DB.
   * Called once when observer is created.
   */
  async warmup(): Promise<void> {
    const rows = await (prisma.symbolCandle1m as any).findMany({
      where:   { symbol: this.symbol },
      orderBy: { openTime: "asc" },
      take:    500,
    });

    if (rows.length === 0) return;

    this.buyState = initialBuyState();
    const candles = rows.map(rowToProcessed);

    for (let i = 1; i < candles.length; i++) {
      const result = evaluateBuySequence(
        candles[i - 1], this.buyState, 1, false, this.params
      );
      this.buyState = result.state;
      if (result.signal) this.applyBuyStateReset(result.activeStrategy);
    }
  }

  /**
   * Process one closed candle. Updates match/strategy/matchCandle.
   * Called by manager every minute with synchronized candles.
   */
  tick(candle: ProcessedCandle): void {
    const result = evaluateBuySequence(
      candle, this.buyState, 1, false, this.params
    );
    this.buyState = result.state;

    if (result.signal) {
      if (!this.match) {
        this.match       = true;
        this.strategy    = result.activeStrategy;
        this.matchCandle = candle;
      }
      this.applyBuyStateReset(result.activeStrategy);
    } else {
      // Reset match when no cond2 is active in either strategy
      const anyActive = this.buyState.down.cond2Met || this.buyState.up.cond2Met;
      if (!anyActive) {
        this.match       = false;
        this.strategy    = null;
        this.matchCandle = null;
      }
    }
  }

  /**
   * Called by manager after executing a sell for this symbol.
   */
  onSell(strategy: ActiveStrategy): void {
    this.applyBuyStateReset(strategy);
    this.match       = false;
    this.strategy    = null;
    this.matchCandle = null;
  }

  private applyBuyStateReset(strategy: ActiveStrategy): void {
    if (strategy === 'down') {
      this.buyState = {
        ...this.buyState,
        down:     { cond1Met: false, cond2Met: false },
        upStreak: 0,
      };
    } else {
      this.buyState = {
        ...this.buyState,
        up:       { cond1Met: false, cond2Met: false },
        upStreak: this.buyState.upStreak + 1,
      };
    }
  }
}

function rowToProcessed(r: any): ProcessedCandle {
  return {
    openTime:    Number(r.openTime),
    open:        r.open,
    high:        r.high,
    low:         r.low,
    close:       r.close,
    volume:      r.volume,
    ma20:        r.ma20,
    ma99:        r.ma99,
    bbUpper:     r.bbUpper,
    bbLower:     r.bbLower,
    trix:        null,
    superTrend:  null,
    stDirection: null,
    volAvg:      r.volAvg   ?? null,
    volRatio:    r.volRatio ?? null,
  };
}
