// ─────────────────────────────────────────────
// src/live/liveEngine.ts
// ─────────────────────────────────────────────

import { LiveContext }                  from "./liveContext";
import { BinanceWsClient, CandleEvent } from "./wsClient";
import { liveCheckSell }                from "./liveConditions";
import {
  startSession,
  endSession,
  liveExecuteBuy,
  liveExecuteSell,
} from "./liveExecutor";
import { LiveProcessedCandle, OpenPosition } from "./types";
import { prisma }                       from "../db/prismaClient";
import { fetchAllKlines }               from "../fetch/binanceFetcher";
import { processCandles, ProcessedCandle } from "../processors/candleProcessor";
import {
  evaluateBuySequence,
  initialBuyState,
  BuySequenceState,
} from "../simulator/conditions";
import { SYMBOL, FEE_RATE, Timeframe }  from "../config/constants";

const LIVE_TIMEFRAMES: Timeframe[] = ["1h"];
const HOUR_MS   = 3600_000;
// How many 1h candles to fetch from Binance for warmup when DB is empty.
// 500 = ~20 days of history — enough for all indicators to converge.
const WARMUP_CANDLES = 500;

// ── Helpers ───────────────────────────────────────────────────────────────

function rowToLiveCandle(r: any): LiveProcessedCandle {
  return {
    openTime:    Number(r.openTime),
    open:        r.open,  high: r.high, low: r.low, close: r.close, volume: r.volume,
    ma20:        r.ma20,  ma99: r.ma99, bbUpper: r.bbUpper, bbLower: r.bbLower,
    trix:        r.trix,  superTrend: r.superTrend, stDirection: r.stDirection,
    volAvg:      r.volAvg   ?? null,
    volRatio:    r.volRatio ?? null,
  };
}

function processedToLiveCandle(c: ProcessedCandle): LiveProcessedCandle {
  return {
    openTime:    c.openTime,
    open:        c.open,  high: c.high, low: c.low, close: c.close, volume: c.volume,
    ma20:        c.ma20,  ma99: c.ma99, bbUpper: c.bbUpper, bbLower: c.bbLower,
    trix:        c.trix,  superTrend: c.superTrend, stDirection: c.stDirection,
    volAvg:      c.volAvg   ?? null,
    volRatio:    c.volRatio ?? null,
  };
}

// ── Fetch + process from Binance into memory ──────────────────────────────

/**
 * Fetch the last `count` closed 1h candles from Binance, compute all
 * indicators, and return them as ProcessedCandle[].
 * Nothing is written to the DB — purely in-memory.
 */
async function fetchAndProcess1h(count: number): Promise<ProcessedCandle[]> {
  const now       = Date.now();
  const fetchFrom = now - count * HOUR_MS;
  const raw       = await fetchAllKlines(SYMBOL, "1h", fetchFrom, now);
  // Drop the currently open candle (last one may not be closed yet)
  const closed    = raw.filter(k => k.openTime < now - HOUR_MS);
  return processCandles(closed);
}

// ── Candle resolution ─────────────────────────────────────────────────────

/**
 * Resolve a closed 1h candle for the given openTimeMs.
 *
 * Priority:
 *   1. DB row (pre-calculated, fastest)
 *   2. In-memory cache (passed from warmup, avoids a second fetch)
 *   3. Fresh fetch from Binance (writes to DB for future use)
 */
async function resolve1hCandle(
  openTimeMs:   number,
  memoryCache:  ProcessedCandle[]
): Promise<LiveProcessedCandle | null> {
  // 1. DB
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const row = await (prisma.candle1h as any).findUnique({
    where: { openTime: BigInt(openTimeMs) },
  }).catch(() => null);

  if (row) return rowToLiveCandle(row);

  // 2. In-memory cache from warmup fetch
  const cached = memoryCache.find(c => c.openTime === openTimeMs);
  if (cached) return processedToLiveCandle(cached);

  // 3. Fresh fetch from Binance + write to DB
  console.log(`[Engine] Fetching candle ${new Date(openTimeMs - 3*HOUR_MS).toISOString().slice(0,16)} GMT-3 from Binance...`);
  const fetchFrom = openTimeMs - 200 * HOUR_MS;
  const raw       = await fetchAllKlines(SYMBOL, "1h", fetchFrom, openTimeMs + HOUR_MS);
  if (raw.length === 0) return null;

  const processed = processCandles(raw);

  // Write to DB so future lookups are instant (skipDuplicates = safe)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (prisma.candle1h as any).createMany({ data: processed, skipDuplicates: true })
    .catch(() => {}); // non-fatal if DB write fails
  console.log(`[Engine] Wrote ${processed.length} candles to DB`);

  const target = processed.find(c => c.openTime === openTimeMs);
  return target ? processedToLiveCandle(target) : null;
}

// ── State warmup ──────────────────────────────────────────────────────────

/**
 * Reconstruct cond1Met/cond2Met by replaying historical 1h candles.
 *
 * Sources (in order of preference):
 *   1. DB rows — fast, pre-calculated
 *   2. Binance fetch — used when DB is empty (fresh deploy, reset, etc.)
 *
 * Returns both the reconstructed state AND the in-memory candle cache
 * so resolve1hCandle can reuse the fetched data without a second request.
 */
async function warmupBuyState(): Promise<{
  state: BuySequenceState;
  cache: ProcessedCandle[];
}> {
  console.log("[Engine] Warming up buy sequence state...");

  let candles: ProcessedCandle[] = [];

  // Try DB first
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows: any[] = await (prisma.candle1h as any).findMany({
    orderBy: { openTime: "asc" },
    take:    WARMUP_CANDLES,
  }).catch(() => []);

  if (rows.length > 0) {
    console.log(`[Engine] Using ${rows.length} candles from DB`);
    candles = rows.map((r: any) => ({
      openTime: Number(r.openTime), open: r.open, high: r.high, low: r.low,
      close: r.close, volume: r.volume, ma20: r.ma20, ma99: r.ma99,
      bbUpper: r.bbUpper, bbLower: r.bbLower, trix: r.trix,
      superTrend: r.superTrend, stDirection: r.stDirection,
      volAvg: r.volAvg ?? null, volRatio: r.volRatio ?? null,
    }));
  } else {
    // No DB data — fetch from Binance and compute in memory
    console.log(`[Engine] No DB data — fetching last ${WARMUP_CANDLES} candles from Binance...`);
    candles = await fetchAndProcess1h(WARMUP_CANDLES);
    console.log(`[Engine] Fetched and processed ${candles.length} candles`);
  }

  // Replay the buy sequence logic over the history
  let state = initialBuyState();
  for (let i = 1; i < candles.length; i++) {
    const result = evaluateBuySequence(candles[i - 1], state, 1, false);
    state = result.state;
    if (result.signal) state = initialBuyState(); // reset on each signal
  }

  console.log(`[Engine] Warmup done — cond1Met: ${state.cond1Met}, cond2Met: ${state.cond2Met}`);
  return { state, cache: candles };
}

// ── Main engine ───────────────────────────────────────────────────────────

export async function runLiveEngine(): Promise<void> {
  const ctx = new LiveContext();

  // Reconstruct buy sequence state — DB or Binance fallback
  let { state: buyState, cache: memoryCache } = await warmupBuyState();

  const { sessionId, wallet, openPosition } = await startSession(FEE_RATE);
  let position: OpenPosition | null = openPosition;

  if (position) {
    console.log(
      `[Engine] Resuming position: buy @ $${position.buyPrice.toFixed(2)}` +
      `, ${position.btcNet.toFixed(8)} BTC`
    );
  }

  let pendingSignal: { action: "BUY" | "SELL" } | null = null;

  const ws = new BinanceWsClient(SYMBOL, LIVE_TIMEFRAMES);

  ws.on("reconnected", async () => {
    console.log("[Engine] Reconnected — re-warming state...");
    const warmup = await warmupBuyState();
    buyState     = warmup.state;
    memoryCache  = warmup.cache;
  });

  ws.on("candle", async (event: CandleEvent) => {
    const { timeframe, candle } = event;
    if (timeframe !== "1h") return;

    const openTimeMs = candle.openTime;

    // ── Step 1: Execute pending signal at OPEN of new candle ────────────
    if (pendingSignal) {
      const { action } = pendingSignal;
      const execPrice  = candle.open;
      const ts         = openTimeMs;

      if (action === "BUY" && !wallet.inTrade) {
        position = await liveExecuteBuy(sessionId, wallet, execPrice, ts, FEE_RATE);
      } else if (action === "SELL" && wallet.inTrade && position) {
        await liveExecuteSell(wallet, position, execPrice, ts, FEE_RATE);
        position = null;
        buyState = initialBuyState();
      }

      pendingSignal = null;
    }

    // ── Step 2: Resolve the candle that just closed ──────────────────────
    const closedCandle = await resolve1hCandle(openTimeMs, memoryCache);

    if (!closedCandle) {
      console.warn(`[Engine] Could not resolve candle ${openTimeMs} — skipping`);
      return;
    }

    ctx.set1h(closedCandle);

    const snapshot = {
      candle1m:  closedCandle,
      candle15m: closedCandle,
      candle1h:  closedCandle,
    };

    // ── Step 3: Evaluate conditions — queue signal for next candle open ──
    if (wallet.inTrade && position) {
      if (liveCheckSell(snapshot, position)) {
        pendingSignal = { action: "SELL" };
        console.log(`[Engine] SELL signal queued — executes at next candle open`);
      }
    } else if (!wallet.inTrade) {
      const result = evaluateBuySequence(
        closedCandle as unknown as ProcessedCandle,
        buyState,
        wallet.usdt,
        wallet.inTrade
      );
      buyState = result.state;

      if (result.signal) {
        pendingSignal = { action: "BUY" };
        buyState = initialBuyState();
        console.log(`[Engine] BUY signal queued — executes at next candle open`);
      }
    }
  });

  ws.connect();

  const shutdown = async (signal: string) => {
    console.log(`\n[Engine] ${signal} received — shutting down...`);
    ws.disconnect();
    await endSession(sessionId, wallet);
    process.exit(0);
  };

  process.on("SIGINT",  () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  console.log("[Engine] Live engine running — executing at candle open prices...");
}
