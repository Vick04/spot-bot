// ─────────────────────────────────────────────
// src/live/liveEngine.ts
// ─────────────────────────────────────────────

import { CandleBuffer, BUFFER_SIZE }    from "./candleBuffer";
import { LiveContext }                  from "./liveContext";
import { BinanceWsClient, CandleEvent } from "./wsClient";
import { computeLatestIndicators }      from "./indicatorEngine";
import { liveCheckBuy, liveCheckSell }  from "./liveConditions";
import {
  startSession,
  endSession,
  liveExecuteBuy,
  liveExecuteSell,
} from "./liveExecutor";
import { LiveCandle, OpenPosition }     from "./types";
import { fetchAllKlines }               from "../fetch/binanceFetcher";
import { SYMBOL, FEE_RATE, Timeframe }  from "../config/constants";

const LIVE_TIMEFRAMES: Timeframe[] = ["1m", "15m", "1h"];

const CANDLE_DURATION_MS: Record<Timeframe, number> = {
  "1s":  1_000,
  "1m":  60_000,
  "15m": 15 * 60_000,
  "1h":  60 * 60_000,
};

// ── Buffer seeding ────────────────────────────────────────────────────────

async function seedBuffer(buffer: CandleBuffer, tf: Timeframe): Promise<void> {
  const now       = Date.now();
  const fetchFrom = now - CANDLE_DURATION_MS[tf] * (BUFFER_SIZE + 2);

  console.log(`[${tf}] Seeding buffer...`);
  const raw = await fetchAllKlines(SYMBOL, tf, fetchFrom, now);

  const candles: LiveCandle[] = raw
    .filter((k) => k.openTime < now - CANDLE_DURATION_MS[tf])
    .map((k) => ({
      openTime: k.openTime, open: k.open, high: k.high,
      low: k.low, close: k.close, volume: k.volume, isClosed: true,
    }));

  buffer.seed(candles);
  console.log(`[${tf}] Buffer ready — ${buffer.size} candles`);
}

async function reseedAll(
  buf1m: CandleBuffer, buf15m: CandleBuffer,
  buf1h: CandleBuffer, ctx: LiveContext
): Promise<void> {
  await Promise.all([
    seedBuffer(buf1m, "1m"), seedBuffer(buf15m, "15m"), seedBuffer(buf1h, "1h"),
  ]);
  const c1m  = computeLatestIndicators(buf1m.getAll());
  const c15m = computeLatestIndicators(buf15m.getAll());
  const c1h  = computeLatestIndicators(buf1h.getAll());
  if (c1m)  ctx.set1m(c1m);
  if (c15m) ctx.set15m(c15m);
  if (c1h)  ctx.set1h(c1h);
  console.log("[Engine] Buffers re-seeded — resuming");
}

// ── Main engine ───────────────────────────────────────────────────────────

export async function runLiveEngine(): Promise<void> {
  const buf1m  = new CandleBuffer("1m");
  const buf15m = new CandleBuffer("15m");
  const buf1h  = new CandleBuffer("1h");
  const ctx    = new LiveContext();

  await reseedAll(buf1m, buf15m, buf1h, ctx);

  const { sessionId, wallet } = await startSession(FEE_RATE);
  let position: OpenPosition | null = null;
  let reseeding                     = false;

  const ws = new BinanceWsClient(SYMBOL, LIVE_TIMEFRAMES);

  ws.on("reconnected", async () => {
    reseeding = true;
    console.log("[Engine] Re-seeding buffers after reconnect...");
    try { await reseedAll(buf1m, buf15m, buf1h, ctx); }
    catch (err) { console.error("[Engine] Re-seed failed:", err); }
    finally { reseeding = false; }
  });

  ws.on("candle", async (event: CandleEvent) => {
    if (reseeding) return;

    const { timeframe, candle } = event;

    if      (timeframe === "1m")  buf1m.push(candle);
    else if (timeframe === "15m") buf15m.push(candle);
    else if (timeframe === "1h")  buf1h.push(candle);

    const bufMap: Record<string, CandleBuffer> = {
      "1m": buf1m, "15m": buf15m, "1h": buf1h,
    };
    const enriched = computeLatestIndicators(bufMap[timeframe].getAll());
    if (!enriched) return;

    if      (timeframe === "1m")  ctx.set1m(enriched);
    else if (timeframe === "15m") ctx.set15m(enriched);
    else if (timeframe === "1h")  ctx.set1h(enriched);

    if (timeframe !== "1m") return;

    const snapshot = ctx.snapshot();
    if (!snapshot) return;

    const ts = candle.openTime;

    // ── SELL ────────────────────────────────────────────────────────
    if (wallet.inTrade && position) {
      if (liveCheckSell(snapshot, position)) {
        await liveExecuteSell(wallet, position, candle.close, ts, FEE_RATE);
        position = null;

        if (liveCheckBuy(snapshot, wallet.usdt, wallet.inTrade)) {
          position = await liveExecuteBuy(sessionId, wallet, candle.close, ts, FEE_RATE);
        }
        return;
      }
    }

    // ── BUY ─────────────────────────────────────────────────────────
    if (!wallet.inTrade && liveCheckBuy(snapshot, wallet.usdt, wallet.inTrade)) {
      position = await liveExecuteBuy(sessionId, wallet, candle.close, ts, FEE_RATE);
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

  console.log("[Engine] Live engine running — waiting for candles...");
}
