// ─────────────────────────────────────────────
// src/multi/stopLoss.ts
// Stop loss logic — isolated module.
// Remove the import in orderManager.ts to disable entirely.
// ─────────────────────────────────────────────

/**
 * Stop loss threshold.
 * If the current price drops this % below the buy price, trigger a sell.
 * Example: 0.03 = -3%
 */
export const STOP_LOSS_PCT = 0.05;

/**
 * Returns true if the current price has dropped enough to trigger stop loss.
 */
export function isStopLoss(currentPrice: number, buyPrice: number): boolean {
  return currentPrice <= buyPrice * (1 - STOP_LOSS_PCT);
}
