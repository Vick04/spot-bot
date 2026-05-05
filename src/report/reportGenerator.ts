// ─────────────────────────────────────────────
// src/report/reportGenerator.ts
// ─────────────────────────────────────────────

import { ProcessedCandle }  from "../processors/candleProcessor";
import { Trade, SimulationResult } from "../simulator/types";
import {
  TradeReport,
  BuyContext,
  BuyMomentum,
  PeakData,
  SimulationReport,
  MomentumStats,
  MomentumGroup,
} from "./reportTypes";

// ── Helpers ───────────────────────────────────────────────────────────────

function alignedIndex(coarseCandles: ProcessedCandle[], targetMs: number): number {
  const target = BigInt(targetMs);
  let lo = 0, hi = coarseCandles.length - 1, result = 0;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (BigInt(coarseCandles[mid].openTime) <= target) { result = mid; lo = mid + 1; }
    else hi = mid - 1;
  }
  return result;
}

function slice(arr: ProcessedCandle[], center: number, before: number, after = 0): ProcessedCandle[] {
  const from = Math.max(0, center - before);
  const to   = Math.min(arr.length, center + after + 1);
  return arr.slice(from, to);
}

function avg(arr: number[]): number {
  return arr.length === 0 ? 0 : arr.reduce((s, v) => s + v, 0) / arr.length;
}

function slope(arr: number[]): number {
  if (arr.length < 2) return 0;
  return (arr[arr.length - 1] - arr[0]) / (arr.length - 1);
}

// ── Buy context ───────────────────────────────────────────────────────────

function buildBuyContext(
  trade:      Trade,
  candles1m:  ProcessedCandle[],
  candles15m: ProcessedCandle[],
  candles1h:  ProcessedCandle[]
): BuyContext {
  const buyIdx1m = trade.buy.idx1m;
  const buyTs    = trade.buy.openTime;

  const pre1m  = slice(candles1m, buyIdx1m - 1, 60);
  const idx15m = alignedIndex(candles15m, buyTs);
  const pre15m = slice(candles15m, idx15m - 1, 4);
  const idx1h  = alignedIndex(candles1h, buyTs);
  const pre1h  = candles1h[Math.max(0, idx1h - 1)];

  return { pre1m, pre15m, pre1h };
}

// ── Buy momentum ──────────────────────────────────────────────────────────

/**
 * Compute separation momentum metrics from the 1m candles immediately
 * before the buy signal.
 *
 * separation = close - bbUpper  (positive when price is above the band)
 */
function buildBuyMomentum(
  trade:     Trade,
  candles1m: ProcessedCandle[]
): BuyMomentum {
  const buyIdx    = trade.buy.idx1m;
  const buyCandl  = candles1m[buyIdx];

  // Separation at the buy candle itself
  const separationAtBuy =
    buyCandl.bbUpper !== null
      ? buyCandl.close - (buyCandl.bbUpper as number)
      : 0;

  // Gather last 10 candles strictly BEFORE the buy (not including it)
  const window = slice(candles1m, buyIdx - 1, 10);

  const separations = window.map((c) =>
    c.bbUpper !== null ? c.close - (c.bbUpper as number) : 0
  );

  const last3  = separations.slice(-3);
  const last5  = separations.slice(-5);
  const last10 = separations;

  const maxSep10         = Math.max(...separations);
  const candlesAboveBB10 = separations.filter((s) => s > 0).length;

  return {
    separations,
    avgSep3:          avg(last3),
    avgSep5:          avg(last5),
    avgSep10:         avg(last10),
    slopeOf3:         slope(last3),
    slopeOf5:         slope(last5),
    slopeOf10:        slope(last10),
    separationAtBuy,
    maxSep10,
    candlesAboveBB10,
  };
}

// ── Peak detection ────────────────────────────────────────────────────────

function buildPeakData(
  trade:      Trade,
  candles1m:  ProcessedCandle[],
  candles15m: ProcessedCandle[],
  candles1h:  ProcessedCandle[]
): PeakData {
  const buyIdx  = trade.buy.idx1m;
  const sellIdx = trade.sell.idx1m;

  let peakPrice = -Infinity;
  let peakIdx   = buyIdx;
  for (let i = buyIdx; i <= sellIdx; i++) {
    if (candles1m[i].high > peakPrice) {
      peakPrice = candles1m[i].high;
      peakIdx   = i;
    }
  }

  const peakTs     = Number(candles1m[peakIdx].openTime);
  const pre1m      = slice(candles1m, peakIdx, 30, 0);
  const post1m     = slice(candles1m, peakIdx, 0, 30);
  const peakIdx15m = alignedIndex(candles15m, peakTs);
  const pre15m     = slice(candles15m, peakIdx15m, 2, 0);
  const post15m    = slice(candles15m, peakIdx15m, 0, 2);
  const peakIdx1h  = alignedIndex(candles1h, peakTs);
  const aligned1h  = candles1h[peakIdx1h];
  const missedGainPct = ((peakPrice - trade.sell.price) / trade.buy.price) * 100;

  return { price: peakPrice, idx1m: peakIdx, openTime: peakTs, pre1m, post1m, pre15m, post15m, aligned1h, missedGainPct };
}

// ── Momentum group stats ──────────────────────────────────────────────────

function buildMomentumGroup(reports: TradeReport[]): MomentumGroup {
  if (reports.length === 0) {
    const empty = { neg: 0, p0_50: 0, p50_100: 0, p100_200: 0, p200_500: 0, p500plus: 0 };
    return { count: 0, avgSep3: 0, avgSep5: 0, avgSep10: 0, avgSlope3: 0, avgSlope5: 0, avgSlope10: 0, avgSepAtBuy: 0, avgMaxSep10: 0, avgCandlesAbove: 0, sepAtBuyDist: empty };
  }

  const ms = reports.map((r) => r.buyMomentum);

  const dist = { neg: 0, p0_50: 0, p50_100: 0, p100_200: 0, p200_500: 0, p500plus: 0 };
  ms.forEach(({ separationAtBuy: s }) => {
    if      (s <   0)   dist.neg++;
    else if (s <  50)   dist.p0_50++;
    else if (s < 100)   dist.p50_100++;
    else if (s < 200)   dist.p100_200++;
    else if (s < 500)   dist.p200_500++;
    else                dist.p500plus++;
  });

  return {
    count:           reports.length,
    avgSep3:         avg(ms.map((m) => m.avgSep3)),
    avgSep5:         avg(ms.map((m) => m.avgSep5)),
    avgSep10:        avg(ms.map((m) => m.avgSep10)),
    avgSlope3:       avg(ms.map((m) => m.slopeOf3)),
    avgSlope5:       avg(ms.map((m) => m.slopeOf5)),
    avgSlope10:      avg(ms.map((m) => m.slopeOf10)),
    avgSepAtBuy:     avg(ms.map((m) => m.separationAtBuy)),
    avgMaxSep10:     avg(ms.map((m) => m.maxSep10)),
    avgCandlesAbove: avg(ms.map((m) => m.candlesAboveBB10)),
    sepAtBuyDist:    dist,
  };
}

// ── Main assembler ────────────────────────────────────────────────────────

export function buildReport(
  result:        SimulationResult,
  candles1m:     ProcessedCandle[],
  candles15m:    ProcessedCandle[],
  candles1h:     ProcessedCandle[],
  totalFeesPaid: number
): SimulationReport {
  const tradeReports: TradeReport[] = result.trades.map((trade, i) => {
    const isPositive   = trade.pnlUsdt >= 0;
    const buyContext   = buildBuyContext(trade, candles1m, candles15m, candles1h);
    const buyMomentum  = buildBuyMomentum(trade, candles1m);
    const peak         = buildPeakData(trade, candles1m, candles15m, candles1h);
    const maxPotPct    = ((peak.price - trade.buy.price) / trade.buy.price) * 100;
    return { index: i + 1, trade, buyContext, buyMomentum, peak, isPositive, maxPotPct };
  });

  const positive = tradeReports.filter((r) => r.isPositive);
  const negative = tradeReports.filter((r) => !r.isPositive);
  const noise    = tradeReports.filter((r) => r.maxPotPct < 0.1);

  const momentumStats: MomentumStats = {
    pos:   buildMomentumGroup(positive),
    neg:   buildMomentumGroup(negative),
    noise: buildMomentumGroup(noise),
  };

  return {
    generatedAt:   new Date().toISOString(),
    totalTrades:   result.trades.length,
    positiveCount: positive.length,
    negativeCount: negative.length,
    winRate:       result.winRate,
    finalBalance:  result.finalBalance,
    totalPnlUsdt:  result.totalPnlUsdt,
    totalPnlPct:   result.totalPnlPct,
    totalFeesPaid,
    momentumStats,
    positive,
    negative,
  };
}
