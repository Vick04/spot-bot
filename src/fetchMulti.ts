// ─────────────────────────────────────────────
// src/fetchMulti.ts
// Entry point: fetch 1m candles for all MULTI_SYMBOLS
// Usage: npm run fetch:multi
// ─────────────────────────────────────────────

import { fetchAllSymbols, getSymbolDateRange } from "./fetch/multiSymbolFetcher";
import { MULTI_SYMBOLS }                        from "./config/constants";
import { prisma }                               from "./db/prismaClient";

async function main() {
  console.log("=== Multi-symbol fetch ===");
  console.log("Symbols:", MULTI_SYMBOLS.join(", "));

  // Show current DB state per symbol
  console.log("\nCurrent DB state:");
  for (const symbol of MULTI_SYMBOLS) {
    const range = await getSymbolDateRange(symbol);
    if (range.count > 0) {
      const minDate = new Date(range.min! - 3*3600_000).toISOString().slice(0,16);
      const maxDate = new Date(range.max! - 3*3600_000).toISOString().slice(0,16);
      console.log(`  ${symbol}: ${range.count} candles (${minDate} → ${maxDate} GMT-3)`);
    } else {
      console.log(`  ${symbol}: empty`);
    }
  }

  console.log("\nStarting fetch...");
  const startMs = new Date("2026-04-18T00:00:00-03:00").getTime();
  const endMs   = new Date("2026-05-20T23:50:59-03:00").getTime();
  await fetchAllSymbols(startMs, endMs);

  console.log("\nDone. Final DB state:");
  for (const symbol of MULTI_SYMBOLS) {
    const range = await getSymbolDateRange(symbol);
    console.log(`  ${symbol}: ${range.count} candles`);
  }

  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
