// ─────────────────────────────────────────────
// src/simulator/sellExecutor.ts
// ─────────────────────────────────────────────

import { WalletState, SellOrder } from "./types";
import { FEE_RATE }               from "../config/constants";

export function executeSell(
  wallet:    WalletState,
  price:     number,
  closeTime: number,
  idx1m:     number,
  feeRate:   number = FEE_RATE
): SellOrder {
  if (!wallet.inTrade) throw new Error("executeSell: not in a trade");
  if (wallet.btc <= 0) throw new Error("executeSell: no BTC balance");

  const btcSold   = wallet.btc;
  const usdtGross = btcSold * price;
  const feeUsdt   = usdtGross * feeRate;
  const usdtNet   = usdtGross - feeUsdt;

  wallet.btc     = 0;
  wallet.usdt    = usdtNet;
  wallet.inTrade = false;

  return { type: "SELL", closeTime, price, btcSold, usdtGross, feeUsdt, usdtNet, feeRate, idx1m };
}
