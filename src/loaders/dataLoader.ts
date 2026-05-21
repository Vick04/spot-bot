// ─────────────────────────────────────────────
// src/loaders/dataLoader.ts
// Orchestrates fetch → process → write for one timeframe.
// Supports full load (empty table) and incremental sync
// (fetch only missing candles, recalculate indicators
// with enough historical overlap for accuracy).
// ─────────────────────────────────────────────

import { prisma }           from "../db/prismaClient";
import { fetchAllKlines }   from "../fetch/binanceFetcher";
import { processCandles }   from "../processors/candleProcessor";
import { writeCandles }     from "../writers/candleWriter";
import {
  // SYMBOL, // deprecated
  // START_TS, // deprecated
  // END_TS, // deprecated
  Timeframe,
  TRIX_PERIOD,
  ST_ATR_PERIOD,
  MA_SLOW_PERIOD,
} from "../config/constants";

// ── Overlap constant ──────────────────────────────────────────────────────
//
// When syncing incrementally we pull this many existing candles from the DB
// before the gap so that stateful indicators (EMA, SuperTrend) have enough
// history to converge correctly before we reach the new candles.
//
// Worst-case warmup:
//   TRIX    = period * 3  (three chained EMAs)
//   EMA99   = MA_SLOW_PERIOD
//   ST ATR  = ST_ATR_PERIOD
//
// We take 3× the largest to be safe.
const INDICATOR_OVERLAP = Math.max(TRIX_PERIOD * 3, MA_SLOW_PERIOD, ST_ATR_PERIOD) * 3;

// ── Prisma delegate helpers ───────────────────────────────────────────────

type AnyDelegate = {
  count:    ()                                        => Promise<number>;
  findMany: (args: { orderBy: { openTime: "desc" }; take: number }) => Promise<{ openTime: bigint }[]>;
};

function getDelegate(tf: Timeframe): AnyDelegate {
  switch (tf) {
    case "1s":  return prisma.candle1s  as unknown as AnyDelegate;
    case "1m":  return prisma.candle1m  as unknown as AnyDelegate;
    case "15m": return prisma.candle15m as unknown as AnyDelegate;
    case "1h":  return prisma.candle1h  as unknown as AnyDelegate;
  }
}

// ── Public API ────────────────────────────────────────────────────────────

/** Returns true if the table already contains at least one row. */
export async function hasData(tf: Timeframe): Promise<boolean> {
  const count = await getDelegate(tf).count();
  return count > 0;
}

/**
 * Returns the openTime (UTC ms) of the most recent candle in the DB,
 * or null if the table is empty.
 */
export async function getLatestOpenTime(tf: Timeframe): Promise<number | null> {
  const rows = await getDelegate(tf).findMany({
    orderBy: { openTime: "desc" },
    take: 1,
  });
  return rows.length > 0 ? Number(rows[0].openTime) : null;
}

/**
 * Check whether the DB is up-to-date for a given timeframe.
 * "Up-to-date" means the latest stored candle is within one candle
 * duration of END_TS.
 */
export function isUpToDate(tf: Timeframe, latestOpenTime: number): boolean {
  // Deprecated: END_TS is no longer defined
  // const candleDurationMs: Record<Timeframe, number> = {
  //   "1s":  1_000,
  //   "1m":  60_000,
  //   "15m": 15 * 60_000,
  //   "1h":  60 * 60_000,
  // };
  // return latestOpenTime >= END_TS - candleDurationMs[tf];
  return true; // Stub: always return true
}

// ── Load pipelines ────────────────────────────────────────────────────────

/**
 * Full load: fetch the entire START_TS → END_TS range from Binance.
 * Used when the table is empty.
 */
export async function loadTimeframe(tf: Timeframe): Promise<void> {
  // Deprecated: SYMBOL, START_TS, END_TS are no longer defined
  console.warn(`[${tf}] loadTimeframe is deprecated - use entries/live.ts or entries/simulate.ts`);
  // console.log(`\n[${tf}] Starting full fetch from Binance...`);
  //
  // const raw = await fetchAllKlines(
  //   SYMBOL, tf, START_TS, END_TS,
  //   (n) => process.stdout.write(`\r[${tf}] Fetched ${n} candles...`)
  // );
  // console.log(`\n[${tf}] Fetch complete — ${raw.length} raw candles`);
  //
  // console.log(`[${tf}] Computing indicators...`);
  // const processed = processCandles(raw);
  //
  // console.log(`[${tf}] Writing to database...`);
  // const written = await writeCandles(tf, processed, (w, total) =>
  //   process.stdout.write(`\r[${tf}] Written ${w}/${total}...`)
  // );
  // console.log(`\n[${tf}] Done — ${written} rows inserted`);
}

/**
 * Incremental sync: fetch only the candles missing after `latestOpenTime`,
 * prepend an overlap of existing candles so indicators are accurate,
 * recalculate, and upsert only the new rows.
 */
export async function syncTimeframe(
  tf: Timeframe,
  latestOpenTime: number
): Promise<void> {
  // Deprecated: SYMBOL, END_TS are no longer defined
  console.warn(`[${tf}] syncTimeframe is deprecated - use entries/live.ts or entries/simulate.ts`);
  return;
  // const fetchFrom = latestOpenTime + 1; // one ms after last stored candle
  //
  // console.log(`\n[${tf}] Fetching new candles from Binance (from ${new Date(fetchFrom).toISOString()})...`);
  //
  // const newRaw = await fetchAllKlines(
  //   SYMBOL, tf, fetchFrom, END_TS,
  //   (n) => process.stdout.write(`\r[${tf}] Fetched ${n} new candles...`)
  // );
  //
  // if (newRaw.length === 0) {
  //   console.log(`\n[${tf}] Already up-to-date — nothing to fetch`);
  //   return;
  // }
  // console.log(`\n[${tf}] ${newRaw.length} new candles fetched`);
  //
  // // ── Pull overlap from DB for indicator continuity ────────────────────
  // // We fetch raw rows via a direct query since we only need openTime/OHLCV.
  // console.log(`[${tf}] Loading ${INDICATOR_OVERLAP} overlap candles from DB...`);
  //
  // // eslint-disable-next-line @typescript-eslint/no-explicit-any
  // const overlapRows: any[] = await (prisma[tf === "1s" ? "candle1s" : tf === "1m" ? "candle1m" : tf === "15m" ? "candle15m" : "candle1h"] as any).findMany({
  //   orderBy: { openTime: "desc" },
  //   take: INDICATOR_OVERLAP,
  // });
  //
  // // findMany with desc → reverse to get ascending order
  // overlapRows.reverse();
  //
  // // Convert DB rows → RawKline shape
  // const overlapRaw = overlapRows.map((r: any) => ({
  //   openTime:  Number(r.openTime),
  //   open:      r.open,
  //   high:      r.high,
  //   low:       r.low,
  //   close:     r.close,
  //   volume:    r.volume,
  //   closeTime: Number(r.openTime), // not stored separately, approximation is fine
  // }));
  //
  // // ── Recalculate indicators over overlap + new candles ────────────────
  // const combined  = [...overlapRaw, ...newRaw];
  // const processed = processCandles(combined);
  //
  // // Keep only the truly new candles (skip the overlap portion)
  // const newProcessed = processed.slice(overlapRaw.length);
  //
  // console.log(`[${tf}] Writing ${newProcessed.length} updated candles to DB...`);
  // const written = await writeCandles(tf, newProcessed, (w, total) =>
  //   process.stdout.write(`\r[${tf}] Written ${w}/${total}...`)
  // );
  // console.log(`\n[${tf}] Sync complete — ${written} new rows inserted`);
}

// ── Bootstrap orchestrator ────────────────────────────────────────────────

/**
 * For every timeframe:
 *  1. If table is empty          → full load
 *  2. If table exists but stale  → incremental sync
 *  3. If table is up-to-date     → skip
 */
export async function bootstrapData(timeframes: Timeframe[]): Promise<void> {
  for (const tf of timeframes) {
    const latest = await getLatestOpenTime(tf);

    if (latest === null) {
      // Table is empty — full load
      await loadTimeframe(tf);
      continue;
    }

    const latestDate = new Date(latest - 3 * 3600 * 1000).toISOString().replace("T", " ").slice(0, 19);

    if (isUpToDate(tf, latest)) {
      console.log(`[${tf}] Up-to-date (latest: ${latestDate} GMT-3) — skipping`);
    } else {
      console.log(`[${tf}] Stale (latest: ${latestDate} GMT-3) — syncing...`);
      await syncTimeframe(tf, latest);
    }
  }
}
