// ─────────────────────────────────────────────
// src/cleanCandles.ts
// Clean all candle tables from database
// Run with: npm run clean:candles
// ─────────────────────────────────────────────

import "dotenv/config";
import { prisma } from "./db/prismaClient";

async function main() {
  console.log("[CLEAN] Starting candle cleanup...\n");

  try {
    // Clean each table
    console.log("[CLEAN] Cleaning candle_1s...");
    const c1s = await prisma.candle1s.deleteMany({});
    console.log(`[CLEAN] ✅ Deleted ${c1s.count} candles from candle_1s`);

    console.log("[CLEAN] Cleaning candle_1m...");
    const c1m = await prisma.candle1m.deleteMany({});
    console.log(`[CLEAN] ✅ Deleted ${c1m.count} candles from candle_1m`);

    console.log("[CLEAN] Cleaning candle_15m...");
    const c15m = await prisma.candle15m.deleteMany({});
    console.log(`[CLEAN] ✅ Deleted ${c15m.count} candles from candle_15m`);

    console.log("[CLEAN] Cleaning candle_1h...");
    const c1h = await prisma.candle1h.deleteMany({});
    console.log(`[CLEAN] ✅ Deleted ${c1h.count} candles from candle_1h`);

    console.log("[CLEAN] Cleaning symbol_candle_1m...");
    const scm = await prisma.symbolCandle1m.deleteMany({});
    console.log(`[CLEAN] ✅ Deleted ${scm.count} candles from symbol_candle_1m`);

    const total = c1s.count + c1m.count + c15m.count + c1h.count + scm.count;
    console.log(`\n[CLEAN] ✅ DONE: Cleaned ${total} total candles`);

  } catch (e) {
    console.error("[CLEAN] ❌ Error:", (e as Error).message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
