// ─────────────────────────────────────────────
// src/report/reportWriter.ts
// ─────────────────────────────────────────────

import * as fs             from "fs";
import * as path           from "path";
import { ProcessedCandle } from "../processors/candleProcessor";
import { SimulationReport, TradeReport, VolumeGroup } from "./reportTypes";

// ── Formatters ────────────────────────────────────────────────────────────

function fmtDate(tsMs: number | bigint): string {
  return new Date(Number(tsMs) - 3 * 3600 * 1000)
    .toISOString().replace("T", " ").slice(0, 19) + " GMT-3";
}

function fmtN(n: number | null | undefined, dec = 2): string {
  return n == null ? "—" : n.toFixed(dec);
}

function fmtP(n: number): string {
  return (n >= 0 ? "+" : "") + n.toFixed(3) + "%";
}

function fmtSign(n: number): string {
  return (n >= 0 ? "+" : "") + "$" + n.toFixed(2);
}

function fmtVol(v: number): string {
  return v.toLocaleString("en-US", { maximumFractionDigits: 4 });
}

// ── Candle table (1h) ─────────────────────────────────────────────────────

function candleTable1h(candles: ProcessedCandle[], label: string): string {
  const header = [
    `#### ${label}`,
    "",
    "| Time (GMT-3) | Open | High | Low | Close | MA20 | MA99 | Volume | VolAvg | VolRatio |",
    "|---|---|---|---|---|---|---|---|---|---|",
  ].join("\n");

  const rows = candles.map(c => [
    `| ${fmtDate(c.openTime)}`,
    fmtN(c.open),
    fmtN(c.high),
    fmtN(c.low),
    fmtN(c.close),
    fmtN(c.ma20),
    fmtN(c.ma99),
    fmtVol(c.volume),
    fmtN(c.volAvg, 4),
    fmtN(c.volRatio, 3) + " |",
  ].join(" | ")).join("\n");

  return header + "\n" + rows + "\n";
}

// ── Volume group section ──────────────────────────────────────────────────

function volumeGroupSection(g: VolumeGroup, label: string): string {
  const lines: string[] = [];
  lines.push(`### ${label} (n=${g.count})`);
  lines.push("");
  lines.push("| Metric | Value |");
  lines.push("|---|---|");
  lines.push(`| Avg volume at buy     | ${fmtVol(g.avgVolume)} |`);
  lines.push(`| Avg volRatio at buy   | ${fmtN(g.avgVolRatio, 3)} |`);
  lines.push(`| Median volRatio       | ${fmtN(g.medianVolRatio, 3)} |`);
  lines.push("");
  lines.push("**VolRatio distribution at buy:**");
  lines.push("");
  lines.push("| Range | Count | % |");
  lines.push("|---|---|---|");
  const total = g.count || 1;
  [
    ["< 1.0 (below avg)",  g.ratioDist.below1],
    ["1.0 – 1.5",          g.ratioDist.r1_1_5],
    ["1.5 – 2.0",          g.ratioDist.r1_5_2],
    ["2.0 – 3.0",          g.ratioDist.r2_3],
    ["> 3.0",              g.ratioDist.above3],
    ["No data",            g.ratioDist.noData],
  ].forEach(([lbl, cnt]) => {
    const c = cnt as number;
    lines.push(`| ${lbl} | ${c} | ${((c / total) * 100).toFixed(1)}% |`);
  });
  lines.push("");
  return lines.join("\n");
}

// ── Trade section ─────────────────────────────────────────────────────────

function tradeSection(r: TradeReport): string {
  const t    = r.trade;
  const v    = r.buyVolume;
  const sign = t.pnlUsdt >= 0 ? "+" : "";
  const lines: string[] = [];

  lines.push(`### Trade #${String(r.index).padStart(3, "0")} — ${r.isPositive ? "✅ POSITIVE" : "❌ NEGATIVE"}`);
  lines.push("");

  // Summary
  lines.push("| Field | Value |");
  lines.push("|---|---|");
  lines.push(`| Buy time      | ${fmtDate(t.buy.openTime)} |`);
  lines.push(`| Buy price     | $${fmtN(t.buy.price)} |`);
  lines.push(`| USDT spent    | $${fmtN(t.buy.usdtSpent)} |`);
  lines.push(`| BTC acquired  | ${fmtN(t.buy.btcNet, 8)} BTC |`);
  lines.push(`| Sell time     | ${fmtDate(t.sell.closeTime)} |`);
  lines.push(`| Sell price    | $${fmtN(t.sell.price)} |`);
  lines.push(`| USDT received | $${fmtN(t.sell.usdtNet)} |`);
  lines.push(`| **P&L**       | **${sign}$${fmtN(t.pnlUsdt)} (${fmtP(t.pnlPct)})** |`);
  lines.push("");

  // Volume at buy
  lines.push("#### 📊 Volume at Buy Signal");
  lines.push("");
  lines.push("| Metric | Value |");
  lines.push("|---|---|");
  lines.push(`| Volume        | ${fmtVol(v.volume)} |`);
  lines.push(`| VolAvg (MA20) | ${fmtN(v.volAvg, 4)} |`);
  lines.push(`| VolRatio      | **${fmtN(v.volRatio, 3)}** |`);
  lines.push("");

  // Pre-buy 1h context
  lines.push("---");
  lines.push("");
  lines.push(candleTable1h(v.pre5h, "1h — 5 candles before buy"));

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

  // Header
  lines.push("# Bot7 — Simulation Report");
  lines.push("");
  lines.push(`> Generated: ${report.generatedAt}`);
  lines.push("");

  // Summary
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

  // Volume analysis
  lines.push("---");
  lines.push("");
  lines.push("## 📊 Volume Analysis at Buy Signal");
  lines.push("");
  lines.push("> **volRatio = volume / SMA(volume, 20)**");
  lines.push("> A ratio > 1 means above-average volume. Higher ratio = stronger confirmation.");
  lines.push("");
  lines.push(volumeGroupSection(report.volumeStats.pos, "✅ Positive trades"));
  lines.push(volumeGroupSection(report.volumeStats.neg, "❌ Negative trades"));

  // Trade index
  lines.push("---");
  lines.push("");
  lines.push("## Trade Index");
  lines.push("");
  lines.push("| # | Result | Buy Time | Buy Price | Sell Time | Sell Price | P&L | VolRatio | Balance |");
  lines.push("|---|---|---|---|---|---|---|---|---|");

  let balance = 10000;
  for (const r of [...report.positive, ...report.negative].sort((a, b) => a.index - b.index)) {
    balance += r.trade.pnlUsdt;
    const icon = r.isPositive ? "✅" : "❌";
    lines.push(
      `| ${r.index} | ${icon}` +
      ` | ${fmtDate(r.trade.buy.openTime)} | $${fmtN(r.trade.buy.price)}` +
      ` | ${fmtDate(r.trade.sell.closeTime)} | $${fmtN(r.trade.sell.price)}` +
      ` | ${fmtSign(r.trade.pnlUsdt)} (${fmtP(r.trade.pnlPct)})` +
      ` | ${fmtN(r.buyVolume.volRatio, 3)}` +
      ` | $${fmtN(balance)} |`
    );
  }
  lines.push("");

  // Positive group
  lines.push("---");
  lines.push("");
  lines.push(`## ✅ Positive Trades (${report.positiveCount})`);
  lines.push("");
  for (const r of report.positive) lines.push(tradeSection(r));

  // Negative group
  lines.push("---");
  lines.push("");
  lines.push(`## ❌ Negative Trades (${report.negativeCount})`);
  lines.push("");
  for (const r of report.negative) lines.push(tradeSection(r));

  fs.writeFileSync(filename, lines.join("\n"), "utf8");
  return filename;
}
