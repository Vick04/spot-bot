// ─────────────────────────────────────────────
// src/simulateMulti.ts
// Entry point: run multi-symbol simulation
// Usage: npm run simulate:multi
// ─────────────────────────────────────────────

import { prisma }          from "./db/prismaClient";
import { MULTI_SYMBOLS, INITIAL_BALANCE_USDT } from "./config/constants";
import { SymbolObserver }  from "./multi/symbolObserver";
import { OrderManager }    from "./multi/orderManager";
import { ProcessedCandle } from "./processors/candleProcessor";
import { writeMultiReport } from "./report/multiReportWriter";

// ── Load candles from DB ──────────────────────────────────────────────────

async function loadSymbolCandles(symbol: string): Promise<ProcessedCandle[]> {
  const rows = await (prisma.symbolCandle1m as any).findMany({
    where:   { symbol },
    orderBy: { openTime: "asc" },
  });
  return rows.map((r: any) => ({
    openTime:    Number(r.openTime),
    open:        r.open,
    high:        r.high,
    low:         r.low,
    close:       r.close,
    volume:      r.volume,
    ma20:        r.ma20,
    ma99:        r.ma99,
    bbUpper:     r.bbUpper,
    bbLower:     r.bbLower,
    trix:        null,
    superTrend:  null,
    stDirection: null,
    volAvg:      r.volAvg   ?? null,
    volRatio:    r.volRatio ?? null,
  }));
}

// ── Synchronize candles by openTime ──────────────────────────────────────

function synchronizeCandles(
  allCandles: Map<string, ProcessedCandle[]>
): { maps: Map<string, ProcessedCandle>[]; timestamps: number[] } {
  const symbolTimes = new Map<string, Set<number>>();
  for (const [symbol, candles] of allCandles) {
    symbolTimes.set(symbol, new Set(candles.map(c => c.openTime)));
  }

  const symbols = [...allCandles.keys()];
  let commonTimes = symbolTimes.get(symbols[0])!;
  for (let i = 1; i < symbols.length; i++) {
    const times = symbolTimes.get(symbols[i])!;
    commonTimes = new Set([...commonTimes].filter(t => times.has(t)));
  }

  const sortedTimes = [...commonTimes].sort((a, b) => a - b);

  const indexed = new Map<string, Map<number, ProcessedCandle>>();
  for (const [symbol, candles] of allCandles) {
    const map = new Map<number, ProcessedCandle>();
    for (const c of candles) map.set(c.openTime, c);
    indexed.set(symbol, map);
  }

  const maps: Map<string, ProcessedCandle>[] = [];
  const timestamps: number[] = [];

  for (const ts of sortedTimes) {
    const candleMap = new Map<string, ProcessedCandle>();
    for (const symbol of symbols) {
      const candle = indexed.get(symbol)!.get(ts)!;
      candleMap.set(symbol, candle);
    }
    maps.push(candleMap);
    timestamps.push(ts);
  }

  return { maps, timestamps };
}

// ── Main ──────────────────────────────────────────────────────────────────

async function main() {
  console.log("=== Multi-symbol simulation ===");
  console.log("Symbols:", MULTI_SYMBOLS.join(", "));

  // Load candles
  console.log("\nLoading candles from DB...");
  const allCandles = new Map<string, ProcessedCandle[]>();
  for (const symbol of MULTI_SYMBOLS) {
    const candles = await loadSymbolCandles(symbol);
    console.log(`  ${symbol}: ${candles.length} candles`);
    allCandles.set(symbol, candles);
  }

  // Synchronize
  console.log("\nSynchronizing candles...");
  const { maps, timestamps } = synchronizeCandles(allCandles);
  console.log(`  Common timestamps: ${maps.length}`);
  if (maps.length === 0) {
    console.error("No common timestamps — check that all symbols have overlapping data");
    process.exit(1);
  }
  const startDate = new Date(timestamps[0] - 3*3600_000).toISOString().slice(0,16);
  const endDate   = new Date(timestamps[timestamps.length-1] - 3*3600_000).toISOString().slice(0,16);
  console.log(`  Range: ${startDate} → ${endDate} GMT-3`);

  // Warm up observers
  console.log("\nWarming up observers...");
  const manager = new OrderManager("simulator", INITIAL_BALANCE_USDT);
  for (const symbol of MULTI_SYMBOLS) {
    const observer = new SymbolObserver(symbol);
    await observer.warmup();
    manager.addObserver(observer);
    console.log(`  ${symbol} warmed up`);
  }

  // Run simulation
  console.log("\nRunning simulation...");
  const { balance, trades, openOrderReverted } = manager.simulate(maps, timestamps);

  // ── Formatters ────────────────────────────────────────────────────────
  const fmtDate = (ts: number) =>
    new Date(ts - 3*3600_000).toISOString().replace("T"," ").slice(0,16) + " GMT-3";
  const fmtN = (n: number, d = 2) => n.toFixed(d);

  const pos      = trades.filter(t => t.pnlPct > 0);
  const neg      = trades.filter(t => t.pnlPct <= 0);
  const winRate  = trades.length ? (pos.length / trades.length * 100) : 0;
  const totalPnl = balance - INITIAL_BALANCE_USDT;
  const avgPnl   = trades.length ? trades.reduce((s,t) => s+t.pnlPct, 0) / trades.length : 0;

  // ── Trade log ─────────────────────────────────────────────────────────
  console.log("\n" + "─".repeat(115));
  console.log("TRADE LOG");
  console.log("─".repeat(115));
  console.log("  # | Symbol     | Strat    | Buy Time            | Buy Price   | Sell Time           | Sell Price  | P&L%");
  console.log("  " + "─".repeat(112));
  trades.forEach((t, i) => {
    const icon = t.pnlPct > 0 ? "✅" : "❌";
    console.log(
      `  ${String(i+1).padStart(3)} | ${icon} ${t.symbol.padEnd(9)}| ${(t.strategy ?? "?").padEnd(8)} | ${fmtDate(t.buyTs)} | $${fmtN(t.buyPrice).padStart(10)} | ${fmtDate(t.sellTs)} | $${fmtN(t.sellPrice).padStart(10)} | ${t.pnlPct > 0 ? "+" : ""}${fmtN(t.pnlPct, 3)}%`
    );
  });

  // ── Per-symbol breakdown ──────────────────────────────────────────────
  console.log("\n" + "─".repeat(60));
  console.log("PER-SYMBOL BREAKDOWN");
  console.log("─".repeat(60));
  const symbolStats = new Map<string, { trades: number; pnl: number }>();
  for (const symbol of MULTI_SYMBOLS) symbolStats.set(symbol, { trades: 0, pnl: 0 });
  for (const t of trades) {
    const s = symbolStats.get(t.symbol)!;
    s.trades++;
    s.pnl += t.pnlPct;
  }
  for (const [symbol, stats] of symbolStats) {
    const participation = trades.length ? (stats.trades / trades.length * 100) : 0;
    const avgSymbolPnl  = stats.trades ? stats.pnl / stats.trades : 0;
    console.log(
      `  ${symbol.padEnd(10)} ${String(stats.trades).padStart(3)} trades` +
      `  participation: ${fmtN(participation, 1)}%` +
      `  avg P&L: ${avgSymbolPnl > 0 ? "+" : ""}${fmtN(avgSymbolPnl, 3)}%`
    );
  }

  // ── Results summary ───────────────────────────────────────────────────
  console.log("\n" + "─".repeat(60));
  console.log("RESULTS");
  console.log("─".repeat(60));
  console.log(`Total trades:   ${trades.length}`);
  console.log(`Positive:       ${pos.length}`);
  console.log(`Negative:       ${neg.length}`);
  console.log(`Win rate:       ${fmtN(winRate)}%`);
  console.log(`Final balance:  $${fmtN(balance)}`);
  console.log(`Total P&L:      $${fmtN(totalPnl)} (${fmtN(totalPnl / INITIAL_BALANCE_USDT * 100)}%)`);
  console.log(`Avg P&L/trade:  ${fmtN(avgPnl, 3)}%`);
  console.log("─".repeat(60));

  // Save report
  const reportPath = writeMultiReport(trades, balance, MULTI_SYMBOLS, openOrderReverted);
  console.log(`\nReport saved: ${reportPath}`);
  if (openOrderReverted) {
    console.log(`\n⚠️  Open order reverted: ${openOrderReverted.symbol} bought @ ${fmtN(openOrderReverted.buyPrice)} on ${fmtDate(openOrderReverted.buyTs)} — never reached sell target`);
    console.log(`   Balance shown is pre-buy balance (order was undone).`);
  }

  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
