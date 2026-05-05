// ─────────────────────────────────────────────
// src/live/liveExecutor.ts
// Executes buy/sell orders and persists them to
// the live_trade table. Manages the live wallet
// in memory and reflects balance in live_session.
// ─────────────────────────────────────────────

import { prisma }                        from "../db/prismaClient";
import { LiveWallet, OpenPosition }      from "./types";
import { INITIAL_BALANCE_USDT, FEE_RATE } from "../config/constants";

// ── Session bootstrap ─────────────────────────────────────────────────────

/**
 * Create a new live session in the DB.
 * The balance is taken from the last session's finalBalance (compound interest)
 * or INITIAL_BALANCE_USDT if this is the first run.
 */
export async function startSession(feeRate: number = FEE_RATE): Promise<{
  sessionId: number;
  wallet:    LiveWallet;
}> {
  // Find the most recent completed session to carry forward the balance
  const last = await prisma.liveSession.findFirst({
    where:   { finalBalance: { not: null } },
    orderBy: { id: "desc" },
  });

  const startingBalance = last?.finalBalance ?? INITIAL_BALANCE_USDT;

  const session = await prisma.liveSession.create({
    data: {
      initialBalance: startingBalance,
      feeRate,
    },
  });

  const wallet: LiveWallet = {
    usdt:    startingBalance,
    btc:     0,
    inTrade: false,
  };

  console.log(`[Session] #${session.id} started — balance: $${startingBalance.toFixed(2)}`);
  return { sessionId: session.id, wallet };
}

/**
 * Mark the session as ended and record the final balance.
 */
export async function endSession(
  sessionId: number,
  wallet:    LiveWallet
): Promise<void> {
  await prisma.liveSession.update({
    where: { id: sessionId },
    data:  { endedAt: new Date(), finalBalance: wallet.usdt },
  });
  console.log(`[Session] #${sessionId} ended — final balance: $${wallet.usdt.toFixed(2)}`);
}

// ── Order execution ───────────────────────────────────────────────────────

/**
 * Execute a BUY: all-in USDT → BTC, fee in BTC.
 * Persists an open LiveTrade row and returns the OpenPosition.
 */
export async function liveExecuteBuy(
  sessionId: number,
  wallet:    LiveWallet,
  price:     number,
  timeMs:    number,
  feeRate:   number = FEE_RATE
): Promise<OpenPosition> {
  const usdtSpent = wallet.usdt;
  const btcGross  = usdtSpent / price;
  const feeBtc    = btcGross * feeRate;
  const btcNet    = btcGross - feeBtc;
  const buyTime   = new Date(timeMs);

  const row = await prisma.liveTrade.create({
    data: {
      sessionId,
      buyTime,
      buyPrice:  price,
      usdtSpent,
      btcGross,
      feeBtc,
      btcNet,
    },
  });

  wallet.usdt    = 0;
  wallet.btc     = btcNet;
  wallet.inTrade = true;

  console.log(
    `[BUY]  ${buyTime.toISOString()}  @ $${price.toFixed(2)}` +
    `  | spent $${usdtSpent.toFixed(2)}  →  ${btcNet.toFixed(8)} BTC` +
    `  | fee: ${feeBtc.toFixed(8)} BTC`
  );

  return { liveTradeId: row.id, buyTime: timeMs, buyPrice: price, usdtSpent, btcNet, feeRate };
}

/**
 * Execute a SELL: all-in BTC → USDT, fee in USDT.
 * Updates the open LiveTrade row with sell data and P&L.
 */
export async function liveExecuteSell(
  wallet:   LiveWallet,
  position: OpenPosition,
  price:    number,
  timeMs:   number,
  feeRate:  number = FEE_RATE
): Promise<void> {
  const btcSold   = wallet.btc;
  const usdtGross = btcSold * price;
  const feeUsdt   = usdtGross * feeRate;
  const usdtNet   = usdtGross - feeUsdt;
  const pnlUsdt   = usdtNet - position.usdtSpent;
  const pnlPct    = (pnlUsdt / position.usdtSpent) * 100;
  const sellTime  = new Date(timeMs);

  await prisma.liveTrade.update({
    where: { id: position.liveTradeId },
    data:  {
      sellTime,
      sellPrice:   price,
      usdtGross,
      feeUsdt,
      usdtNet,
      pnlUsdt,
      pnlPct,
      balanceAfter: usdtNet,
    },
  });

  wallet.btc     = 0;
  wallet.usdt    = usdtNet;
  wallet.inTrade = false;

  const sign = pnlUsdt >= 0 ? "+" : "";
  console.log(
    `[SELL] ${sellTime.toISOString()}  @ $${price.toFixed(2)}` +
    `  | received $${usdtNet.toFixed(2)}` +
    `  | P&L: ${sign}$${pnlUsdt.toFixed(2)} (${sign}${pnlPct.toFixed(3)}%)`+
    `  | balance: $${usdtNet.toFixed(2)}`
  );
}
