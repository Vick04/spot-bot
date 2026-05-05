// ─────────────────────────────────────────────
// src/simulate.ts
// Entry point exclusivo del simulador.
// Asume que los datos ya están en la DB.
// Correr con: npm run simulate
// ─────────────────────────────────────────────

import "dotenv/config";
import { prisma }            from "./db/prismaClient";
import { runSimulation }     from "./simulator/simulatorEngine";
import { buildReport }       from "./report/reportGenerator";
import { writeReport }       from "./report/reportWriter";

async function loadCandles(table: "candle1m" | "candle15m" | "candle1h") {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (prisma[table] as any).findMany({ orderBy: { openTime: "asc" } });
}

function fmtDate(tsMs: number | bigint): string {
  return new Date(Number(tsMs) - 3 * 3600 * 1000)
    .toISOString().replace("T", " ").slice(0, 19);
}

async function main() {
  console.log("=== Bot7 Simulator ===");

  try {
    console.log("Loading candles from DB...");
    const [candles1m, candles15m, candles1h] = await Promise.all([
      loadCandles("candle1m"),
      loadCandles("candle15m"),
      loadCandles("candle1h"),
    ]);

    console.log(
      `Loaded  1m: ${candles1m.length} | 15m: ${candles15m.length} | 1h: ${candles1h.length}`
    );

    console.log("\nRunning simulation...\n");
    const result = runSimulation(candles1m, candles15m, candles1h);

    // ── Console log ────────────────────────────────────────────────────
    if (result.trades.length > 0) {
      console.log("── Trades ──────────────────────────────────");
      result.trades.forEach((t, i) => {
        const sign = t.pnlUsdt >= 0 ? "+" : "";
        console.log(
          `  #${String(i + 1).padStart(3, "0")}` +
          `  BUY  ${fmtDate(t.buy.openTime)}  @ $${t.buy.price.toFixed(2)}` +
          `  →  SELL ${fmtDate(t.sell.closeTime)} @ $${t.sell.price.toFixed(2)}` +
          `  |  P&L: ${sign}$${t.pnlUsdt.toFixed(2)} (${sign}${t.pnlPct.toFixed(3)}%)`
        );
      });
      console.log("────────────────────────────────────────────");
    }

    console.log("── Result ─────────────────────────────────");
    console.log(`  Trades executed : ${result.trades.length}`);
    console.log(`  Win rate        : ${result.winRate.toFixed(2)}%`);
    console.log(`  Final balance   : $${result.finalBalance.toFixed(2)}`);
    console.log(`  Total P&L       : $${result.totalPnlUsdt.toFixed(2)} (${result.totalPnlPct.toFixed(2)}%)`);
    console.log(`  Total fees paid : $${result.totalFeesPaid.toFixed(2)}`);
    console.log("────────────────────────────────────────────");

    // ── Report ─────────────────────────────────────────────────────────
    console.log("\nGenerating report...");
    const report   = buildReport(result, candles1m, candles15m, candles1h, result.totalFeesPaid);
    const filepath = writeReport(report);
    console.log(`Report saved → ${filepath}`);

  } catch (err) {
    console.error("Simulation error:", err);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
