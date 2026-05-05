// ─────────────────────────────────────────────
// src/live/liveExecutor.ts
// ─────────────────────────────────────────────

import { prisma }                         from "../db/prismaClient";
import { LiveWallet, OpenPosition }       from "./types";
import { INITIAL_BALANCE_USDT, FEE_RATE } from "../config/constants";

// ── Session bootstrap ─────────────────────────────────────────────────────

/**
 * Start a new session carrying forward the balance from the last completed one.
 * Also checks if there is an unfinished open position from a previous session
 * and recovers it so the engine can continue managing it.
 *
 * Returns:
 *   sessionId    — new session ID
 *   wallet       — wallet state (inTrade=true if a position was recovered)
 *   openPosition — recovered position, or null if none
 */
export async function startSession(feeRate: number = FEE_RATE): Promise<{
  sessionId:    number;
  wallet:       LiveWallet;
  openPosition: OpenPosition | null;
}> {
  // ── Recover open position from any previous session ───────────────────
  const orphan = await prisma.liveTrade.findFirst({
    where:   { sellTime: null },
    orderBy: { id: "desc" },
  });

  // ── Determine starting balance ────────────────────────────────────────
  // If there's an orphan position, USDT balance is 0 (funds are in BTC).
  // Otherwise, take the last session's finalBalance or the initial amount.
  let startingBalance: number;

  if (orphan) {
    // Balance is locked in BTC — start with 0 USDT
    startingBalance = 0;
    console.log(
      `[Session] Recovering open position #${orphan.id}` +
      ` — buy @ $${orphan.buyPrice.toFixed(2)}, ${orphan.btcNet.toFixed(8)} BTC`
    );
  } else {
    const last = await prisma.liveSession.findFirst({
      where:   { finalBalance: { not: null } },
      orderBy: { id: "desc" },
    });
    startingBalance = last?.finalBalance ?? INITIAL_BALANCE_USDT;
  }

  const session = await prisma.liveSession.create({
    data: { initialBalance: startingBalance, feeRate },
  });

  const wallet: LiveWallet = {
    usdt:    orphan ? 0 : startingBalance,
    btc:     orphan ? orphan.btcNet : 0,
    inTrade: orphan !== null,
  };

  const recoveredPosition: OpenPosition | null = orphan
    ? {
        liveTradeId: orphan.id,
        buyTime:     orphan.buyTime.getTime(),
        buyPrice:    orphan.buyPrice,
        usdtSpent:   orphan.usdtSpent,
        btcNet:      orphan.btcNet,
        feeRate:     orphan.feeBtc / (orphan.btcGross || 1), // recover fee rate
      }
    : null;

  console.log(
    `[Session] #${session.id} started` +
    (orphan
      ? ` — resuming open position from trade #${orphan.id}`
      : ` — balance: $${startingBalance.toFixed(2)}`)
  );

  return { sessionId: session.id, wallet, openPosition: recoveredPosition };
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
    data: { sessionId, buyTime, buyPrice: price, usdtSpent, btcGross, feeBtc, btcNet },
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
    data:  { sellTime, sellPrice: price, usdtGross, feeUsdt, usdtNet, pnlUsdt, pnlPct, balanceAfter: usdtNet },
  });

  wallet.btc     = 0;
  wallet.usdt    = usdtNet;
  wallet.inTrade = false;

  const sign = pnlUsdt >= 0 ? "+" : "";
  console.log(
    `[SELL] ${sellTime.toISOString()}  @ $${price.toFixed(2)}` +
    `  | received $${usdtNet.toFixed(2)}` +
    `  | P&L: ${sign}$${pnlUsdt.toFixed(2)} (${sign}${pnlPct.toFixed(3)}%)` +
    `  | balance: $${usdtNet.toFixed(2)}`
  );
}
