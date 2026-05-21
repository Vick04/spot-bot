// ─────────────────────────────────────────────
// src/core/observer.ts
// Per-symbol trading signal observer
// Moved from src/multi/symbolObserver.ts
// ─────────────────────────────────────────────

import { ProcessedCandle } from "./candle";
import { prisma } from "../db/prismaClient";
import {
  evaluateBuySequence,
  initialBuyState,
  BuySequenceState,
  ActiveStrategy,
} from "../simulator/conditions";
import { getSymbolParams, SymbolParams } from "../config/constants";

/**
 * Per-symbol observer for detecting trading signals
 * Maintains buy state and detects when conditions are met for a buy
 */
export class SymbolObserver {
  readonly symbol: string;
  readonly params: SymbolParams;

  private buyState: BuySequenceState = initialBuyState();

  // Exposed to manager — read after each tick
  match: boolean = false;
  strategy: ActiveStrategy = null;
  matchCandle: ProcessedCandle | null = null;

  get upStreak(): number {
    return this.buyState.upStreak;
  }

  constructor(symbol: string) {
    this.symbol = symbol;
    this.params = getSymbolParams(symbol);
  }

  /**
   * Warm up observer from in-memory candle array
   * Used by live trading which fetches candles via REST or loads from database
   * Resets match flags — warmup candles are historical, not actionable
   * @param candles - Processed candles to replay through state machine
   */
  warmupFromCandles(candles: ProcessedCandle[]): void {
    if (candles.length === 0) return;

    this.buyState = initialBuyState();

    for (let i = 1; i < candles.length; i++) {
      const result = evaluateBuySequence(
        candles[i - 1],
        this.buyState,
        1,
        false,
        this.params
      );
      this.buyState = result.state;

      if (result.signal) {
        this.applyBuyStateReset(result.activeStrategy);
      }
    }

    // Clear match flags after warmup
    this.match = false;
    this.strategy = null;
    this.matchCandle = null;
  }

  /**
   * Warm up observer by replaying candles from database
   * Called once during initialization
   * @deprecated Use warmupFromCandles() instead to avoid database dependency
   */
  async warmup(): Promise<void> {
    const rows = await (prisma.symbolCandle1m as any).findMany({
      where: { symbol: this.symbol },
      orderBy: { openTime: "asc" },
      take: 500,
    });

    if (rows.length === 0) return;

    this.buyState = initialBuyState();
    const candles = rows.map((r: any) => rowToProcessed(r));

    for (let i = 1; i < candles.length; i++) {
      const result = evaluateBuySequence(
        candles[i - 1],
        this.buyState,
        1,
        false,
        this.params
      );
      this.buyState = result.state;

      if (result.signal) {
        this.applyBuyStateReset(result.activeStrategy);
      }
    }
  }

  /**
   * Process a new closed candle
   * Updates match/strategy/matchCandle based on signal evaluation
   * Called by manager every minute with a processed candle
   * @param candle - The processed candle to evaluate
   */
  tick(candle: ProcessedCandle): void {
    const result = evaluateBuySequence(
      candle,
      this.buyState,
      1,
      false,
      this.params
    );
    this.buyState = result.state;

    if (result.signal) {
      // Set match flag when signal first fires
      if (!this.match) {
        this.match = true;
        this.strategy = result.activeStrategy;
        this.matchCandle = candle;
      }
      // Reset state for the strategy that triggered
      this.applyBuyStateReset(result.activeStrategy);
    } else {
      // Reset match when no condition is active
      const anyActive = this.buyState.down.cond2Met || this.buyState.up.cond2Met;
      if (!anyActive) {
        this.match = false;
        this.strategy = null;
        this.matchCandle = null;
      }
    }
  }

  /**
   * Called by manager after executing a buy for this symbol
   * @param strategy - The strategy that triggered the buy
   */
  onBuy(strategy: ActiveStrategy): void {
    this.applyBuyStateReset(strategy);
  }

  /**
   * Called by manager after executing a sell for this symbol
   * @param strategy - The strategy that was used
   */
  onSell(strategy: ActiveStrategy): void {
    this.applyBuyStateReset(strategy);
    this.match = false;
    this.strategy = null;
    this.matchCandle = null;
  }

  /**
   * Apply state reset based on which strategy was used
   * For "up" strategy: increment upStreak
   * For "down" strategy: reset everything
   * @private
   */
  private applyBuyStateReset(strategy: ActiveStrategy): void {
    if (strategy === "down") {
      this.buyState = {
        ...this.buyState,
        down: { cond1Met: false, cond2Met: false },
        upStreak: 0,
      };
    } else {
      this.buyState = {
        ...this.buyState,
        up: { cond1Met: false, cond2Met: false },
        upStreak: this.buyState.upStreak + 1,
      };
    }
  }
}

/**
 * Convert database row to ProcessedCandle
 * @private
 */
function rowToProcessed(r: any): ProcessedCandle {
  return {
    openTime: Number(r.openTime),
    open: r.open,
    high: r.high,
    low: r.low,
    close: r.close,
    volume: r.volume,
    closeTime: Number(r.closeTime),
    ma20: r.ma20 ?? null,
    ma99: r.ma99 ?? null,
    bbUpper: r.bbUpper ?? null,
    bbLower: r.bbLower ?? null,
    trix: null,
    superTrend: null,
    stDirection: null,
    volAvg: r.volAvg ?? null,
    volRatio: r.volRatio ?? null,
  };
}
