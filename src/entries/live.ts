// ─────────────────────────────────────────────
// src/entries/live.ts
// Unified live trading engine entry point
// Combines TradingManager + BinanceWebSocketProvider + API server
// Run with: npm run live:api
// ─────────────────────────────────────────────

import "dotenv/config";
import { TradingManager } from "../core/manager";
import { BinanceWebSocketProvider } from "../data/sources/live";
import { startSession, endSession, liveExecuteBuy, liveExecuteSell } from "../execution/executor";
import { processCandles } from "../processors/candleProcessor";
import { INITIAL_BALANCE_USDT } from "../config/constants";
import { prisma } from "../db/prismaClient";

/**
 * Main unified live trading engine
 * Uses TradingManager with BinanceWebSocketProvider for real-time trading
 */
async function main() {
  console.log("[LiveEngine] Starting unified live engine...");

  // Load configuration from database
  let config = await loadConfigFromDatabase();
  console.log("[LiveEngine] Config loaded:", config);

  // Load watchlist from database
  const watchlist = await loadWatchlist();
  if (watchlist.length === 0) {
    console.warn("[LiveEngine] Watchlist is empty — populate the watchlist table to start trading");
  }

  const symbols = watchlist.map((w) => w.symbol);
  console.log("[LiveEngine] Symbols:", symbols.join(", "));

  // Initialize trading manager
  const manager = new TradingManager(symbols);

  // Build symbol params from watchlist
  const symbolParams: Record<string, any> = {};
  for (const watch of watchlist) {
    symbolParams[watch.symbol] = watch.params || {};
  }

  manager.initialize(symbols, {
    upMaxStreak: config.UP_MAX_STREAK,
    dailyMaxTrades: config.DAILY_MAX_TRADES,
    dailyMaxPnlPct: config.DAILY_MAX_PNL_PCT,
    feeRate: config.FEE_RATE,
    initialBalanceUsdt: config.INITIAL_BALANCE_USDT,
    symbolParams,
  });

  // Start session
  console.log("[LiveEngine] Starting trading session...");
  const { sessionId, wallet, openPosition } = await startSession(config.FEE_RATE);
  manager.setSession(sessionId, wallet);

  if (openPosition) {
    console.warn(
      `[LiveEngine] WARNING: recovered orphan position ` +
      `${openPosition.symbol} @ $${openPosition.buyPrice.toFixed(2)}`
    );
  }

  // Load warmup candles for each symbol
  console.log("[LiveEngine] Loading warmup candles...");
  const provider = new BinanceWebSocketProvider(symbols);

  for (const symbol of symbols) {
    try {
      const rawCandles = await provider.loadWarmupCandles(symbol);
      // Process raw candles to calculate indicators
      const processedCandles = processCandles(rawCandles);
      await manager.warmupObserver(symbol, processedCandles);
    } catch (e) {
      console.error(`[LiveEngine] Failed to warmup ${symbol}:`, (e as Error).message);
    }
  }

  // Connect data provider to manager
  provider.onCandle(async (symbol, candle) => {
    try {
      await manager.onCandleClose(symbol, candle);
    } catch (e) {
      console.error(`[LiveEngine] Error processing candle:`, (e as Error).message);
    }
  });

  // Listen to manager events
  manager.on("buy", async (event: any) => {
    console.log(`[LiveEngine] BUY event: ${event.symbol}`);
    // Could broadcast to WebSocket clients here
  });

  manager.on("sell", async (event: any) => {
    console.log(`[LiveEngine] SELL event: ${event.symbol}`);
    // Could broadcast to WebSocket clients here
  });

  manager.on("error", (event: any) => {
    console.error(`[LiveEngine] Manager error:`, event.error);
  });

  // Start manager and provider
  console.log("[LiveEngine] Starting manager and provider...");
  manager.start();

  try {
    await provider.start();
  } catch (e) {
    console.error("[LiveEngine] Provider failed to start:", (e as Error).message);
    manager.stop();
    process.exit(1);
  }

  console.log("[LiveEngine] ✅ Running");

  // Graceful shutdown
  const shutdown = async (sig: string) => {
    console.log(`\n[LiveEngine] ${sig} received, shutting down...`);
    manager.stop();
    await provider.stop();
    await endSession(manager.sessionId, { ...manager.activeTrade?.position, ...wallet });
    await prisma.$disconnect();
    process.exit(0);
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

// ── Database helpers ──────────────────────────────────────────────────────

async function loadConfigFromDatabase() {
  try {
    const rows = await prisma.botConfig.findMany();
    const map: Record<string, string> = {};
    for (const r of rows) map[r.key] = r.value;

    return {
      UP_MAX_STREAK: Number(map["UP_MAX_STREAK"] ?? 1),
      DAILY_MAX_TRADES: Number(map["DAILY_MAX_TRADES"] ?? 2),
      DAILY_MAX_PNL_PCT: Number(map["DAILY_MAX_PNL_PCT"] ?? 10),
      FEE_RATE: Number(map["FEE_RATE"] ?? 0.00075),
      INITIAL_BALANCE_USDT: Number(map["INITIAL_BALANCE_USDT"] ?? INITIAL_BALANCE_USDT),
    };
  } catch (e) {
    console.error("[LiveEngine] Failed to load config from DB:", (e as Error).message);
    return {
      UP_MAX_STREAK: 1,
      DAILY_MAX_TRADES: 2,
      DAILY_MAX_PNL_PCT: 10,
      FEE_RATE: 0.00075,
      INITIAL_BALANCE_USDT: INITIAL_BALANCE_USDT,
    };
  }
}

async function loadWatchlist() {
  try {
    return await prisma.watchlist.findMany({ where: { active: true } });
  } catch (e) {
    console.error("[LiveEngine] Failed to load watchlist:", (e as Error).message);
    return [];
  }
}

// ── Error handling ────────────────────────────────────────────────────────

process.on("uncaughtException", (err) => {
  console.error("[LiveEngine] ❌ Uncaught exception:", err);
  process.exit(1);
});

process.on("unhandledRejection", (reason) => {
  console.error("[LiveEngine] ❌ Unhandled rejection:", reason);
  process.exit(1);
});

main().catch((err) => {
  console.error("[LiveEngine] ❌ Fatal error:", err);
  process.exit(1);
});
