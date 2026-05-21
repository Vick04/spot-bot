// ─────────────────────────────────────────────
// src/live/liveConditions.ts
// ─────────────────────────────────────────────

import { OpenPosition }  from "./types";
import { ActiveStrategy } from "../simulator/conditions";
import { getSymbolParams } from "../config/constants";

/**
 * SELL signal — uses per-symbol thresholds from SymbolParams.
 */
export function liveCheckSell(
  close:    number,
  position: OpenPosition,
  strategy: ActiveStrategy
): boolean {
  const params = getSymbolParams(position.symbol);
  const mult   = strategy === "up" ? params.upSell : params.downSell;
  return close >= position.buyPrice * mult;
}
