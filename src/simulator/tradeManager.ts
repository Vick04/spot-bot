// ─────────────────────────────────────────────
// src/simulator/tradeManager.ts
// Pairs BUY + SELL into completed Trade records
// and computes summary statistics
// ─────────────────────────────────────────────

import { BuyOrder, SellOrder, Trade, SimulationResult } from "./types";
import { INITIAL_BALANCE_USDT }                         from "../config/constants";

/**
 * Combine a completed buy + sell pair into a Trade with P&L metrics.
 */
export function buildTrade(buy: BuyOrder, sell: SellOrder): Trade {
  const pnlUsdt = sell.usdtNet - buy.usdtSpent;
  const pnlPct  = (pnlUsdt / buy.usdtSpent) * 100;

  return { buy, sell, pnlUsdt, pnlPct };
}

/**
 * Compute aggregate statistics from a completed list of trades.
 *
 * @param trades        All closed trades
 * @param finalBalance  Current USDT balance in the wallet
 */
export function buildSimulationResult(
  trades:       Trade[],
  finalBalance: number
): SimulationResult {
  const totalPnlUsdt  = finalBalance - INITIAL_BALANCE_USDT;
  const totalPnlPct   = (totalPnlUsdt / INITIAL_BALANCE_USDT) * 100;

  const winners = trades.filter((t) => t.pnlUsdt > 0).length;
  const winRate = trades.length > 0 ? (winners / trades.length) * 100 : 0;

  // Total fees: buy-side fees converted to USDT at sell price + sell-side fees
  const totalFeesPaid = trades.reduce((acc, t) => {
    const buyFeeUsdt = t.buy.feeBtc * t.sell.price; // BTC fee → USDT equivalent
    return acc + buyFeeUsdt + t.sell.feeUsdt;
  }, 0);

  return {
    trades,
    finalBalance,
    totalPnlUsdt,
    totalPnlPct,
    totalFeesPaid,
    winRate,
  };
}
