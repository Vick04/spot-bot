// ─────────────────────────────────────────────
// src/live/liveEngine.ts
// ─────────────────────────────────────────────

import { LiveContext }                  from "./liveContext";
import { BinanceWsClient, CandleEvent } from "./wsClient";
import { liveCheckBuy, liveCheckSell }  from "./liveConditions";
import {
  startSession,
  endSession,
  liveExecuteBuy,
  liveExecuteSell,
} from "./liveExecutor";
import { LiveProcessedCandle, OpenPosition } from "./types";
import { prisma }                       from "../db/prismaClient";
import { fetchAllKlines }               from "../fetch/binanceFetcher";
import { processCandles }               from "../processors/candleProcessor";
import { SYMBOL, FEE_RATE, Timeframe }  from "../config/constants";

const LIVE_TIMEFRAMES: Timeframe[] = ["1h"];
const HOUR_MS = 3600_000;

// ── Candle resolution ─────────────────────────────────────────────────────

async function resolve1hCandle(openTimeMs: number): Promise<LiveProcessedCandle | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const row = await (prisma.candle1h as any).findUnique({
    where: { openTime: BigInt(openTimeMs) },
  });

  if (row) {
    return {
      openTime:    Number(row.openTime),
      open:        row.open,
      high:        row.high,
      low:         row.low,
      close:       row.close,
      volume:      row.volume,
      ma20:        row.ma20,
      ma99:        row.ma99,
      bbUpper:     row.bbUpper,
      bbLower:     row.bbLower,
      trix:        row.trix,
      superTrend:  row.superTrend,
      stDirection: row.stDirection,
    };
  }

  // Not in DB — fetch, compute, write
  console.log(`[Engine] Fetching candle ${new Date(openTimeMs - 3*HOUR_MS).toISOString().slice(0,16)} GMT-3 from Binance...`);

  const fetchFrom = openTimeMs - 200 * HOUR_MS;
  const raw       = await fetchAllKlines(SYMBOL, "1h", fetchFrom, openTimeMs + HOUR_MS);
  if (raw.length === 0) return null;

  const processed = processCandles(raw);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (prisma.candle1h as any).createMany({ data: processed, skipDuplicates: true });
  console.log(`[Engine] Wrote ${processed.length} candles to DB`);

  const target = processed.find(c => c.openTime === openTimeMs);
  if (!target) return null;

  return {
    openTime:    target.openTime,
    open:        target.open,
    high:        target.high,
    low:         target.low,
    close:       target.close,
    volume:      target.volume,
    ma20:        target.ma20,
    ma99:        target.ma99,
    bbUpper:     target.bbUpper,
    bbLower:     target.bbLower,
    trix:        target.trix,
    superTrend:  target.superTrend,
    stDirection: target.stDirection,
  };
}

// ── Main engine ───────────────────────────────────────────────────────────

export async function runLiveEngine(): Promise<void> {
  const ctx = new LiveContext();

  const { sessionId, wallet, openPosition } = await startSession(FEE_RATE);
  let position: OpenPosition | null = openPosition;

  if (position) {
    console.log(
      `[Engine] Resuming position: buy @ $${position.buyPrice.toFixed(2)}` +
      `, ${position.btcNet.toFixed(8)} BTC`
    );
  }

  // Holds the closed candle pending execution at the next candle's open
  let pendingSignal: { action: "BUY" | "SELL"; candle: LiveProcessedCandle } | null = null;

  const ws = new BinanceWsClient(SYMBOL, LIVE_TIMEFRAMES);

  ws.on("reconnected", () => {
    console.log("[Engine] Reconnected — resuming");
  });

  ws.on("candle", async (event: CandleEvent) => {
    const { timeframe, candle } = event;
    if (timeframe !== "1h") return;

    const openTimeMs = candle.openTime;

    // ── Step 1: Execute pending signal at the OPEN of this new candle ──
    // The open of the current candle = market price at the moment the
    // previous candle closed — same logic as the simulator using currCandle1h.open
    if (pendingSignal) {
      const { action } = pendingSignal;
      const execPrice  = candle.open; // open of new candle = execution price
      const ts         = openTimeMs;

      if (action === "BUY" && !wallet.inTrade) {
        position = await liveExecuteBuy(sessionId, wallet, execPrice, ts, FEE_RATE);
      } else if (action === "SELL" && wallet.inTrade && position) {
        await liveExecuteSell(wallet, position, execPrice, ts, FEE_RATE);
        position = null;
      }

      pendingSignal = null;
    }

    // ── Step 2: Resolve the candle that just CLOSED (current openTime) ─
    // Evaluate conditions on this closed candle and queue signal for next open
    const closedCandle = await resolve1hCandle(openTimeMs);

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

    // ── Step 3: Evaluate conditions — queue signal for next candle open ─
    if (wallet.inTrade && position) {
      if (liveCheckSell(snapshot, position)) {
        pendingSignal = { action: "SELL", candle: closedCandle };
        console.log(`[Engine] SELL signal queued — will execute at next candle open`);
      }
    } else if (!wallet.inTrade) {
      if (liveCheckBuy(snapshot, wallet.usdt, wallet.inTrade)) {
        pendingSignal = { action: "BUY", candle: closedCandle };
        console.log(`[Engine] BUY signal queued — will execute at next candle open`);
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
