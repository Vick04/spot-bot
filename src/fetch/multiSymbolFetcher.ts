// ─────────────────────────────────────────────
// src/fetch/multiSymbolFetcher.ts
// Fetches and stores 1m candles for multiple symbols
// ─────────────────────────────────────────────

import { prisma }           from "../db/prismaClient";
import { fetchAllKlines }   from "./binanceFetcher";
import { processCandles }   from "../processors/candleProcessor";
import { MULTI_SYMBOLS, Timeframe } from "../config/constants";

const BATCH_SIZE = 1000;

/**
 * Fetch and store 1m candles for a single symbol into symbol_candle_1m.
 * Skips candles already in the DB (skipDuplicates).
 */
export async function fetchSymbol(
  symbol:      string,
  startMs:     number,
  endMs:       number,
  onProgress?: (symbol: string, count: number) => void
): Promise<void> {
  console.log(`[${symbol}] Fetching 1m candles...`);

  const raw = await fetchAllKlines(symbol, "1m", startMs, endMs, (n) => {
    onProgress?.(symbol, n);
  });

  if (raw.length === 0) {
    console.log(`[${symbol}] No candles fetched`);
    return;
  }

  const processed = processCandles(raw);

  // Insert in batches to avoid hitting Postgres limits
  for (let i = 0; i < processed.length; i += BATCH_SIZE) {
    const batch = processed.slice(i, i + BATCH_SIZE).map(c => ({
      symbol,
      openTime:  BigInt(c.openTime),
      open:      c.open,
      high:      c.high,
      low:       c.low,
      close:     c.close,
      volume:    c.volume,
      ma20:      c.ma20,
      ma99:      c.ma99,
      bbUpper:   c.bbUpper,
      bbLower:   c.bbLower,
      volAvg:    c.volAvg,
      volRatio:  c.volRatio,
    }));

    await prisma.symbolCandle1m.createMany({
      data:           batch,
      skipDuplicates: true,
    });
  }

  console.log(`[${symbol}] Stored ${processed.length} candles`);
}

/**
 * Fetch all MULTI_SYMBOLS in parallel (or sequentially to avoid rate limits).
 * Used by npm run dev:multi to populate the DB for simulation.
 */
export async function fetchAllSymbols(
  startMs: number,
  endMs:   number,
  parallel = false
): Promise<void> {
  console.log(`Fetching ${MULTI_SYMBOLS.length} symbols from ${new Date(startMs).toISOString()} to ${new Date(endMs).toISOString()}`);

  if (parallel) {
    await Promise.all(MULTI_SYMBOLS.map(s => fetchSymbol(s, startMs, endMs)));
  } else {
    // Sequential to respect Binance rate limits
    for (const symbol of MULTI_SYMBOLS) {
      await fetchSymbol(symbol, startMs, endMs);
    }
  }

  console.log('All symbols fetched');
}

/**
 * Get the date range available in DB for a given symbol.
 */
export async function getSymbolDateRange(symbol: string): Promise<{
  min: number | null;
  max: number | null;
  count: number;
}> {
  const result = await prisma.symbolCandle1m.aggregate({
    where:   { symbol },
    _min:    { openTime: true },
    _max:    { openTime: true },
    _count:  { openTime: true },
  });

  return {
    min:   result._min.openTime ? Number(result._min.openTime) : null,
    max:   result._max.openTime ? Number(result._max.openTime) : null,
    count: result._count.openTime,
  };
}
