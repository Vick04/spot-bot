// ─────────────────────────────────────────────
// src/data/sources/backtest.ts
// Database backtest data provider
// Loads candles from PostgreSQL and feeds them chronologically
// Refactored from src/simulateMulti.ts
// ─────────────────────────────────────────────

import { BaseDataProvider } from "../dataProvider";
import { RawCandle, ProcessedCandle } from "../../core/candle";
import { prisma } from "../../db/prismaClient";

/**
 * Database backtest provider
 * Loads historical candles from database and processes them in chronological order
 */
export class DatabaseBacktestProvider extends BaseDataProvider {
  private _allCandles: Map<string, ProcessedCandle[]> = new Map();
  private _commonTimestamps: number[] = [];
  private _candelesProcessed = 0;

  constructor(symbols: string[]) {
    super("DatabaseBacktest", symbols);
  }

  async loadWarmupCandles(symbol: string): Promise<RawCandle[]> {
    // For backtest, we don't need separate warmup - all candles are available
    // Return empty array
    return [];
  }

  async start(): Promise<void> {
    if (this._running) {
      console.warn(`[${this._name}] Already running`);
      return;
    }

    try {
      console.log(`[${this._name}] Starting backtest...`);

      // Load all candles from database
      await this._loadAllCandles();

      // Synchronize candles across symbols
      this._synchronizeCandles();

      // Process all candles chronologically
      await this._processCandles();

      this._running = true;
      console.log(`[${this._name}] Backtest completed (${this._candelesProcessed} candle sets processed)`);
    } catch (e) {
      console.error(`[${this._name}] Failed to run backtest:`, (e as Error).message);
      throw e;
    }
  }

  async stop(): Promise<void> {
    // No-op for backtest
    this._running = false;
  }

  private async _loadAllCandles(): Promise<void> {
    console.log(`[${this._name}] Loading candles from database...`);

    for (const symbol of this._symbols) {
      try {
        const rows = await (prisma.symbolCandle1m as any).findMany({
          where: { symbol },
          orderBy: { openTime: "asc" },
        });

        const candles: ProcessedCandle[] = rows.map((r: any) => ({
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
          trix: r.trix ?? null,
          superTrend: r.superTrend ?? null,
          stDirection: r.stDirection ?? null,
          volAvg: r.volAvg ?? null,
          volRatio: r.volRatio ?? null,
        }));

        this._allCandles.set(symbol, candles);
        console.log(`[${this._name}]   ${symbol}: ${candles.length} candles`);
      } catch (e) {
        console.error(`[${this._name}] Failed to load ${symbol}:`, (e as Error).message);
        throw e;
      }
    }
  }

  private _synchronizeCandles(): void {
    console.log(`[${this._name}] Synchronizing candles across symbols...`);

    // Find common timestamps across all symbols
    const symbolTimes = new Map<string, Set<number>>();

    for (const [symbol, candles] of this._allCandles) {
      symbolTimes.set(symbol, new Set(candles.map((c) => c.openTime)));
    }

    const symbols = [...this._allCandles.keys()];
    let commonTimes = new Set(symbolTimes.get(symbols[0])!);

    for (let i = 1; i < symbols.length; i++) {
      const times = symbolTimes.get(symbols[i])!;
      commonTimes = new Set([...commonTimes].filter((t) => times.has(t)));
    }

    this._commonTimestamps = [...commonTimes].sort((a, b) => a - b);

    console.log(`[${this._name}]   Common timestamps: ${this._commonTimestamps.length}`);

    if (this._commonTimestamps.length === 0) {
      throw new Error(
        `[${this._name}] No common timestamps - check that all symbols have overlapping data`
      );
    }

    const startDate = new Date(this._commonTimestamps[0] - 3 * 3600_000)
      .toISOString()
      .slice(0, 16);
    const endDate = new Date(this._commonTimestamps[this._commonTimestamps.length - 1] - 3 * 3600_000)
      .toISOString()
      .slice(0, 16);

    console.log(`[${this._name}]   Range: ${startDate} → ${endDate} GMT-3`);
  }

  private async _processCandles(): Promise<void> {
    console.log(`[${this._name}] Processing ${this._commonTimestamps.length} candle sets...`);

    // Create index maps for quick lookup
    const indexed = new Map<string, Map<number, ProcessedCandle>>();

    for (const [symbol, candles] of this._allCandles) {
      const map = new Map<number, ProcessedCandle>();
      for (const c of candles) {
        map.set(c.openTime, c);
      }
      indexed.set(symbol, map);
    }

    // Process each common timestamp
    for (const timestamp of this._commonTimestamps) {
      for (const symbol of this._symbols) {
        const candle = indexed.get(symbol)!.get(timestamp);

        if (candle && this._candleCallback) {
          try {
            await this.emitCandle(symbol, candle);
            this._candelesProcessed++;
          } catch (e) {
            console.error(`[${this._name}] Error processing ${symbol} candle at ${timestamp}:`,
              (e as Error).message);
            throw e;
          }
        }
      }

      // Progress indicator
      if (this._candelesProcessed % 100 === 0) {
        console.log(`[${this._name}]   Processed ${this._candelesProcessed} candles...`);
      }
    }
  }
}
