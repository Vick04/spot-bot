// ─────────────────────────────────────────────
// src/report/multiReportWriter.ts
// ─────────────────────────────────────────────

import * as fs   from "fs";
import * as path from "path";
import { SimTrade } from "../multi/orderManager";
import { INITIAL_BALANCE_USDT } from "../config/constants";

// ── Formatters ────────────────────────────────────────────────────────────

function fmtDate(ts: number): string {
  return new Date(ts - 3 * 3600_000)
    .toISOString().replace("T", " ").slice(0, 19) + " GMT-3";
}
function fmtN(n: number, dec = 2): string { return n.toFixed(dec); }
function fmtP(n: number): string { return (n >= 0 ? "+" : "") + n.toFixed(3) + "%"; }
function fmtSign(n: number): string { return (n >= 0 ? "+" : "") + "$" + n.toFixed(2); }

// ── Main writer ───────────────────────────────────────────────────────────

export function writeMultiReport(
  trades:             SimTrade[],
  balance:            number,
  symbols:            readonly string[],
  openOrderReverted?: { symbol: string; buyPrice: number; buyTs: number } | null,
  outputDir = "reports"
): string {
  const absDir = path.resolve(process.cwd(), outputDir);
  if (!fs.existsSync(absDir)) fs.mkdirSync(absDir, { recursive: true });

  const generatedAt = new Date().toISOString();
  const timestamp   = generatedAt.replace(/[:.]/g, "-").slice(0, 19);
  const filename    = path.join(absDir, `multi-report-${timestamp}.md`);

  const pos      = trades.filter(t => t.pnlPct > 0);
  const neg      = trades.filter(t => t.pnlPct <= 0);
  const winRate  = trades.length ? pos.length / trades.length * 100 : 0;
  const totalPnl = balance - INITIAL_BALANCE_USDT;
  const avgPnl   = trades.length
    ? trades.reduce((s, t) => s + t.pnlPct, 0) / trades.length
    : 0;

  const lines: string[] = [];

  // ── Header ─────────────────────────────────────────────────────────────
  lines.push("# Bot7 — Multi-Symbol Simulation Report");
  lines.push("");
  lines.push(`> Generated: ${generatedAt}`);
  lines.push(`> Symbols: ${symbols.join(", ")}`);
  lines.push("");

  // ⚠️ Open order warning
  if (openOrderReverted) {
    lines.push("> ⚠️ **Open order reverted:** simulation ended before the last buy order reached its sell target.");
    lines.push(`> The order for **${openOrderReverted.symbol}** (bought @ ${fmtN(openOrderReverted.buyPrice)} on ${fmtDate(openOrderReverted.buyTs)}) was undone.`);
    lines.push("> Balance and results reflect only the completed trades.");
    lines.push("");
  }

  // ── Trade log ──────────────────────────────────────────────────────────
  lines.push("---");
  lines.push("");
  lines.push("## Trade Log");
  lines.push("");
  lines.push("| # | | Symbol | Strategy | Buy Time | Buy Price | Sell Time | Sell Price | P&L% | P&L Net | Balance |");
  lines.push("|---|---|---|---|---|---|---|---|---|---|---|");

  trades.forEach((t, i) => {
    const icon   = t.isStopLoss ? "🛑" : t.pnlPct > 0 ? "✅" : "❌";
    const pnlNet = t.usdtNet - t.usdtSpent;
    lines.push(
      `| ${i + 1} | ${icon}` +
      ` | ${t.symbol}` +
      ` | ${t.strategy ?? "?"}` +
      ` | ${fmtDate(t.buyTs)}` +
      ` | ${fmtN(t.buyPrice)}` +
      ` | ${fmtDate(t.sellTs)}` +
      ` | ${fmtN(t.sellPrice)}` +
      ` | ${fmtP(t.pnlPct)}` +
      ` | ${fmtSign(pnlNet)}` +
      ` | ${fmtN(t.usdtNet)} |`
    );
  });
  lines.push("");

  // ── Per-symbol breakdown ───────────────────────────────────────────────
  lines.push("---");
  lines.push("");
  lines.push("## Per-Symbol Breakdown");
  lines.push("");
  lines.push("| Symbol | Trades | Participation | Avg P&L | Pos | Neg |");
  lines.push("|---|---|---|---|---|---|");

  for (const symbol of symbols) {
    const symTrades = trades.filter(t => t.symbol === symbol);
    const symPos    = symTrades.filter(t => t.pnlPct > 0).length;
    const symNeg    = symTrades.filter(t => t.pnlPct <= 0).length;
    const symAvg    = symTrades.length
      ? symTrades.reduce((s, t) => s + t.pnlPct, 0) / symTrades.length
      : 0;
    const participation = trades.length
      ? symTrades.length / trades.length * 100
      : 0;

    lines.push(
      `| ${symbol}` +
      ` | ${symTrades.length}` +
      ` | ${fmtN(participation, 1)}%` +
      ` | ${symTrades.length ? fmtP(symAvg) : "—"}` +
      ` | ${symPos}` +
      ` | ${symNeg} |`
    );
  }
  lines.push("");

  // ── Results summary ────────────────────────────────────────────────────
  lines.push("---");
  lines.push("");
  lines.push("## Results");
  lines.push("");
  lines.push("| Metric | Value |");
  lines.push("|---|---|");
  lines.push(`| Total trades    | ${trades.length} |`);
  lines.push(`| Positive        | ${pos.length} ✅ |`);
  lines.push(`| Negative        | ${neg.length} ❌ |`);
  lines.push(`| Win rate        | ${fmtN(winRate)}% |`);
  lines.push(`| Initial balance | $${fmtN(INITIAL_BALANCE_USDT)} |`);
  lines.push(`| Final balance   | $${fmtN(balance)} |`);
  lines.push(`| Total P&L       | ${fmtSign(totalPnl)} (${fmtP(totalPnl / INITIAL_BALANCE_USDT * 100)}) |`);
  lines.push(`| Avg P&L/trade   | ${fmtP(avgPnl)} |`);
  lines.push("");

  fs.writeFileSync(filename, lines.join("\n"), "utf8");
  return filename;
}
