// ─────────────────────────────────────────────
// src/report/reportWriter.ts
// Renders a SimulationReport to a Markdown file
// ─────────────────────────────────────────────

import * as fs             from "fs";
import * as path           from "path";
import { ProcessedCandle } from "../processors/candleProcessor";
import { SimulationReport, TradeReport, MomentumGroup } from "./reportTypes";

// ── Formatters ────────────────────────────────────────────────────────────

function fmtDate(tsMs: number | bigint): string {
  return new Date(Number(tsMs) - 3 * 3600 * 1000)
    .toISOString().replace("T", " ").slice(0, 19) + " GMT-3";
}

function fmtN(n: number | null | undefined, dec = 2): string {
  if (n == null) return "—";
  return n.toFixed(dec);
}

function fmtP(n: number): string {
  return (n >= 0 ? "+" : "") + n.toFixed(3) + "%";
}

function fmtSign(n: number): string {
  return (n >= 0 ? "+" : "") + "$" + n.toFixed(2);
}

// ── Candle table ──────────────────────────────────────────────────────────

function candleTable(candles: ProcessedCandle[], label: string): string {
  const header = [
    `#### ${label}`,
    "",
    "| Time (GMT-3) | Open | High | Low | Close | MA20 | MA99 | BB Upper | BB Lower | TRIX | SuperTrend | ST Dir |",
    "|---|---|---|---|---|---|---|---|---|---|---|---|",
  ].join("\n");

  const rows = candles.map((c) => {
    const dir = c.stDirection == null ? "—" : c.stDirection === 1 ? "▲" : "▼";
    return [
      `| ${fmtDate(c.openTime)}`,
      `${fmtN(c.open)}`,
      `${fmtN(c.high)}`,
      `${fmtN(c.low)}`,
      `${fmtN(c.close)}`,
      `${fmtN(c.ma20)}`,
      `${fmtN(c.ma99)}`,
      `${fmtN(c.bbUpper)}`,
      `${fmtN(c.bbLower)}`,
      `${fmtN(c.trix)}`,
      `${fmtN(c.superTrend)}`,
      `${dir} |`,
    ].join(" | ");
  }).join("\n");

  return header + "\n" + rows + "\n";
}

function singleCandleTable(c: ProcessedCandle, label: string): string {
  return candleTable([c], label);
}

// ── Momentum group section ────────────────────────────────────────────────

function momentumGroupSection(g: MomentumGroup, label: string): string {
  const lines: string[] = [];
  lines.push(`### ${label} (n=${g.count})`);
  lines.push("");
  lines.push("| Metric | Value |");
  lines.push("|---|---|");
  lines.push(`| Avg separation at buy         | ${fmtN(g.avgSepAtBuy, 4)} |`);
  lines.push(`| Avg max sep (last 10 candles) | ${fmtN(g.avgMaxSep10, 4)} |`);
  lines.push(`| Avg candles above BB (of 10)  | ${fmtN(g.avgCandlesAbove, 2)} |`);
  lines.push(`| Avg separation last 3         | ${fmtN(g.avgSep3, 4)} |`);
  lines.push(`| Avg separation last 5         | ${fmtN(g.avgSep5, 4)} |`);
  lines.push(`| Avg separation last 10        | ${fmtN(g.avgSep10, 4)} |`);
  lines.push(`| Avg slope last 3              | ${fmtN(g.avgSlope3, 4)} |`);
  lines.push(`| Avg slope last 5              | ${fmtN(g.avgSlope5, 4)} |`);
  lines.push(`| Avg slope last 10             | ${fmtN(g.avgSlope10, 4)} |`);
  lines.push("");
  lines.push("**Separation at buy distribution** (`close - bbUpper`):");
  lines.push("");
  lines.push("| Range | Count | % |");
  lines.push("|---|---|---|");
  const total = g.count || 1;
  const d = g.sepAtBuyDist;
  [
    ["< 0 (below BB)",  d.neg],
    ["0 – 50",          d.p0_50],
    ["50 – 100",        d.p50_100],
    ["100 – 200",       d.p100_200],
    ["200 – 500",       d.p200_500],
    ["500+",            d.p500plus],
  ].forEach(([label, count]) => {
    const c = count as number;
    lines.push(`| ${label} | ${c} | ${((c / total) * 100).toFixed(1)}% |`);
  });
  lines.push("");
  return lines.join("\n");
}

// ── Trade section ─────────────────────────────────────────────────────────

function tradeSection(r: TradeReport, num: number): string {
  const t    = r.trade;
  const m    = r.buyMomentum;
  const sign = t.pnlUsdt >= 0 ? "+" : "";
  const lines: string[] = [];

  lines.push(`### Trade #${String(num).padStart(3, "0")} — ${r.isPositive ? "✅ POSITIVE" : "❌ NEGATIVE"}`);
  lines.push("");

  // ── Summary
  lines.push("| Field | Value |");
  lines.push("|---|---|");
  lines.push(`| Buy time      | ${fmtDate(t.buy.openTime)} |`);
  lines.push(`| Buy price     | $${fmtN(t.buy.price)} |`);
  lines.push(`| USDT spent    | $${fmtN(t.buy.usdtSpent)} |`);
  lines.push(`| BTC acquired  | ${fmtN(t.buy.btcNet, 8)} BTC |`);
  lines.push(`| Buy fee       | ${fmtN(t.buy.feeBtc, 8)} BTC |`);
  lines.push(`| Sell time     | ${fmtDate(t.sell.closeTime)} |`);
  lines.push(`| Sell price    | $${fmtN(t.sell.price)} |`);
  lines.push(`| USDT received | $${fmtN(t.sell.usdtNet)} |`);
  lines.push(`| Sell fee      | $${fmtN(t.sell.feeUsdt)} |`);
  lines.push(`| **P&L**       | **${sign}$${fmtN(t.pnlUsdt)} (${fmtP(t.pnlPct)})** |`);
  lines.push("");

  // ── Peak analysis
  const p = r.peak;
  lines.push("#### 📈 Peak Analysis");
  lines.push("");
  lines.push("| Field | Value |");
  lines.push("|---|---|");
  lines.push(`| Peak price    | $${fmtN(p.price)} |`);
  lines.push(`| Peak time     | ${fmtDate(p.openTime)} |`);
  lines.push(`| Sell price    | $${fmtN(t.sell.price)} |`);
  lines.push(`| Peak vs sell  | ${fmtSign(p.price - t.sell.price)} |`);
  lines.push(`| Missed gain   | ${fmtP(p.missedGainPct)} of entry |`);
  lines.push(`| Max potential | ${fmtP(r.maxPotPct)} |`);
  lines.push("");

  // ── Buy momentum
  lines.push("#### ⚡ Buy Momentum (separation = close − bbUpper)");
  lines.push("");
  lines.push("| Metric | Value |");
  lines.push("|---|---|");
  lines.push(`| Separation at buy candle  | ${fmtN(m.separationAtBuy, 4)} |`);
  lines.push(`| Avg sep last 3 candles    | ${fmtN(m.avgSep3, 4)} |`);
  lines.push(`| Avg sep last 5 candles    | ${fmtN(m.avgSep5, 4)} |`);
  lines.push(`| Avg sep last 10 candles   | ${fmtN(m.avgSep10, 4)} |`);
  lines.push(`| Slope last 3              | ${fmtN(m.slopeOf3, 4)} |`);
  lines.push(`| Slope last 5              | ${fmtN(m.slopeOf5, 4)} |`);
  lines.push(`| Slope last 10             | ${fmtN(m.slopeOf10, 4)} |`);
  lines.push(`| Max sep in last 10        | ${fmtN(m.maxSep10, 4)} |`);
  lines.push(`| Candles above BB (of 10)  | ${m.candlesAboveBB10} / 10 |`);
  lines.push("");
  lines.push("**Last 10 separations** (oldest → newest):");
  lines.push("");
  lines.push("| # | Sep (close − bbUpper) |");
  lines.push("|---|---|");
  m.separations.forEach((s, i) => {
    lines.push(`| -${m.separations.length - i} | ${fmtN(s, 4)} |`);
  });
  lines.push("");

  // ── Buy context candles
  lines.push("---");
  lines.push("");
  lines.push("#### 🕯️ Context at Buy Signal");
  lines.push("");
  lines.push(candleTable(r.buyContext.pre1m,  "1m — 60 candles before buy"));
  lines.push(candleTable(r.buyContext.pre15m, "15m — 4 candles before buy"));
  lines.push(singleCandleTable(r.buyContext.pre1h, "1h — candle before buy"));

  // ── Peak context
  lines.push("---");
  lines.push("");
  lines.push("#### 🏔️ Peak Context (30 before / 30 after)");
  lines.push("");
  lines.push(candleTable(r.peak.pre1m,   "1m — 30 candles before peak"));
  lines.push(candleTable(r.peak.post1m,  "1m — 30 candles after peak"));
  lines.push(candleTable(r.peak.pre15m,  "15m — 2 candles before peak"));
  lines.push(candleTable(r.peak.post15m, "15m — 2 candles after peak"));
  lines.push(singleCandleTable(r.peak.aligned1h, "1h — aligned candle at peak"));

  lines.push("");
  lines.push("---");
  lines.push("");

  return lines.join("\n");
}

// ── Main writer ───────────────────────────────────────────────────────────

export function writeReport(report: SimulationReport, outputDir = "reports"): string {
  const absDir = path.resolve(process.cwd(), outputDir);
  if (!fs.existsSync(absDir)) fs.mkdirSync(absDir, { recursive: true });

  const timestamp = report.generatedAt.replace(/[:.]/g, "-").slice(0, 19);
  const filename  = path.join(absDir, `simulation-report-${timestamp}.md`);
  const lines: string[] = [];

  // ── Header
  lines.push("# Bot7 — Simulation Report");
  lines.push("");
  lines.push(`> Generated: ${report.generatedAt}`);
  lines.push("");

  // ── Global summary
  lines.push("## Summary");
  lines.push("");
  lines.push("| Metric | Value |");
  lines.push("|---|---|");
  lines.push(`| Total trades    | ${report.totalTrades} |`);
  lines.push(`| Positive        | ${report.positiveCount} ✅ |`);
  lines.push(`| Negative        | ${report.negativeCount} ❌ |`);
  lines.push(`| Win rate        | ${fmtN(report.winRate)}% |`);
  lines.push(`| Final balance   | $${fmtN(report.finalBalance)} |`);
  lines.push(`| Total P&L       | ${fmtSign(report.totalPnlUsdt)} (${fmtP(report.totalPnlPct)}) |`);
  lines.push(`| Total fees paid | $${fmtN(report.totalFeesPaid)} |`);
  lines.push("");

  // ── Momentum pattern analysis
  lines.push("---");
  lines.push("");
  lines.push("## ⚡ Momentum Pattern Analysis");
  lines.push("");
  lines.push("> **separation = close − bbUpper** at buy signal.");
  lines.push("> Higher = price pulled further above the band = stronger breakout.");
  lines.push("> **slope** = how fast the separation grew per candle (positive = accelerating).");
  lines.push("> **noise** = trades where max potential was < 0.1% (no real movement).");
  lines.push("");
  lines.push(momentumGroupSection(report.momentumStats.pos,   "✅ Positive trades"));
  lines.push(momentumGroupSection(report.momentumStats.neg,   "❌ Negative trades"));
  lines.push(momentumGroupSection(report.momentumStats.noise, "🔇 Noise trades (max potential < 0.1%)"));

  // ── Trade index
  lines.push("---");
  lines.push("");
  lines.push("## Trade Index");
  lines.push("");
  lines.push("| # | Result | Buy | Buy Price | Sell | Sell Price | P&L | Max Pot% | SepAtBuy | Balance |");
  lines.push("|---|---|---|---|---|---|---|---|---|---|");

  let balance = 10000;
  for (const r of [...report.positive, ...report.negative].sort((a, b) => a.index - b.index)) {
    balance += r.trade.pnlUsdt;
    const icon = r.isPositive ? "✅" : "❌";
    lines.push(
      `| ${r.index} | ${icon}` +
      ` | ${fmtDate(r.trade.buy.openTime)} | $${fmtN(r.trade.buy.price)}` +
      ` | ${fmtDate(r.trade.sell.closeTime)} | $${fmtN(r.trade.sell.price)}` +
      ` | ${fmtSign(r.trade.pnlUsdt)} (${fmtP(r.trade.pnlPct)})` +
      ` | ${fmtP(r.maxPotPct)}` +
      ` | ${fmtN(r.buyMomentum.separationAtBuy, 2)}` +
      ` | $${fmtN(balance)} |`
    );
  }
  lines.push("");

  // ── Positive group
  lines.push("---");
  lines.push("");
  lines.push(`## ✅ Positive Trades (${report.positiveCount})`);
  lines.push("");
  for (const r of report.positive) lines.push(tradeSection(r, r.index));

  // ── Negative group
  lines.push("---");
  lines.push("");
  lines.push(`## ❌ Negative Trades (${report.negativeCount})`);
  lines.push("");
  for (const r of report.negative) lines.push(tradeSection(r, r.index));

  fs.writeFileSync(filename, lines.join("\n"), "utf8");
  return filename;
}
