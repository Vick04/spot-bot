// ─────────────────────────────────────────────
// src/GainersManager.js
// Manages multiple CryptoObservers and provides top gainers
// ─────────────────────────────────────────────

const { EventEmitter } = require("events");
const fs = require("fs");
const path = require("path");
const CryptoObserver = require("./CryptoObserver");
const OrderObserver = require("./OrderObserver");
const { getAvailableSymbols } = require("./binanceAPI");

const FEE = 0.001; // 0.1% fee

// Load blacklist from file
let BLACKLIST = [];
try {
  const blacklistPath = path.join(__dirname, "../blacklist.json");
  const blacklistData = JSON.parse(fs.readFileSync(blacklistPath, "utf8"));
  BLACKLIST = blacklistData.blacklist || [];
  console.log(`[GainersManager] Loaded blacklist with ${BLACKLIST.length} symbols`);
} catch (error) {
  console.warn("[GainersManager] Could not load blacklist.json:", error.message);
  BLACKLIST = [];
}

class GainersManager extends EventEmitter {
  constructor() {
    super();
    this.observers = new Map(); // symbol -> CryptoObserver
    this._initialized = false;
    this._initializationPromise = null;

    // Symbol statistics
    this.symbolStats = {
      totalAttempted: 0,      // Total symbols passed to initialize()
      activeSymbols: 0,       // Successfully initialized
      blacklistedSymbols: 0,  // Excluded by blacklist
      failedSymbols: 0,       // Failed to initialize
    };

    // Trading state
    this.tradingState = {
      balance: 10000, // Initial balance
      activeCandleObserver: null, // Currently active position
      completedOrders: [], // History of completed trades
      stats: {
        totalTrades: 0,
        totalProfit: 0,
        totalProfitPercent: 0,
        winTrades: 0,
        lossTrades: 0,
        totalFees: 0,
        avgProfitPercent: 0,
      },
    };

    // Track previous condition state to detect changes
    this.previousConditions = new Map(); // symbol -> { canBuyUP, canBuyDOWN }
  }

  /**
   * Check if a symbol is in the blacklist
   * @private
   */
  _isBlacklisted(symbol) {
    return BLACKLIST.includes(symbol);
  }

  /**
   * Initialize manager with a list of symbols
   * Downloads initial 60 klines for each symbol in parallel
   *
   * @param {Array<string>} symbols - Trading pairs to track
   */
  async initialize(symbols) {
    if (this._initialized) {
      console.warn("[GainersManager] Already initialized");
      return;
    }

    if (this._initializationPromise) {
      return this._initializationPromise;
    }

    this._initializationPromise = (async () => {
      try {
        // Track statistics
        this.symbolStats.totalAttempted = symbols.length;

        // Filter out blacklisted symbols
        const filteredSymbols = symbols.filter((symbol) => {
          if (this._isBlacklisted(symbol)) {
            console.log(`[GainersManager] ⛔ Skipping blacklisted symbol: ${symbol}`);
            this.symbolStats.blacklistedSymbols++;
            return false;
          }
          return true;
        });

        console.log(
          `[GainersManager] Initializing ${filteredSymbols.length}/${symbols.length} symbols (${this.symbolStats.blacklistedSymbols} blacklisted)...`
        );

        // Create observers for each symbol
        const initPromises = filteredSymbols.map(async (symbol) => {
          const observer = new CryptoObserver(symbol);
          this.observers.set(symbol, observer);

          try {
            await observer.initialize();
          } catch (error) {
            console.error(`[GainersManager] Failed to initialize ${symbol}:`, error.message);
            this.observers.delete(symbol); // Remove failed observer
            this.symbolStats.failedSymbols++;
          }
        });

        // Wait for all initializations
        await Promise.all(initPromises);

        const successCount = this.observers.size;
        this.symbolStats.activeSymbols = successCount;

        const discardedCount = this.symbolStats.blacklistedSymbols + this.symbolStats.failedSymbols;
        console.log(
          `[GainersManager] ✅ Initialized ${successCount}/${symbols.length} symbols (${discardedCount} discarded)`
        );

        this._initialized = true;
        this.emit("initialized", {
          count: successCount,
          stats: this.symbolStats
        });
      } catch (error) {
        console.error("[GainersManager] Initialization failed:", error.message);
        throw error;
      }
    })();

    return this._initializationPromise;
  }

  /**
   * Auto-initialize with top liquid symbols from Binance
   * Downloads all available USDT pairs, filters by volume
   *
   * @param {number} count - Number of symbols to track (default: 50)
   * @param {number} minVolume - Minimum 24h volume filter (default: 1M USDT)
   */
  async initializeAuto(count = 50, minVolume = 1_000_000) {
    try {
      console.log("[GainersManager] Fetching available USDT symbols...");
      const symbols = await getAvailableSymbols(minVolume);

      // Take top N by position (which correlates with volume on Binance)
      const selectedSymbols = symbols.slice(0, count);
      console.log(
        `[GainersManager] Found ${symbols.length} USDT pairs, selecting top ${count}`
      );

      await this.initialize(selectedSymbols);
    } catch (error) {
      console.error("[GainersManager] Auto-initialization failed:", error.message);
      throw error;
    }
  }

  /**
   * Update a crypto with a new candle
   * Called when a 1-minute candle closes from WebSocket
   * Monitors: trading signals for top 30, and sell conditions for active position
   *
   * @param {string} symbol - Trading pair
   * @param {Object} candle - New candle data
   */
  updateCandle(symbol, candle) {
    const observer = this.observers.get(symbol);
    if (!observer) {
      console.warn(`[GainersManager] Observer not found for ${symbol}`);
      return;
    }

    observer.updateCandle(candle);

    // Check for trading signals ONLY if this symbol is in top 30 gainers
    // Uses 1m candles and CryptoObserver indicators
    if (this._isInTop30(symbol)) {
      this._checkTradingSignals(symbol, observer);
    }

    // NOTE: Active position monitoring now handled via 1s candles from server.js
    // Don't monitor positions here with 1m candles - OrderObserver uses 1s only
  }

  /**
   * Process a 1-second candle for Condition 2 real-time evaluation (v1.5.0-beta)
   * Updates observer with sub-minute price data for impulse detection
   * @param {string} symbol - Trading symbol
   * @param {Object} candle1s - 1-second candle data
   */
  processOneSecondCandle(symbol, candle1s) {
    const observer = this.observers.get(symbol);
    if (!observer) {
      return; // Observer doesn't exist yet or was removed
    }

    // Pass 1s candle to observer for Condition 2 evaluation
    observer.updateOneSecondCandle(candle1s);
  }

  /**
   * Check if a symbol is in the current top 30 gainers
   * @private
   */
  _isInTop30(symbol) {
    const top30 = this.getTop1hGainers(30);
    return top30.some((gainer) => gainer.symbol === symbol);
  }

  /**
   * Check if a trading signal (BUYUP or BUYDOWN) just occurred
   * Only triggers on transition from false -> true
   *
   * @private
   */
  _checkTradingSignals(symbol, observer) {
    const currentConditions = {
      canBuyUP: observer.canBuyUP,
      canBuyDOWN: observer.canBuyDOWN,
    };

    const previousConditions = this.previousConditions.get(symbol) || {
      canBuyUP: false,
      canBuyDOWN: false,
    };

    // Check if BUYUP just triggered (false -> true transition)
    if (!previousConditions.canBuyUP && currentConditions.canBuyUP) {
      this._onBuyUpSignal(symbol, observer);
    }

    // Check if BUYDOWN just triggered (false -> true transition)
    if (!previousConditions.canBuyDOWN && currentConditions.canBuyDOWN) {
      this._onBuyDownSignal(symbol, observer);
    }

    // Update previous state for next check
    this.previousConditions.set(symbol, currentConditions);
  }

  /**
   * Handle BUYUP signal detection - Execute BUY order
   * @private
   */
  _onBuyUpSignal(symbol, observer) {
    // Only buy if no active position
    if (this.tradingState.activeCandleObserver) {
      console.log(`[GainersManager] ⏭️ Skipping BUY UP ${symbol} - Already in position`);
      return;
    }

    const buyPrice = observer.currentPrice;
    const quantity = this._executeBuyOrder(symbol, buyPrice, "BUY-UP", observer);

    if (quantity > 0) {
      const signalData = {
        type: "BUY-UP",
        symbol: symbol,
        buyPrice: buyPrice,
        quantity: quantity,
        investedAmount: quantity * buyPrice,
        timestamp: new Date().toISOString(),
        ma20: observer.ma20,
        ma99: observer.ma99,
        gainer1h: observer.gainer1h,
      };

      console.log(
        `[GainersManager] 🔼 BUY UP EXECUTED: ${symbol} @ $${buyPrice.toFixed(8)} | Qty: ${quantity.toFixed(8)} | Balance: $${this.tradingState.balance.toFixed(2)}`
      );

      // Emit event for WebSocket broadcast
      this.emit("trading-signal", signalData);
    }
  }

  /**
   * Handle BUYDOWN signal detection - Execute BUY order
   * @private
   */
  _onBuyDownSignal(symbol, observer) {
    // Only buy if no active position
    if (this.tradingState.activeCandleObserver) {
      console.log(`[GainersManager] ⏭️ Skipping BUY DOWN ${symbol} - Already in position`);
      return;
    }

    const buyPrice = observer.currentPrice;
    const quantity = this._executeBuyOrder(symbol, buyPrice, "BUY-DOWN", observer);

    if (quantity > 0) {
      const signalData = {
        type: "BUY-DOWN",
        symbol: symbol,
        buyPrice: buyPrice,
        quantity: quantity,
        investedAmount: quantity * buyPrice,
        timestamp: new Date().toISOString(),
        ma20: observer.ma20,
        ma99: observer.ma99,
        gainer1h: observer.gainer1h,
      };

      console.log(
        `[GainersManager] 🔽 BUY DOWN EXECUTED: ${symbol} @ $${buyPrice.toFixed(8)} | Qty: ${quantity.toFixed(8)} | Balance: $${this.tradingState.balance.toFixed(2)}`
      );

      // Emit event for WebSocket broadcast
      this.emit("trading-signal", signalData);
    }
  }

  /**
   * Execute a buy order - all in with current balance
   * Applies 0.1% fee on BTC received
   * @private
   */
  _executeBuyOrder(symbol, buyPrice, signalType, observer) {
    if (this.tradingState.balance <= 0) {
      console.warn(`[GainersManager] ❌ Cannot buy ${symbol} - Insufficient balance`);
      return 0;
    }

    // Calculate quantity with fee
    // Fee is applied on BTC received: btcReceived = (usdt / price) * (1 - fee)
    const usdtToInvest = this.tradingState.balance;
    const btcBeforeFee = usdtToInvest / buyPrice;
    const btcAfterFee = btcBeforeFee * (1 - FEE);
    const feeAmount = btcBeforeFee * FEE;

    // Create OrderObserver for this position
    // This lightweight observer tracks 1-second candles only
    // Pass: symbol, buyPrice, quantity (after fee), feeAmount, investedUSDT
    const orderObserver = new OrderObserver(symbol, buyPrice, btcAfterFee, feeAmount, usdtToInvest);

    // Store signal type for sell condition logic
    orderObserver.signalType = signalType;

    // Update trading state
    this.tradingState.activeCandleObserver = orderObserver;
    this.tradingState.balance = 0; // All balance invested

    // Record buy order
    const buyOrder = {
      type: "BUY",
      timestamp: new Date().toISOString(),
      symbol: symbol,
      signalType: signalType,
      buyPrice: buyPrice,
      quantity: btcAfterFee,
      investedUSDT: usdtToInvest,
      feeOnBuy: feeAmount,
      status: "open",
    };

    this.tradingState.completedOrders.push(buyOrder);
    this.tradingState.stats.totalTrades++;

    return btcAfterFee;
  }

  /**
   * Monitor active trading position using OrderObserver
   * Receives 1-second candles and evaluates sell condition
   * Public method so server.js can call it with 1s candles
   */
  monitorActivePosition(symbol, candle) {
    const orderObserver = this.tradingState.activeCandleObserver;

    // Update OrderObserver with new 1-second candle price
    orderObserver.updateWithCandle({
      close: candle.close,
    });

    // Check if sell condition is met
    const shouldSell = orderObserver.checkSellCondition();

    if (shouldSell) {
      const gap = orderObserver.sellTarget - orderObserver.currentPrice;
      console.log(
        `[GainersManager] 📊 Sell target reached for ${symbol}:`,
        `currentPrice=${orderObserver.currentPrice.toFixed(8)} >= sellTarget=${orderObserver.sellTarget.toFixed(8)}`
      );

      this._executeSellOrder(orderObserver);
    }
  }

  /**
   * Execute sell order when condition is met
   * Applies 0.1% fee on USDT received
   * Cleans up OrderObserver from memory after sell
   * @private
   */
  _executeSellOrder(orderObserver) {
    const sellInfo = orderObserver.executeSell();

    // Update balance
    this.tradingState.balance = sellInfo.sellValueAfterFee;

    // Update stats
    this.tradingState.stats.totalProfit += sellInfo.profit;
    this.tradingState.stats.totalProfitPercent += sellInfo.profitPercent;
    this.tradingState.stats.totalFees += sellInfo.feeOnSell;

    if (sellInfo.profit > 0) {
      this.tradingState.stats.winTrades++;
    } else if (sellInfo.profit < 0) {
      this.tradingState.stats.lossTrades++;
    }

    if (this.tradingState.stats.totalTrades > 0) {
      this.tradingState.stats.avgProfitPercent =
        this.tradingState.stats.totalProfitPercent / this.tradingState.stats.totalTrades;
    }

    // Record sell order
    const sellOrder = {
      type: "SELL",
      timestamp: new Date().toISOString(),
      symbol: sellInfo.symbol,
      sellPrice: sellInfo.sellPrice,
      quantity: sellInfo.quantity,
      profit: sellInfo.profit,
      profitPercent: sellInfo.profitPercent,
      feeOnSell: sellInfo.feeOnSell,
      status: "closed",
    };

    this.tradingState.completedOrders.push(sellOrder);

    // Clear active position
    this.tradingState.activeCandleObserver = null;

    // Emit sell event for WebSocket broadcast
    this.emit("order-closed", {
      type: "SELL",
      orderInfo: sellInfo,
      tradingState: this.getTradingStatus(),
    });

    console.log(
      `[GainersManager] ✅ SELL COMPLETED: ${sellInfo.symbol} @ $${sellInfo.sellPrice.toFixed(8)} | Profit: ${sellInfo.profitPercent.toFixed(4)}% | New Balance: $${this.tradingState.balance.toFixed(2)}`
    );
  }

  /**
   * Get top N gainers filtered by sequential selection conditions
   * Shows only symbols that meet step 3 or higher
   * Displays symbols grouped by the highest step achieved
   *
   * @param {number} limit - Number of gainers to return (default: 30)
   * @returns {Array<Object>} Array of top gainers with condition states
   */
  getTop1hGainers(limit = 30) {
    // Get all ready observers with their conditions
    const allObservers = Array.from(this.observers.values())
      .filter((observer) => observer.isReady);

    // Map to include condition data
    const withConditions = allObservers.map((observer) => {
      const conditions = observer.getConditions();
      const momentum = observer.ma99Momentum;

      return {
        symbol: observer.symbol,
        gainer1m: observer.gainer1m,
        gainer1h: observer.gainer1h,
        gainer5m: observer.gainer5m,
        gainer15m: observer.gainer15m,
        gainer30m: observer.gainer30m,
        price: observer.currentPrice,
        bufferSize: observer.bufferSize,
        // Technical indicators
        ma20: observer.ma20,
        ma99: observer.ma99,
        bbUpper: observer.bbUpper,
        bbLower: observer.bbLower,
        // MA99 Momentum (slope + acceleration)
        ma99Slope: observer.ma99Slope,
        ma99Accel: observer.ma99Accel,
        // MA20 Momentum
        ma20Slope: observer.ma20Slope,
        ma20Accel: observer.ma20Accel,
        // Volume delta (buy pressure)
        buyRatio: observer.buyRatio,
        avgBuyRatio: observer.avgBuyRatio,
        isBuyingPressure: observer.isBuyingPressure(),
        // v1.4.0-beta: Two sequential conditions (Price Gate + Candle Breakout)
        cond1_bbUpperBelowMa99: conditions.cond1_bbUpperBelowMa99,
        cond2_candleBreakout: conditions.cond2_candleBreakout,
        readyToBuy: conditions.readyToBuy,
        // Ready to buy timing (for UI display)
        readyToBuyTime: conditions.readyToBuyTime,
        readyToBuyMinutesElapsed: conditions.readyToBuyMinutesElapsed,
        // Calculate progress (which condition is furthest reached)
        // If cond1 is FALSE, progress = 0 (gate closed - price too high)
        // If cond1 is TRUE but cond2 is FALSE, progress = 1 (waiting for breakout)
        // If cond1 AND cond2 are TRUE, progress = 2 (readyToBuy)
        progress: !conditions.cond1_bbUpperBelowMa99 ? 0 :
                  !conditions.cond2_candleBreakout ? 1 : 2,
      };
    });

    // v1.4.0-beta: Filter readyToBuy symbols by elapsed time
    // Only show symbols with readyToBuy=TRUE and elapsed < 5 minutes
    // Sort by elapsed time ascending (smallest first - earliest activation)

    const readySymbols = withConditions.filter((obs) =>
      obs.readyToBuy &&
      obs.readyToBuyMinutesElapsed !== null &&
      obs.readyToBuyMinutesElapsed < 5
    );

    // Sort by elapsed time ascending (earliest first)
    return readySymbols
      .sort((a, b) => a.readyToBuyMinutesElapsed - b.readyToBuyMinutesElapsed)
      .slice(0, limit);
  }

  /**
   * Get all gainers (sorted descending)
   */
  getAllGainers() {
    return this.getTop1hGainers(this.observers.size);
  }

  /**
   * Get a specific observer's state (for debugging)
   */
  getObserverState(symbol) {
    const observer = this.observers.get(symbol);
    if (!observer) return null;
    return observer.getState();
  }

  /**
   * Get all observers states
   */
  getAllStates() {
    const states = {};
    for (const [symbol, observer] of this.observers) {
      states[symbol] = observer.getState();
    }
    return states;
  }

  /**
   * Get total symbols being tracked
   */
  get totalSymbols() {
    return this.observers.size;
  }

  /**
   * Get number of ready observers (with full 60 candles)
   */
  get readyCount() {
    return Array.from(this.observers.values()).filter((o) => o.isReady).length;
  }

  /**
   * Check if manager is initialized and all observers are ready
   */
  get isReady() {
    return this._initialized && this.readyCount === this.totalSymbols;
  }

  /**
   * Get manager status for debugging
   */
  getStatus() {
    return {
      initialized: this._initialized,
      totalSymbols: this.totalSymbols,
      readyCount: this.readyCount,
      isReady: this.isReady,
      symbolStats: {
        totalAttempted: this.symbolStats.totalAttempted,
        activeSymbols: this.symbolStats.activeSymbols,
        discardedSymbols: this.symbolStats.blacklistedSymbols + this.symbolStats.failedSymbols,
        blacklistedSymbols: this.symbolStats.blacklistedSymbols,
        failedSymbols: this.symbolStats.failedSymbols,
      },
      topGainers: this.getTop1hGainers(30),
    };
  }

  /**
   * Get trading state (balance, active position, stats)
   */
  getTradingState() {
    return this.tradingState;
  }

  /**
   * Get detailed trading state with additional info
   */
  getTradingStatus() {
    return {
      ...this.tradingState,
      availableBalance: this.tradingState.balance,
      activePosition: this.tradingState.activeCandleObserver,
      recentSignals: this.tradingState.completedOrders.slice(-5), // Last 5 orders
    };
  }

}

module.exports = GainersManager;
