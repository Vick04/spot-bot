// ─────────────────────────────────────────────
// src/multi/orderManager.ts
// ─────────────────────────────────────────────

import { ProcessedCandle }   from "../processors/candleProcessor";
import { SymbolObserver }    from "./symbolObserver";
import { ActiveStrategy }    from "../simulator/conditions";
import {
  DOWN_COND2_MIN_VOL_RATIO,
  UP_COND2_MIN_VOL_RATIO,
  UP_COND2_MAX_VOL_RATIO,
} from "../simulator/conditions";
import { FEE_RATE, getSymbolParams, SymbolParams } from "../config/constants";
import { isStopLoss }                              from "./stopLoss";

export type ManagerMode = "simulator" | "live";

export interface Signal {
  symbol:      string;
  strategy:    ActiveStrategy;
  candle:      ProcessedCandle;
  score:       number;
  receivedAt:  number; // Date.now()
}

export interface OpenOrder {
  symbol:    string;
  strategy:  ActiveStrategy;
  buyPrice:  number;
  usdtSpent: number;
  units:     number;
  sellMult:  number;
  openedAt:  number;
  params:    SymbolParams;
}

const SIGNAL_TTL_MS      = 60_000; // 1 minute
const SIGNAL_CLEANUP_MS  = 5_000;  // cleanup tick interval

// ── Score functions ───────────────────────────────────────────────────────

function scoreDown(c: ProcessedCandle): number {
  if (!c.ma99 || !c.bbUpper || !c.bbLower) return 0;
  const volStrength  = (c.volRatio ?? 1) / DOWN_COND2_MIN_VOL_RATIO;
  const body         = Math.abs((c.open - c.close) / c.open); // bajista
  const bbPosition   = (c.bbLower - c.close) / (c.bbUpper - c.bbLower);
  const maSeparation = Math.abs((c.ma20! - c.ma99) / c.ma99);
  return body;
}

function scoreUp(c: ProcessedCandle): number {
  if (!c.ma99 || !c.bbUpper || !c.bbLower) return 0;
  const volStrength  = (c.volRatio ?? 1) / UP_COND2_MIN_VOL_RATIO;
  const body         = (c.close - c.open) / c.open; // alcista
  const bbPosition   = (c.close - c.bbUpper) / (c.bbUpper - c.bbLower);
  const maSeparation = Math.abs((c.ma20! - c.ma99) / c.ma99);
  return body;
}

function calcScore(candle: ProcessedCandle, strategy: ActiveStrategy): number {
  return strategy === 'down' ? scoreDown(candle) : scoreUp(candle);
}

function sellMult(strategy: ActiveStrategy): number {
  return strategy === 'up' ? 1.006 : 1.006;
}

// ── OrderManager ──────────────────────────────────────────────────────────

export class OrderManager {
  private readonly mode:      ManagerMode;
  private readonly observers: Map<string, SymbolObserver> = new Map();

  private lastSignal:  Signal | null    = null;
  private openOrder:   OpenOrder | null = null;
  private balance:     number;
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  // Hooks for live execution (injected externally)
  onBuy?:  (order: OpenOrder) => Promise<void>;
  onSell?: (order: OpenOrder, sellPrice: number, ts: number, isStopLoss: boolean) => Promise<void>;

  constructor(mode: ManagerMode, initialBalance: number) {
    this.mode    = mode;
    this.balance = initialBalance;
  }

  // ── Observer management ────────────────────────────────────────────────

  addObserver(observer: SymbolObserver): void {
    this.observers.set(observer.symbol, observer);
  }

  removeObserver(symbol: string): void {
    this.observers.delete(symbol);
  }

  getObserver(symbol: string): SymbolObserver | undefined {
    return this.observers.get(symbol);
  }

  get balance_(): number { return this.balance; }

  // ── Signal cleanup tick ────────────────────────────────────────────────

  startCleanupTimer(): void {
    this.cleanupTimer = setInterval(() => {
      if (this.lastSignal && Date.now() - this.lastSignal.receivedAt > SIGNAL_TTL_MS) {
        this.lastSignal = null;
      }
    }, SIGNAL_CLEANUP_MS);
  }

  stopCleanupTimer(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }

  // ── Main tick — called every minute with all synchronized candles ──────

  /**
   * @param candleMap  Map<symbol, ProcessedCandle> — all symbols same openTime
   * @param ts         openTime of the candle batch (ms)
   */
  tick(candleMap: Map<string, ProcessedCandle>, ts: number): void {
    // 1. Feed each observer its candle
    for (const [symbol, candle] of candleMap) {
      const observer = this.observers.get(symbol);
      if (observer) observer.tick(candle);
    }

    // 2. Check sell condition and stop loss if order is open
    if (this.openOrder) {
      const candle = candleMap.get(this.openOrder.symbol);
      if (candle) {
        const hitTarget   = candle.close >= this.openOrder.buyPrice * this.openOrder.sellMult;
        const hitStopLoss = isStopLoss(candle.close, this.openOrder.buyPrice);
        if (hitTarget) {
          this.executeSell(candle.close, ts);
        }
      }
      return;
    }

    // 3. Collect all matches
    const matches: Signal[] = [];
    for (const observer of this.observers.values()) {
      if (observer.match && observer.matchCandle && observer.strategy) {
        matches.push({
          symbol:     observer.symbol,
          strategy:   observer.strategy,
          candle:     observer.matchCandle,
          score:      calcScore(observer.matchCandle, observer.strategy),
          receivedAt: Date.now(),
        });
      }
    }

    // 4. Update lastSignal with best match (highest score)
    if (matches.length > 0) {
      matches.sort((a, b) => b.receivedAt - a.receivedAt);
      this.lastSignal = matches[0];
    }

    // 5. Execute if valid signal available
    if (
      this.lastSignal &&
      Date.now() - this.lastSignal.receivedAt <= SIGNAL_TTL_MS
    ) {
      this.executeBuy(this.lastSignal, ts);
      this.lastSignal = null;
    }
  }

  // ── Order execution ────────────────────────────────────────────────────

  private executeBuy(signal: Signal, ts: number): void {
    const price     = signal.candle.close;
    const usdtSpent = this.balance;
    const fee       = usdtSpent * FEE_RATE;
    const units     = (usdtSpent - fee) / price;
    const params    = getSymbolParams(signal.symbol);
    const mult      = signal.strategy === 'up' ? params.upSell : params.downSell;

    this.openOrder = {
      symbol:    signal.symbol,
      strategy:  signal.strategy,
      buyPrice:  price,
      usdtSpent,
      units,
      sellMult:  mult,
      openedAt:  ts,
      params,
    };

    this.balance = 0;
    this.onBuy?.(this.openOrder);
  }

  private executeSell(price: number, ts: number): void {
    if (!this.openOrder) return;

    const gross     = this.openOrder.units * price;
    const fee       = gross * FEE_RATE;
    const net       = gross - fee;
    const stopLoss  = isStopLoss(price, this.openOrder.buyPrice);

    this.balance  = net;
    const order   = this.openOrder;
    this.openOrder = null;

    const observer = this.observers.get(order.symbol);
    observer?.onSell(order.strategy);

    this.onSell?.(order, price, ts, stopLoss);
  }

  // ── Simulator-specific: process candles from DB in order ──────────────

  /**
   * Run simulation over a pre-loaded array of synchronized candle maps.
   * Each entry is a Map<symbol, ProcessedCandle> for the same openTime.
   */
  simulate(
    candleMaps: Map<string, ProcessedCandle>[],
    timestamps: number[]
  ): { balance: number; trades: SimTrade[]; openOrderReverted: { symbol: string; buyPrice: number; buyTs: number } | null } {
    const trades: SimTrade[] = [];

    // Override hooks to capture trades
    this.onBuy  = async () => {};
    this.onSell = async (order, price, ts, stopLoss) => {
      const net = this.balance;
      trades.push({
        symbol:     order.symbol,
        strategy:   order.strategy!,
        buyPrice:   order.buyPrice,
        sellPrice:  price,
        usdtSpent:  order.usdtSpent,
        usdtNet:    net,
        pnlPct:     (net - order.usdtSpent) / order.usdtSpent * 100,
        buyTs:      order.openedAt,
        sellTs:     ts,
        isStopLoss: stopLoss,
      });
    };

    for (let i = 0; i < candleMaps.length; i++) {
      this.tick(candleMaps[i], timestamps[i]);
    }

    // If simulation ended with an open order, revert it
    let openOrderReverted: { symbol: string; buyPrice: number; buyTs: number } | null = null;
    if (this.openOrder) {
      openOrderReverted = {
        symbol:   this.openOrder.symbol,
        buyPrice: this.openOrder.buyPrice,
        buyTs:    this.openOrder.openedAt,
      };
      this.balance   = this.openOrder.usdtSpent;
      this.openOrder = null;
    }

    return { balance: this.balance, trades, openOrderReverted };
  }
}

export interface SimTrade {
  symbol:     string;
  strategy:   ActiveStrategy;
  buyPrice:   number;
  sellPrice:  number;
  usdtSpent:  number;
  usdtNet:    number;
  pnlPct:     number;
  buyTs:      number;
  sellTs:     number;
  isStopLoss: boolean;
}
