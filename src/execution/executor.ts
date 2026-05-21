// ─────────────────────────────────────────────
// src/execution/executor.ts
// Order execution and session management
// Moved from src/live/liveExecutor.ts
// ─────────────────────────────────────────────

import { prisma } from "../db/prismaClient";
import { Wallet, OpenPosition, Session } from "../core/types";
import { FEE_RATE as DEFAULT_FEE_RATE, INITIAL_BALANCE_USDT } from "../config/constants";
import { validatePrice, validateBalance, validateSymbol } from "../utils/validators";

// ── Session bootstrap ─────────────────────────────────────────────────────

/**
 * Start a new trading session
 * Recovers balance from previous session and checks for orphan positions
 * @param feeRate - Trading fee rate
 * @returns New session ID, wallet state, and recovered position (if any)
 */
export async function startSession(
  feeRate: number = DEFAULT_FEE_RATE
): Promise<{
  sessionId: number;
  wallet: Wallet;
  openPosition: OpenPosition | null;
}> {
  try {
    console.log("[Executor] Starting new session...");

    // ── Recover open position from previous session (if any) ─────────────────
    let orphan: any;
    try {
      orphan = await prisma.liveTrade.findFirst({
        where: { sellTime: null },
        orderBy: { id: "desc" },
      });
      if (orphan) {
        console.log(`[Executor] Found orphan trade #${orphan.id}`);
      }
    } catch (e) {
      console.error(`[Executor] Failed to query orphan trades —`, (e as Error).message);
      throw e;
    }

    // ── Determine starting balance ──────────────────────────────────────────
    // If there's an orphan position, USDT balance is 0 (funds are in BTC).
    // Otherwise, take the last session's finalBalance or the initial amount.
    let startingBalance: number;

    if (orphan) {
      // Balance is locked in BTC — start with 0 USDT
      startingBalance = 0;
      console.log(
        `[Executor] Recovering open position #${orphan.id}` +
        ` — buy @ $${orphan.buyPrice.toFixed(2)}, ${orphan.btcNet.toFixed(8)} BTC`
      );
    } else {
      try {
        const last = await prisma.liveSession.findFirst({
          where: { finalBalance: { not: null } },
          orderBy: { id: "desc" },
        });
        startingBalance = last?.finalBalance ?? INITIAL_BALANCE_USDT;
        console.log(`[Executor] No orphan position — starting balance: $${startingBalance.toFixed(2)}`);
      } catch (e) {
        console.error(`[Executor] Failed to load previous session balance —`, (e as Error).message);
        startingBalance = INITIAL_BALANCE_USDT;
        console.log(`[Executor] Using default balance: $${startingBalance.toFixed(2)}`);
      }
    }

    // ── Create new session in database ─────────────────────────────────────
    let session;
    try {
      session = await prisma.liveSession.create({
        data: { initialBalance: startingBalance, feeRate },
      });
      console.log(`[Executor] Created session #${session.id}`);
    } catch (e) {
      console.error(`[Executor] Failed to create session —`, (e as Error).message);
      throw e;
    }

    // ── Build return values ─────────────────────────────────────────────────
    const wallet: Wallet = {
      usdt: orphan ? 0 : startingBalance,
      btc: orphan ? orphan.btcNet : 0,
      inTrade: orphan !== null,
    };

    const recoveredPosition: OpenPosition | null = orphan
      ? {
          liveTradeId: orphan.id,
          symbol: orphan.symbol,
          buyTime: orphan.buyTime.getTime(),
          buyPrice: orphan.buyPrice,
          usdtSpent: orphan.usdtSpent,
          btcNet: orphan.btcNet,
          feeRate: orphan.feeBtc / (orphan.btcGross || 1),
        }
      : null;

    console.log(
      `[Executor] #${session.id} started` +
      (orphan
        ? ` — resuming open position from trade #${orphan.id}`
        : ` — balance: $${startingBalance.toFixed(2)}`)
    );

    return { sessionId: session.id, wallet, openPosition: recoveredPosition };
  } catch (e) {
    const err = (e as Error).message;
    console.error(`[Executor] Fatal error starting session —`, err);
    throw e;
  }
}

/**
 * End a trading session
 * Records final balance in database
 * @param sessionId - Session ID to end
 * @param wallet - Final wallet state
 */
export async function endSession(sessionId: number, wallet: Wallet): Promise<void> {
  try {
    await prisma.liveSession.update({
      where: { id: sessionId },
      data: { endedAt: new Date(), finalBalance: wallet.usdt },
    });
    console.log(`[Executor] #${sessionId} ended — final balance: $${wallet.usdt.toFixed(2)}`);
  } catch (e) {
    console.error(`[Executor] Failed to end session #${sessionId} —`, (e as Error).message);
    throw e;
  }
}

// ── Order execution ───────────────────────────────────────────────────────

/**
 * Execute a buy order
 * Creates trade record in database and updates wallet
 * @param sessionId - Current session ID
 * @param wallet - Wallet to update
 * @param symbol - Trading pair
 * @param price - Buy price per BTC
 * @param timeMs - Timestamp of buy
 * @param feeRate - Trading fee rate
 * @returns Open position details
 */
export async function liveExecuteBuy(
  sessionId: number,
  wallet: Wallet,
  symbol: string,
  price: number,
  timeMs: number,
  feeRate: number = DEFAULT_FEE_RATE
): Promise<OpenPosition> {
  try {
    validateSymbol(symbol);
    validatePrice(price);

    console.log(`[Executor] Executing buy for ${symbol} @ $${price.toFixed(2)}`);

    if (wallet.usdt <= 0) {
      throw new Error(`Insufficient balance: $${wallet.usdt.toFixed(2)}`);
    }

    const usdtSpent = wallet.usdt;
    const btcGross = usdtSpent / price;
    const feeBtc = btcGross * feeRate;
    const btcNet = btcGross - feeBtc;
    const buyTime = new Date(timeMs);

    console.log(
      `[Executor] Calculations: spent=$${usdtSpent.toFixed(2)}, btcGross=${btcGross.toFixed(8)}, ` +
      `fee=${feeBtc.toFixed(8)}, btcNet=${btcNet.toFixed(8)}`
    );

    // ── Create trade record in database ──────────────────────────────────────
    let row;
    try {
      row = await prisma.liveTrade.create({
        data: {
          sessionId,
          symbol,
          buyTime,
          buyPrice: price,
          usdtSpent,
          btcGross,
          feeBtc,
          btcNet,
        },
      });
      console.log(`[Executor] Trade record created: #${row.id}`);
    } catch (e) {
      console.error(`[Executor] Failed to create trade record —`, (e as Error).message);
      throw e;
    }

    // ── Update wallet state ──────────────────────────────────────────────────
    wallet.usdt = 0;
    wallet.btc = btcNet;
    wallet.inTrade = true;

    console.log(
      `[Executor] ✅ BUY  ${buyTime.toISOString()}  @ $${price.toFixed(2)}` +
      `  | spent $${usdtSpent.toFixed(2)}  →  ${btcNet.toFixed(8)} BTC` +
      `  | fee: ${feeBtc.toFixed(8)} BTC`
    );

    return {
      liveTradeId: row.id,
      symbol,
      buyTime: timeMs,
      buyPrice: price,
      usdtSpent,
      btcNet,
      feeRate,
    };
  } catch (e) {
    const err = (e as Error).message;
    console.error(`[Executor] ❌ Failed to execute buy —`, err);
    throw e;
  }
}

/**
 * Execute a sell order
 * Updates trade record with sell details and updates wallet
 * @param wallet - Wallet to update
 * @param position - Open position to sell
 * @param price - Sell price per BTC
 * @param timeMs - Timestamp of sell
 * @param feeRate - Trading fee rate
 */
export async function liveExecuteSell(
  wallet: Wallet,
  position: OpenPosition,
  price: number,
  timeMs: number,
  feeRate: number = DEFAULT_FEE_RATE
): Promise<void> {
  try {
    validatePrice(price);

    console.log(`[Executor] Executing sell for ${position.symbol} @ $${price.toFixed(2)}`);

    if (wallet.btc <= 0) {
      throw new Error(`No BTC to sell: ${wallet.btc.toFixed(8)}`);
    }

    const btcSold = wallet.btc;
    const usdtGross = btcSold * price;
    const feeUsdt = usdtGross * feeRate;
    const usdtNet = usdtGross - feeUsdt;
    const pnlUsdt = usdtNet - position.usdtSpent;
    const pnlPct = (pnlUsdt / position.usdtSpent) * 100;
    const sellTime = new Date(timeMs);

    console.log(
      `[Executor] Calculations: btcSold=${btcSold.toFixed(8)}, usdtGross=$${usdtGross.toFixed(2)}, ` +
      `fee=$${feeUsdt.toFixed(2)}, usdtNet=$${usdtNet.toFixed(2)}, pnl=$${pnlUsdt.toFixed(2)}`
    );

    // ── Update trade record in database ──────────────────────────────────────
    try {
      await prisma.liveTrade.update({
        where: { id: position.liveTradeId },
        data: {
          sellTime,
          sellPrice: price,
          usdtGross,
          feeUsdt,
          usdtNet,
          pnlUsdt,
          pnlPct,
          balanceAfter: usdtNet,
        },
      });
      console.log(`[Executor] Trade record #${position.liveTradeId} updated`);
    } catch (e) {
      console.error(`[Executor] Failed to update trade record —`, (e as Error).message);
      throw e;
    }

    // ── Update wallet state ──────────────────────────────────────────────────
    wallet.btc = 0;
    wallet.usdt = usdtNet;
    wallet.inTrade = false;

    const sign = pnlUsdt >= 0 ? "+" : "";
    console.log(
      `[Executor] ✅ SELL ${sellTime.toISOString()}  @ $${price.toFixed(2)}` +
      `  | received $${usdtNet.toFixed(2)}` +
      `  | P&L: ${sign}$${pnlUsdt.toFixed(2)} (${sign}${pnlPct.toFixed(3)}%)` +
      `  | balance: $${usdtNet.toFixed(2)}`
    );
  } catch (e) {
    const err = (e as Error).message;
    console.error(`[Executor] ❌ Failed to execute sell —`, err);
    throw e;
  }
}
