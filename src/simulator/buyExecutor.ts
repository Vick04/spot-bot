// ─────────────────────────────────────────────
// src/simulator/buyExecutor.ts
// ─────────────────────────────────────────────

import { WalletState, BuyOrder } from "./types";
import { FEE_RATE }              from "../config/constants";

export function executeBuy(
  wallet:    WalletState,
  price:     number,
  openTime:  number,
  idx1m:     number,
  feeRate:   number = FEE_RATE
): BuyOrder {
  if (wallet.inTrade) throw new Error("executeBuy: already in a trade");
  if (wallet.usdt <= 0) throw new Error("executeBuy: no USDT balance");

  const usdtSpent = wallet.usdt;
  const btcGross  = usdtSpent / price;
  const feeBtc    = btcGross * feeRate;
  const btcNet    = btcGross - feeBtc;

  wallet.usdt    = 0;
  wallet.btc     = btcNet;
  wallet.inTrade = true;

  return { type: "BUY", openTime, price, usdtSpent, btcGross, feeBtc, btcNet, feeRate, idx1m };
}
