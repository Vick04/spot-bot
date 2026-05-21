// ─────────────────────────────────────────────
// src/entries/simulate.ts
// Unified simulator entry point
// Runs backtest using TradingManager + DatabaseBacktestProvider
// Run with: npm run simulate:multi
// ─────────────────────────────────────────────

import { TradingManager } from "../core/manager";
import { DatabaseBacktestProvider } from "../data/sources/backtest";
import { processCandles } from "../processors/candleProcessor";
import { MULTI_SYMBOLS, INITIAL_BALANCE_USDT } from "../config/constants";
import { prisma } from "../db/prismaClient";
import { dayGMT3 } from "../utils/timeUtils";
import { fmtN, fmtWinRate } from "../utils/formatters";

/**
 * Main unified simulator
 * Uses TradingManager with DatabaseBacktestProvider for historical backtesting
 */
async function main() {
  console.log("[Simulator] Starting unified simulator...");
  console.log("[Simulator] Symbols:", MULTI_SYMBOLS.join(", "));

  // Initialize trading manager
  const manager = new TradingManager(MULTI_SYMBOLS as any);
  manager.initialize(MULTI_SYMBOLS as any, {
    upMaxStreak: 1,
    dailyMaxTrades: 2,
    dailyMaxPnlPct: 10,
    feeRate: 0.00075,
    initialBalanceUsdt: INITIAL_BALANCE_USDT,
    symbolParams: {},
  });

  // Set initial wallet state
  manager.setSession(0, {
    usdt: INITIAL_BALANCE_USDT,
    btc: 0,
    inTrade: false,
  });

  // Load warmup candles from database
  console.log("[Simulator] Loading warmup candles...");
  const provider = new DatabaseBacktestProvider(MULTI_SYMBOLS as any);

  // For backtest, warmup is not needed - all data is available
  // Just initialize the observers with empty arrays
  for (const symbol of MULTI_SYMBOLS) {
    await manager.warmupObserver(symbol, []);
  }

  // Track results
  let trades = 0;
  let wins = 0;
  let losses = 0;
  let totalPnl = 0;

  // Listen to manager events
  manager.on("buy", (event: any) => {
    console.log(`[Simulator] BUY ${event.symbol} @ $${fmtN(event.price, 2)}`);
  });

  manager.on("sell", (event: any) => {
    trades++;
    if (event.pnlPct > 0) wins++;
    else losses++;
    totalPnl += event.pnl;

    const sign = event.pnlPct >= 0 ? "+" : "";
    console.log(
      `[Simulator] SELL ${event.symbol} @ $${fmtN(event.price, 2)}: ` +
      `${sign}${fmtN(event.pnlPct, 3)}% (${sign}$${fmtN(event.pnl, 2)})`
    );
  });

  manager.on("error", (event: any) => {
    console.error(`[Simulator] Manager error:`, event.error);
  });

  // Connect data provider to manager
  provider.onCandle(async (symbol, candle) => {
    try {
      await manager.onCandleClose(symbol, candle);
    } catch (e) {
      console.error(`[Simulator] Error processing candle:`, (e as Error).message);
    }
  });

  // Run simulation
  console.log("[Simulator] Starting backtest...");
  manager.start();

  try {
    await provider.start();
  } catch (e) {
    console.error("[Simulator] Provider failed:", (e as Error).message);
    manager.stop();
    process.exit(1);
  }

  manager.stop();

  // Print results
  console.log("\n" + "─".repeat(70));
  console.log("SIMULATION RESULTS");
  console.log("─".repeat(70));
  console.log(`Total trades:     ${trades}`);
  console.log(`Winning trades:   ${wins}`);
  console.log(`Losing trades:    ${losses}`);
  console.log(`Win rate:         ${fmtWinRate(wins, trades)}`);
  console.log(`Final balance:    $${fmtN(manager.balance)}`);
  console.log(`Total P&L:        ${totalPnl >= 0 ? "+" : ""}$${fmtN(totalPnl)} (${totalPnl >= 0 ? "+" : ""}${fmtN((totalPnl / INITIAL_BALANCE_USDT) * 100, 2)}%)`);
  console.log(`Avg P&L/trade:    ${trades > 0 ? fmtN((totalPnl / trades) / INITIAL_BALANCE_USDT * 100, 3) : "N/A"}%`);
  console.log(`Daily stats:      ${manager.dailyStats.date} | Trades: ${manager.dailyStats.trades} | P&L: ${fmtN(manager.dailyStats.pnlPct, 2)}%`);
  console.log("─".repeat(70));

  await prisma.$disconnect();
}

// ── Error handling ────────────────────────────────────────────────────────

process.on("uncaughtException", (err) => {
  console.error("[Simulator] ❌ Uncaught exception:", err);
  process.exit(1);
});

process.on("unhandledRejection", (reason) => {
  console.error("[Simulator] ❌ Unhandled rejection:", reason);
  process.exit(1);
});

main().catch((err) => {
  console.error("[Simulator] ❌ Fatal error:", err);
  process.exit(1);
});
