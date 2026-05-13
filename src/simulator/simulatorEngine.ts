// ─────────────────────────────────────────────
// src/simulator/simulatorEngine.ts
// ─────────────────────────────────────────────

import { executeBuy }          from "./buyExecutor";
import { executeSell }         from "./sellExecutor";
import { buildTrade, buildSimulationResult } from "./tradeManager";
import {
  evaluateBuySequence,
  checkSellCondition,
  initialBuyState,
} from "./conditions";
import { WalletState, BuyOrder, Trade, SimulationResult } from "./types";
import { INITIAL_BALANCE_USDT, FEE_RATE }  from "../config/constants";
import { ProcessedCandle }                 from "../processors/candleProcessor";

export interface SimulatorOptions {
  feeRate?: number;
}

export function runSimulation(
  candles1m:   ProcessedCandle[],
  options:     SimulatorOptions = {}
): SimulationResult {
  const feeRate = options.feeRate ?? FEE_RATE;
  const wallet: WalletState = { usdt: INITIAL_BALANCE_USDT, btc: 0, inTrade: false };
  const trades: Trade[]             = [];
  let   pendingBuy: BuyOrder | null = null;
  let   buyState                    = initialBuyState();

  for (let i = 1; i < candles1m.length; i++) {
    const prevCandle = candles1m[i - 1];
    const currCandle = candles1m[i];
    const ts         = Number(currCandle.openTime);

    // ── Exit ────────────────────────────────────────────────────────────
    if (wallet.inTrade && pendingBuy) {
      if (checkSellCondition(prevCandle, pendingBuy.price)) {
        const sell = executeSell(wallet, prevCandle.close, ts, i, feeRate);
        trades.push(buildTrade(pendingBuy, sell));
        pendingBuy = null;
        buyState   = initialBuyState(); // reset after sell
        continue;
      }
    }

    // ── Buy sequence — always evaluated regardless of trade state ────────
    // This ensures cond1Met persists across open positions and is ready
    // when the position closes.
    const result = evaluateBuySequence(
      prevCandle, buyState, wallet.usdt, wallet.inTrade
    );
    buyState = result.state; // always update state

    // ── Entry — only act on signal when not in trade ─────────────────────
    if (result.signal && !wallet.inTrade) {
      pendingBuy = executeBuy(wallet, prevCandle.close, ts, i, feeRate);
      buyState   = initialBuyState(); // reset after buy
    }
  }

  return buildSimulationResult(trades, wallet.usdt);
}
