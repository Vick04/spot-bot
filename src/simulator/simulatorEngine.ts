// ─────────────────────────────────────────────
// src/simulator/simulatorEngine.ts
// ─────────────────────────────────────────────

import { executeBuy }                            from "./buyExecutor";
import { executeSell }                           from "./sellExecutor";
import { buildTrade, buildSimulationResult }     from "./tradeManager";
import { checkBuyCondition, checkSellCondition } from "./conditions";
import { WalletState, BuyOrder, Trade, SimulationResult, CandleContext } from "./types";
import { INITIAL_BALANCE_USDT, FEE_RATE }        from "../config/constants";
import { ProcessedCandle }                       from "../processors/candleProcessor";

export interface SimulatorOptions {
  feeRate?: number;
}

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

export function runSimulation(
  candles1m:  ProcessedCandle[],
  candles15m: ProcessedCandle[],
  candles1h:  ProcessedCandle[],
  options:    SimulatorOptions = {}
): SimulationResult {
  const feeRate = options.feeRate ?? FEE_RATE;
  const wallet: WalletState = { usdt: INITIAL_BALANCE_USDT, btc: 0, inTrade: false };
  const trades: Trade[]             = [];
  let   pendingBuy: BuyOrder | null = null;

  for (let i = 0; i < candles1m.length; i++) {
    const candle1m  = candles1m[i];
    const ts        = Number(candle1m.openTime);
    const candle15m = candles15m[alignedIndex(candles15m, ts)];
    const candle1h  = candles1h [alignedIndex(candles1h,  ts)];
    const ctx: CandleContext = { candle1m, candle15m, candle1h };

    // ── Exit ────────────────────────────────────────────────────────────
    if (wallet.inTrade && pendingBuy) {
      if (checkSellCondition(candle1m.close, pendingBuy, candle1h)) {
        const sell = executeSell(wallet, candle1m.close, ts, i, feeRate);
        trades.push(buildTrade(pendingBuy, sell));
        pendingBuy = null;
        continue;
      }
    }

    // ── Entry ───────────────────────────────────────────────────────────
    if (checkBuyCondition(ctx, wallet.usdt, wallet.inTrade)) {
      pendingBuy = executeBuy(wallet, candle1m.close, ts, i, feeRate);
    }
  }

  return buildSimulationResult(trades, wallet.usdt);
}
