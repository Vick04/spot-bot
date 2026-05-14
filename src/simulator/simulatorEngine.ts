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
  ActiveStrategy,
} from "./conditions";
import { WalletState, BuyOrder, Trade, SimulationResult } from "./types";
import { INITIAL_BALANCE_USDT, FEE_RATE }  from "../config/constants";
import { ProcessedCandle }                 from "../processors/candleProcessor";

export interface SimulatorOptions {
  feeRate?: number;
}

export function runSimulation(
  candles1m: ProcessedCandle[],
  options:   SimulatorOptions = {}
): SimulationResult {
  const feeRate = options.feeRate ?? FEE_RATE;
  const wallet: WalletState = { usdt: INITIAL_BALANCE_USDT, btc: 0, inTrade: false };
  const trades: Trade[]              = [];
  let   pendingBuy: BuyOrder | null  = null;
  let   buyState                     = initialBuyState();
  let   openStrategy: ActiveStrategy = null;

  for (let i = 1; i < candles1m.length; i++) {
    const prevCandle = candles1m[i - 1];
    const currCandle = candles1m[i];
    const ts         = Number(currCandle.openTime);

    // ── Exit ────────────────────────────────────────────────────────────
    if (wallet.inTrade && pendingBuy) {
      if (checkSellCondition(prevCandle, pendingBuy.price, openStrategy)) {
        const sell = executeSell(wallet, prevCandle.close, ts, i, feeRate);
        trades.push(buildTrade(pendingBuy, sell));
        pendingBuy = null;

        if (openStrategy === 'down') {
          buyState = {
            ...buyState,
            down:     { cond1Met: false, cond2Met: false },
            upStreak: 0, // down trade resets upStreak
          };
        } else {
          buyState = {
            ...buyState,
            up:       { cond1Met: false, cond2Met: false },
            upStreak: buyState.upStreak + 1,
          };
        }
        openStrategy = null;
        continue;
      }
    }

    // ── Buy sequence ─────────────────────────────────────────────────────
    const result = evaluateBuySequence(
      prevCandle, buyState, wallet.usdt, wallet.inTrade
    );
    buyState = result.state;

    if (result.signal && !wallet.inTrade) {
      openStrategy = result.activeStrategy;
      pendingBuy   = executeBuy(wallet, prevCandle.close, ts, i, feeRate);
      if (openStrategy === 'down') {
        buyState = { ...buyState, down: { cond1Met: false, cond2Met: false } };
      } else {
        buyState = { ...buyState, up: { cond1Met: false, cond2Met: false } };
      }
    }
  }

  return buildSimulationResult(trades, wallet.usdt);
}
