// ─────────────────────────────────────────────
// src/index.ts
// Entry point for Bot7
// ─────────────────────────────────────────────

import "dotenv/config";
import { bootstrapData } from "./loaders/dataLoader";
import { TIMEFRAMES }    from "./config/constants";
import { prisma }        from "./db/prismaClient";
import { runSimulation } from "./simulator/simulatorEngine";

// ── Candle loader helpers ─────────────────────────────────────────────────

async function loadCandles(table: "candle1m" | "candle15m" | "candle1h") {
  // Cast needed because Prisma delegates share the same shape but are typed separately
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (prisma[table] as any).findMany({
    orderBy: { openTime: "asc" },
  });
}

// ── Main ──────────────────────────────────────────────────────────────────

async function main() {
  console.log("=== Bot7 starting ===");
  console.log(`Timeframes: ${TIMEFRAMES.join(", ")}`);

  try {
    // Phase 1: ensure all candle data is in the DB
    await bootstrapData(TIMEFRAMES);

    console.log("\n=== Data layer ready — loading candles for simulation ===");

    const [candles1m, candles15m, candles1h] = await Promise.all([
      loadCandles("candle1m"),
      loadCandles("candle15m"),
      loadCandles("candle1h"),
    ]);

    console.log(
      `Loaded  1m: ${candles1m.length} | 15m: ${candles15m.length} | 1h: ${candles1h.length}`
    );

    // Phase 2: run simulation
    console.log("\n=== Running simulation ===");
    const result = runSimulation(candles1m, candles15m, candles1m);

    // Summary output
    console.log("\n── Simulation result ──────────────────────");
    console.log(`  Trades executed : ${result.trades.length}`);
    console.log(`  Win rate        : ${result.winRate.toFixed(2)}%`);
    console.log(`  Final balance   : $${result.finalBalance.toFixed(2)}`);
    console.log(`  Total P&L       : $${result.totalPnlUsdt.toFixed(2)} (${result.totalPnlPct.toFixed(2)}%)`);
    console.log(`  Total fees paid : $${result.totalFeesPaid.toFixed(2)}`);
    console.log("────────────────────────────────────────────");

  } catch (err) {
    console.error("Fatal error:", err);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
