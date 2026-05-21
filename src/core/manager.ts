// ─────────────────────────────────────────────
// src/core/manager.ts
// Unified trading manager - data source agnostic
// Works with any DataProvider (live WebSocket, database backtest, etc.)
// Refactored from src/live/multiLiveManager.ts
// ─────────────────────────────────────────────

import { EventEmitter } from "events";
import { ProcessedCandle } from "./candle";
import {
  Wallet,
  OpenPosition,
  ActiveTrade,
  TradingConfig,
  ManagerEvent,
  Session,
} from "./types";
import { SymbolObserver } from "./observer";
import {
  CANDLE_INTERVAL_MS,
  BUFFER_MAX,
  SIGNAL_TTL_MS,
  UP_MAX_STREAK as DEFAULT_UP_MAX_STREAK,
  DAILY_MAX_TRADES as DEFAULT_DAILY_MAX_TRADES,
  DAILY_MAX_PNL_PCT as DEFAULT_DAILY_MAX_PNL_PCT,
  FEE_RATE as DEFAULT_FEE_RATE,
  INITIAL_BALANCE_USDT as DEFAULT_INITIAL_BALANCE,
  getSymbolParams,
} from "../config/constants";
import { dayGMT3 } from "../utils/timeUtils";
import { fmtN } from "../utils/formatters";

/**
 * Signal detection for buy ordering
 */
interface Signal {
  symbol: string;
  strategy: "up" | "down";
  candle: ProcessedCandle;
  receivedAt: number; // Signal timestamp
}

/**
 * Unified trading manager
 * - Data source agnostic (lives in DataProvider implementations)
 * - Handles trading logic: buy/sell signals, daily limits, balance tracking
 * - Emits events for logging and UI updates
 * - Can be used with live (WebSocket) or backtest (batch) data
 */
export class TradingManager extends EventEmitter {
  // ── Symbol observers (per-symbol signal detection) ────────────────────────
  private _observers: Map<string, SymbolObserver> = new Map();
  private _lastPrices: Map<string, number> = new Map();
  private _candleBuffers: Map<string, ProcessedCandle[]> = new Map();

  // ── Session and wallet state ────────────────────────────────────────────────
  private _sessionId: number = 0;
  private _wallet: Wallet = { usdt: 0, btc: 0, inTrade: false };
  private _activeTrade: ActiveTrade | null = null;

  // ── Configuration ───────────────────────────────────────────────────────────
  private _config: TradingConfig = this._getDefaultConfig();

  // ── Lifecycle ───────────────────────────────────────────────────────────────
  private _running: boolean = false;
  private _buying: boolean = false;
  private _selling: boolean = false;

  // ── Daily limits (reset at midnight GMT-3) ──────────────────────────────────
  private _dailyDay: string = "";
  private _dailyTrades: number = 0;
  private _dailyPnlPct: number = 0;

  // ── Symbols being managed ───────────────────────────────────────────────────
  private _symbols: string[] = [];

  constructor(symbols: string[] = []) {
    super();
    this._symbols = symbols;
  }

  // ── Public accessors ────────────────────────────────────────────────────────

  get isRunning(): boolean {
    return this._running;
  }

  get balance(): number {
    return this._wallet.usdt;
  }

  get activeTrade(): ActiveTrade | null {
    return this._activeTrade;
  }

  get sessionId(): number {
    return this._sessionId;
  }

  get lastPrices(): Map<string, number> {
    return new Map(this._lastPrices);
  }

  get config(): TradingConfig {
    return { ...this._config };
  }

  get dailyStats() {
    return {
      date: this._dailyDay,
      trades: this._dailyTrades,
      pnlPct: this._dailyPnlPct,
    };
  }

  get symbols(): string[] {
    return [...this._symbols];
  }

  get observers(): Map<string, SymbolObserver> {
    return new Map(this._observers);
  }

  // ── Initialization ──────────────────────────────────────────────────────────

  /**
   * Initialize manager with symbols and configuration
   * @param symbols - Trading pairs to manage
   * @param config - Trading configuration (optional, uses defaults if not provided)
   */
  initialize(symbols: string[], config?: Partial<TradingConfig>): void {
    if (this._running) {
      throw new Error("Cannot initialize running manager");
    }

    this._symbols = symbols;
    if (config) {
      this._config = { ...this._getDefaultConfig(), ...config };
    }

    // Create observers for each symbol
    for (const symbol of symbols) {
      if (!this._observers.has(symbol)) {
        this._observers.set(symbol, new SymbolObserver(symbol));
      }
    }

    console.log(`[TradingManager] Initialized with ${symbols.length} symbol(s)`);
  }

  /**
   * Start the manager
   * Should be called after all observers are warmed up
   */
  start(): void {
    if (this._running) {
      throw new Error("Manager already running");
    }

    this._running = true;
    this._dailyDay = dayGMT3(Date.now());
    console.log(`[TradingManager] Started - session #${this._sessionId}, balance: $${fmtN(this._wallet.usdt)}`);

    this.emit("started");
  }

  /**
   * Stop the manager
   */
  stop(): void {
    if (!this._running) return;

    this._running = false;
    console.log(
      `[TradingManager] Stopped - final balance: $${fmtN(this._wallet.usdt)}, ` +
      `daily P&L: ${fmtN(this._dailyPnlPct, 2)}%`
    );

    this.emit("stopped");
  }

  /**
   * Update configuration at runtime
   * (May be called from API in live mode)
   */
  updateConfig(patch: Partial<TradingConfig>): void {
    this._config = { ...this._config, ...patch };
    console.log(`[TradingManager] Config updated:`, patch);
    this.emit("config", { config: this._config } as ManagerEvent);
  }

  /**
   * Set initial session and wallet state
   * Called by executor after session is created in database
   */
  setSession(sessionId: number, wallet: Wallet): void {
    this._sessionId = sessionId;
    this._wallet = { ...wallet };
  }

  /**
   * Warm up observer with initial candles
   * Should be called before manager.start()
   */
  async warmupObserver(symbol: string, candles: ProcessedCandle[]): Promise<void> {
    const observer = this._observers.get(symbol);
    if (!observer) {
      throw new Error(`Observer for ${symbol} not initialized`);
    }

    // Store candles in buffer
    this._candleBuffers.set(symbol, [...candles]);

    // Warm up observer
    observer.warmupFromCandles(candles);
    console.log(`[TradingManager] ${symbol}: warmed up with ${candles.length} candles`);
  }

  // ── Main candle handler ─────────────────────────────────────────────────────

  /**
   * Process a new candle close event
   * Called by DataProvider when a candle closes
   * @param symbol - Trading pair
   * @param candle - Processed candle with indicators
   */
  async onCandleClose(symbol: string, candle: ProcessedCandle): Promise<void> {
    if (!this._running) return;

    try {
      const ts = candle.openTime;

      // Reset daily counters on new day (GMT-3)
      const today = dayGMT3(ts);
      if (today !== this._dailyDay) {
        this._dailyDay = today;
        this._dailyTrades = 0;
        this._dailyPnlPct = 0;
        console.log(`[TradingManager] Daily reset: ${today}`);
      }

      // Update candle buffer for this symbol
      const buffer = this._candleBuffers.get(symbol) ?? [];
      buffer.push(candle);
      if (buffer.length > BUFFER_MAX) buffer.shift();
      this._candleBuffers.set(symbol, buffer);

      // Update last price
      this._lastPrices.set(symbol, candle.close);

      // Emit price update
      this.emit("price", {
        type: "price",
        symbol,
        price: candle.close,
        timestamp: ts,
      } as ManagerEvent);

      // Update observer
      const observer = this._observers.get(symbol);
      if (!observer) {
        console.warn(`[TradingManager] Observer not found for ${symbol}`);
        return;
      }

      observer.tick(candle);

      // Check sell if holding position in this symbol
      if (this._activeTrade?.position.symbol === symbol) {
        this._checkSell(symbol, candle.close, ts);
        return;
      }

      // Check buy if not holding position
      if (!this._wallet.inTrade) {
        this._checkBuy(ts);
      }
    } catch (e) {
      console.error(`[TradingManager] Error processing ${symbol} candle:`, (e as Error).message);
      this.emit("error", { type: "candle_error", error: (e as Error).message });
    }
  }

  // ── Sell logic ──────────────────────────────────────────────────────────────

  private _checkSell(symbol: string, price: number, ts: number): void {
    const trade = this._activeTrade;
    if (!trade || this._selling) return;

    const target = trade.position.buyPrice * trade.sellMult;
    if (price < target) return;

    console.log(
      `[TradingManager] ${symbol}: SELL TARGET HIT @ $${fmtN(price, 4)} ` +
      `(target: $${fmtN(target, 4)})`
    );

    this._executeSell(price, ts).catch((e) => {
      console.error(`[TradingManager] Sell execution failed:`, (e as Error).message);
      this.emit("error", { type: "sell_error", error: (e as Error).message });
    });
  }

  private async _executeSell(price: number, ts: number): Promise<void> {
    if (!this._activeTrade || this._selling) return;

    this._selling = true;
    const trade = this._activeTrade;
    this._activeTrade = null; // Clear immediately to prevent double-sell

    try {
      // Call executor to persist sell to database (implementation moves to execution layer)
      // For now, just update wallet
      const btcSold = trade.position.btcNet;
      const usdtGross = btcSold * price;
      const feeUsdt = usdtGross * trade.position.feeRate;
      const usdtNet = usdtGross - feeUsdt;
      const pnlUsdt = usdtNet - trade.position.usdtSpent;
      const pnlPct = (pnlUsdt / trade.position.usdtSpent) * 100;

      this._wallet.btc = 0;
      this._wallet.usdt = usdtNet;
      this._wallet.inTrade = false;

      this._dailyTrades += 1;
      this._dailyPnlPct += pnlPct;

      console.log(
        `[TradingManager] SOLD ${trade.position.symbol}: ` +
        `$${fmtN(usdtNet, 2)} P&L: ${pnlPct > 0 ? "+" : ""}${fmtN(pnlPct, 3)}%`
      );

      // Notify observer of sell
      const observer = this._observers.get(trade.position.symbol);
      observer?.onSell(trade.strategy);

      // Emit sell event
      this.emit("sell", {
        type: "sell",
        symbol: trade.position.symbol,
        price,
        timestamp: ts,
        pnl: pnlUsdt,
        pnlPct,
      } as ManagerEvent);

      this._selling = false;
    } catch (e) {
      console.error("[TradingManager] Sell failed:", (e as Error).message);
      this._activeTrade = trade; // Restore on error
      this._selling = false;
      throw e;
    }
  }

  // ── Buy logic ───────────────────────────────────────────────────────────────

  private _checkBuy(ts: number): void {
    if (this._buying || this._wallet.inTrade) return;

    const dailyLimitReached =
      this._dailyTrades >= this._config.dailyMaxTrades ||
      this._dailyPnlPct >= this._config.dailyMaxPnlPct;

    if (dailyLimitReached) {
      console.debug(
        `[TradingManager] Daily limit reached: trades=${this._dailyTrades}/${this._config.dailyMaxTrades}, ` +
        `pnl=${fmtN(this._dailyPnlPct)}%/${this._config.dailyMaxPnlPct}%`
      );
      return;
    }

    // Scan all observers for signals
    let bestSignal: Signal | null = null;

    for (const [symbol, observer] of this._observers) {
      if (!observer.match || !observer.matchCandle || !observer.strategy) continue;

      // Check UP_MAX_STREAK filter
      if (observer.strategy === "up" && observer.upStreak >= this._config.upMaxStreak) {
        console.debug(`[TradingManager] ${symbol}: upStreak ${observer.upStreak} >= limit`);
        continue;
      }

      const signal: Signal = {
        symbol,
        strategy: observer.strategy,
        candle: observer.matchCandle,
        receivedAt: observer.matchCandle.openTime,
      };

      if (!bestSignal || signal.receivedAt > bestSignal.receivedAt) {
        bestSignal = signal;
      }
    }

    if (!bestSignal) return;

    // Check signal TTL
    if (ts - bestSignal.receivedAt > SIGNAL_TTL_MS) {
      console.debug(
        `[TradingManager] ${bestSignal.symbol}: signal expired (${ts - bestSignal.receivedAt}ms)`
      );
      return;
    }

    this._executeBuy(bestSignal, ts).catch((e) => {
      console.error(`[TradingManager] Buy execution failed:`, (e as Error).message);
      this.emit("error", { type: "buy_error", error: (e as Error).message });
    });
  }

  private async _executeBuy(signal: Signal, ts: number): Promise<void> {
    if (this._buying || this._wallet.inTrade) return;

    this._buying = true;

    try {
      const symbol = signal.symbol;
      const price = signal.candle.close;

      if (this._wallet.usdt <= 0) {
        throw new Error(`Insufficient balance: $${fmtN(this._wallet.usdt)}`);
      }

      const usdtSpent = this._wallet.usdt;
      const btcGross = usdtSpent / price;
      const feeBtc = btcGross * this._config.feeRate;
      const btcNet = btcGross - feeBtc;

      // Update wallet
      this._wallet.usdt = 0;
      this._wallet.btc = btcNet;
      this._wallet.inTrade = true;

      // Create active trade
      this._activeTrade = {
        position: {
          symbol,
          buyTime: ts,
          buyPrice: price,
          usdtSpent,
          btcNet,
          feeRate: this._config.feeRate,
        },
        currentPrice: price,
        strategy: signal.strategy,
        sellMult: getSymbolParams(symbol)[signal.strategy === "up" ? "upSell" : "downSell"],
      };

      console.log(
        `[TradingManager] BUY ${symbol} @ $${fmtN(price, 2)}: ` +
        `${fmtN(btcNet, 8)} BTC (${signal.strategy})`
      );

      // Notify observer
      const observer = this._observers.get(symbol);
      observer?.onBuy(signal.strategy);

      // Emit buy event
      this.emit("buy", {
        type: "buy",
        symbol,
        price,
        timestamp: ts,
        btcAmount: btcNet,
      } as ManagerEvent);

      this._buying = false;
    } catch (e) {
      console.error("[TradingManager] Buy failed:", (e as Error).message);
      this._wallet.usdt += this._wallet.btc * (this._activeTrade?.currentPrice ?? 0); // Rollback
      this._wallet.btc = 0;
      this._wallet.inTrade = false;
      this._activeTrade = null;
      this._buying = false;
      throw e;
    }
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────

  private _getDefaultConfig(): TradingConfig {
    return {
      upMaxStreak: DEFAULT_UP_MAX_STREAK,
      dailyMaxTrades: DEFAULT_DAILY_MAX_TRADES,
      dailyMaxPnlPct: DEFAULT_DAILY_MAX_PNL_PCT,
      feeRate: DEFAULT_FEE_RATE,
      initialBalanceUsdt: DEFAULT_INITIAL_BALANCE,
      symbolParams: {},
    };
  }
}
