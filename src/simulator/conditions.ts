// ─────────────────────────────────────────────
// src/simulator/conditions.ts
// Entry and exit signal logic.
// ─────────────────────────────────────────────

import { CandleContext, BuyOrder } from "./types";
import { ProcessedCandle }         from "../processors/candleProcessor";
import {
  SELL_TP_MULTIPLIER,
  SELL_1H_TREND_ENABLED,
} from "../config/constants";

// ── Warm-up guards ────────────────────────────────────────────────────────

function hasIndicators1h(c: ProcessedCandle): boolean {
  return c.bbUpper !== null && c.ma99 !== null;
}

function hasIndicators15m(c: ProcessedCandle): boolean {
  return c.bbUpper !== null && c.ma99 !== null;
}

function hasIndicators1m(c: ProcessedCandle): boolean {
  return (
    c.bbUpper !== null &&
    c.bbLower !== null &&
    c.ma20    !== null &&
    c.trix    !== null &&
    c.ma99    !== null
  );
}

// ── Entry condition ───────────────────────────────────────────────────────

/**
 * BUY signal — all three timeframe conditions must be true simultaneously.
 *
 * 1h  : close > bbUpper  AND  bbUpper > ma99
 * 15m : close > bbUpper  AND  bbUpper > ma99
 * 1m  : close > bbUpper  AND  bbUpper > ma20  AND  ma20 > bbLower
 *        AND  bbLower > trix  AND  trix > ma99
 */
export function checkBuyCondition(
  ctx:          CandleContext,
  usdtBalance:  number,
  inTrade:      boolean
): boolean {
  if (inTrade || usdtBalance <= 0) return false;

  const { candle1h, candle15m, candle1m } = ctx;

  if (!hasIndicators1h(candle1h))   return false;
  if (!hasIndicators15m(candle15m)) return false;
  if (!hasIndicators1m(candle1m))   return false;

  const cond1h =
    candle1h.close > (candle1h.bbUpper as number);

  const cond15m =
    candle15m.close > (candle15m.bbUpper as number)

  const cond1m =
    candle1m.close               > (candle1m.bbUpper as number) &&
    (candle1m.bbUpper as number) > (candle1m.ma20   as number) &&
    (candle1m.ma20    as number) > (candle1m.bbLower as number);

  return cond1h && cond15m && cond1m;
}

// ── Exit condition ────────────────────────────────────────────────────────

/**
 * SELL signal — fires when ANY of these is true:
 *
 *   A) Take profit : 1m close >= entry price × SELL_TP_MULTIPLIER (+10%)
 *   B) Trend exit  : 1h close < 1h bbUpper
 */
export function checkSellCondition(
  currentPrice: number,
  openBuy:      BuyOrder,
  candle1h:     ProcessedCandle
): boolean {
  const takeProfit =
    currentPrice >= openBuy.price * SELL_TP_MULTIPLIER;

  const trendExit =
    SELL_1H_TREND_ENABLED &&
    candle1h.bbUpper !== null &&
    candle1h.close < (candle1h.bbUpper as number);

  return trendExit;
}
