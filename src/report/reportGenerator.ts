// ─────────────────────────────────────────────
// src/report/reportGenerator.ts
// ─────────────────────────────────────────────

import { ProcessedCandle }         from "../processors/candleProcessor";
import { Trade, SimulationResult } from "../simulator/types";
import {
  TradeReport,
  BuyVolumeData,
  VolumeGroup,
  SimulationReport,
} from "./reportTypes";

// ── Helpers ───────────────────────────────────────────────────────────────

function avg(arr: number[]): number {
  return arr.length === 0 ? 0 : arr.reduce((s, v) => s + v, 0) / arr.length;
}

function median(arr: number[]): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid    = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

function alignedIndex(candles: ProcessedCandle[], targetMs: number): number {
  const target = BigInt(targetMs);
  let lo = 0, hi = candles.length - 1, result = 0;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (BigInt(candles[mid].openTime) <= target) { result = mid; lo = mid + 1; }
    else hi = mid - 1;
  }
  return result;
}

// ── Buy volume data ───────────────────────────────────────────────────────

function buildBuyVolumeData(
  trade:     Trade,
  candles1m: ProcessedCandle[]
): BuyVolumeData {
  const idx    = alignedIndex(candles1m, trade.buy.openTime);
  const candle = candles1m[idx];
  const pre5h  = candles1m.slice(Math.max(0, idx - 5), idx);
  return {
    volume:   candle.volume,
    volAvg:   candle.volAvg,
    volRatio: candle.volRatio,
    pre5h,
  };
}

// ── Volume group stats ────────────────────────────────────────────────────

function buildVolumeGroup(reports: TradeReport[]): VolumeGroup {
  if (reports.length === 0) {
    return {
      count: 0, avgVolume: 0, avgVolRatio: 0, medianVolRatio: 0,
      ratioDist: { below1: 0, r1_1_5: 0, r1_5_2: 0, r2_3: 0, above3: 0, noData: 0 },
    };
  }
  const volumes   = reports.map(r => r.buyVolume.volume);
  const ratios    = reports.map(r => r.buyVolume.volRatio).filter((v): v is number => v !== null);
  const allRatios = reports.map(r => r.buyVolume.volRatio);
  const dist = { below1: 0, r1_1_5: 0, r1_5_2: 0, r2_3: 0, above3: 0, noData: 0 };
  allRatios.forEach(r => {
    if (r === null)   dist.noData++;
    else if (r < 1)   dist.below1++;
    else if (r < 1.5) dist.r1_1_5++;
    else if (r < 2)   dist.r1_5_2++;
    else if (r < 3)   dist.r2_3++;
    else              dist.above3++;
  });
  return {
    count: reports.length,
    avgVolume: avg(volumes),
    avgVolRatio: avg(ratios),
    medianVolRatio: median(ratios),
    ratioDist: dist,
  };
}

// ── Main assembler ────────────────────────────────────────────────────────

export function buildReport(
  result:        SimulationResult,
  candles1m:     ProcessedCandle[],
  totalFeesPaid: number
): SimulationReport {
  const tradeReports: TradeReport[] = result.trades.map((trade, i) => ({
    index:      i + 1,
    trade,
    buyVolume:  buildBuyVolumeData(trade, candles1m),
    isPositive: trade.pnlUsdt >= 0,
    pnlPct:     trade.pnlPct,
  }));

  const positive = tradeReports.filter(r => r.isPositive);
  const negative = tradeReports.filter(r => !r.isPositive);

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
    volumeStats: {
      pos: buildVolumeGroup(positive),
      neg: buildVolumeGroup(negative),
    },
    positive,
    negative,
  };
}
