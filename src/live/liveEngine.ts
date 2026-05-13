// ─────────────────────────────────────────────
// src/live/liveEngine.ts
// ─────────────────────────────────────────────

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

const LIVE_TIMEFRAMES: Timeframe[] = ["1m"];
const MIN_MS         = 60_000;
const WARMUP_CANDLES = 500;

interface PendingSignal {
  action:     "BUY" | "SELL";
  evalCandle: LiveProcessedCandle; // the candle that triggered the signal
}

// ── Helpers ───────────────────────────────────────────────────────────────

function processedToLiveCandle(c: ProcessedCandle): LiveProcessedCandle {
  return {
    openTime: c.openTime, open: c.open, high: c.high, low: c.low,
    close: c.close, volume: c.volume,
    ma20: c.ma20, ma99: c.ma99, bbUpper: c.bbUpper, bbLower: c.bbLower,
    trix: c.trix, superTrend: c.superTrend, stDirection: c.stDirection,
    volAvg: c.volAvg ?? null, volRatio: c.volRatio ?? null,
  };
}

// ── Fetch + process from Binance ──────────────────────────────────────────

async function fetchAndProcess1m(count: number): Promise<ProcessedCandle[]> {
  const now       = Date.now();
  const fetchFrom = now - count * MIN_MS;
  const raw       = await fetchAllKlines(SYMBOL, "1m", fetchFrom, now);
  return processCandles(raw.filter(k => k.openTime < now - MIN_MS));
}

// ── Candle resolution ─────────────────────────────────────────────────────

async function resolve1mCandle(
  openTimeMs:  number,
  memoryCache: ProcessedCandle[]
): Promise<LiveProcessedCandle | null> {
  // 1. In-memory cache
  const cached = memoryCache.find(c => c.openTime === openTimeMs);
  if (cached) return processedToLiveCandle(cached);

  // 2. DB
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const row = await (prisma.candle1m as any).findUnique({
    where: { openTime: BigInt(openTimeMs) },
  }).catch(() => null);

  if (row) {
    return processedToLiveCandle({
      openTime: Number(row.openTime), open: row.open, high: row.high, low: row.low,
      close: row.close, volume: row.volume,
      ma20: row.ma20, ma99: row.ma99, bbUpper: row.bbUpper, bbLower: row.bbLower,
      trix: row.trix, superTrend: row.superTrend, stDirection: row.stDirection,
      volAvg: row.volAvg ?? null, volRatio: row.volRatio ?? null,
    });
  }

  // 3. Fresh fetch + write to DB
  console.log(`[Engine] Fetching 1m candle ${new Date(openTimeMs).toISOString()} from Binance...`);
  const raw       = await fetchAllKlines(SYMBOL, "1m", openTimeMs - 200 * MIN_MS, openTimeMs + MIN_MS);
  if (raw.length === 0) return null;
  const processed = processCandles(raw);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (prisma.candle1m as any).createMany({ data: processed, skipDuplicates: true }).catch(() => {});
  const target = processed.find(c => c.openTime === openTimeMs);
  return target ? processedToLiveCandle(target) : null;
}

// ── State warmup ──────────────────────────────────────────────────────────

async function warmupBuyState(): Promise<{
  state: BuySequenceState;
  cache: ProcessedCandle[];
}> {
  console.log("[Engine] Warming up buy sequence state from 1m candles...");

  let candles: ProcessedCandle[] = [];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows: any[] = await (prisma.candle1m as any).findMany({
    orderBy: { openTime: "asc" },
    take:    WARMUP_CANDLES,
  }).catch(() => []);

  if (rows.length > 0) {
    console.log(`[Engine] Using ${rows.length} candles from DB`);
    candles = rows.map((r: any) => ({
      openTime: Number(r.openTime), open: r.open, high: r.high, low: r.low,
      close: r.close, volume: r.volume,
      ma20: r.ma20, ma99: r.ma99, bbUpper: r.bbUpper, bbLower: r.bbLower,
      trix: r.trix, superTrend: r.superTrend, stDirection: r.stDirection,
      volAvg: r.volAvg ?? null, volRatio: r.volRatio ?? null,
    }));
  } else {
    console.log(`[Engine] No DB data — fetching last ${WARMUP_CANDLES} 1m candles from Binance...`);
    candles = await fetchAndProcess1m(WARMUP_CANDLES);
    console.log(`[Engine] Fetched and processed ${candles.length} candles`);
  }

  let state = initialBuyState();
  for (let i = 1; i < candles.length; i++) {
    const result = evaluateBuySequence(candles[i - 1], state, 1, false);
    state = result.state;
    if (result.signal) state = initialBuyState();
  }

  console.log(`[Engine] Warmup done — cond1Met: ${state.cond1Met}, cond2Met: ${state.cond2Met}`);
  return { state, cache: candles };
}

// ── Main engine ───────────────────────────────────────────────────────────

export async function runLiveEngine(): Promise<void> {
  let { state: buyState, cache: memoryCache } = await warmupBuyState();

  const { sessionId, wallet, openPosition } = await startSession(FEE_RATE);
  let position: OpenPosition | null = openPosition;

  if (position) {
    console.log(
      `[Engine] Resuming position: buy @ $${position.buyPrice.toFixed(2)}` +
      `, ${position.btcNet.toFixed(8)} BTC`
    );
  }

  // Signal queued on prevCandle — executed at next candle's open price
  // This mirrors simulator behavior: evaluate on candles1m[i-1], execute at candles1m[i]
  let pendingSignal: PendingSignal | null = null;

  const ws = new BinanceWsClient(SYMBOL, LIVE_TIMEFRAMES);

  ws.on("reconnected", async () => {
    console.log("[Engine] Reconnected — re-warming state...");
    const warmup = await warmupBuyState();
    buyState    = warmup.state;
    memoryCache = warmup.cache;
  });

  ws.on("candle", async (event: CandleEvent) => {
    const { timeframe, candle } = event;
    if (timeframe !== "1m") return;

    const openTimeMs = candle.openTime;

    // ── Step 1: Execute pending signal at OPEN of this new candle ────────
    // Mirrors simulator: prevCandle triggered signal, currCandle provides price
    if (pendingSignal) {
      const { action } = pendingSignal;
      const execPrice  = candle.open;
      const ts         = openTimeMs;

      if (action === "BUY" && !wallet.inTrade) {
        position = await liveExecuteBuy(sessionId, wallet, execPrice, ts, FEE_RATE);
        console.log(`[Engine] BUY executed @ $${execPrice.toFixed(2)}`);
      } else if (action === "SELL" && wallet.inTrade && position) {
        await liveExecuteSell(wallet, position, execPrice, ts, FEE_RATE);
        position = null;
        buyState = initialBuyState();
        console.log(`[Engine] SELL executed @ $${execPrice.toFixed(2)}`);
      }

      pendingSignal = null;
    }

    // ── Step 2: Resolve the candle that just closed ───────────────────────
    const closedCandle = await resolve1mCandle(openTimeMs, memoryCache);
    if (!closedCandle) {
      console.warn(`[Engine] Could not resolve 1m candle ${openTimeMs} — skipping`);
      return;
    }

    const snapshot = {
      candle1m:  closedCandle,
      candle15m: closedCandle,
      candle1h:  closedCandle,
    };

    // ── Step 3: Evaluate conditions — queue signal for next candle open ───
    if (wallet.inTrade && position) {
      if (liveCheckSell(snapshot, position)) {
        pendingSignal = { action: "SELL", evalCandle: closedCandle };
        console.log(`[Engine] SELL signal — executes at next candle open`);
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
        pendingSignal = { action: "BUY", evalCandle: closedCandle };
        buyState = initialBuyState();
        console.log(`[Engine] BUY signal — executes at next candle open`);
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

  console.log("[Engine] Live engine running on 1m candles...");
}
