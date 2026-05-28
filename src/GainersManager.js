// ─────────────────────────────────────────────
// src/GainersManager.js
// Manages multiple CryptoObservers and provides top gainers
// ─────────────────────────────────────────────

const { EventEmitter } = require("events");
const CryptoObserver = require("./CryptoObserver");
const CandleObserver = require("./CandleObserver");
const { getAvailableSymbols } = require("./binanceAPI");

const FEE = 0.001; // 0.1% fee

class GainersManager extends EventEmitter {
  constructor() {
    super();
    this.observers = new Map(); // symbol -> CryptoObserver
    this._initialized = false;
    this._initializationPromise = null;

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
        console.log(`[GainersManager] Initializing ${symbols.length} symbols...`);

        // Create observers for each symbol
        const initPromises = symbols.map(async (symbol) => {
          const observer = new CryptoObserver(symbol);
          this.observers.set(symbol, observer);

          try {
            await observer.initialize();
          } catch (error) {
            console.error(`[GainersManager] Failed to initialize ${symbol}:`, error.message);
            this.observers.delete(symbol); // Remove failed observer
          }
        });

        // Wait for all initializations
        await Promise.all(initPromises);

        const successCount = this.observers.size;
        console.log(
          `[GainersManager] ✅ Initialized ${successCount}/${symbols.length} symbols`
        );

        this._initialized = true;
        this.emit("initialized", { count: successCount });
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
   * Monitors: trading signals for top 10, and sell conditions for active position
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

    // Monitor active position (sell condition)
    if (this.tradingState.activeCandleObserver && this.tradingState.activeCandleObserver.symbol === symbol) {
      this._monitorActivePosition(symbol, observer, candle);
    }

    // Check for trading signals ONLY if this symbol is in top 10 gainers
    if (this._isInTop10(symbol)) {
      this._checkTradingSignals(symbol, observer);
    }
  }

  /**
   * Check if a symbol is in the current top 10 gainers
   * @private
   */
  _isInTop10(symbol) {
    const top10 = this.getTop1hGainers(10);
    return top10.some((gainer) => gainer.symbol === symbol);
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

    // Create CandleObserver for this position
    const candleObserver = new CandleObserver(symbol, buyPrice, btcAfterFee);

    // Store signal type for sell condition logic
    candleObserver.signalType = signalType;

    // Store reference to the CryptoObserver (1m buffer) for monitoring sell conditions
    candleObserver.cryptoObserver = observer;

    // Listen for sell completion
    candleObserver.on("sell", (sellInfo) => {
      this._onSellCompleted(sellInfo);
    });

    // Update trading state
    this.tradingState.activeCandleObserver = candleObserver;
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
   * Monitor active trading position using 1m candle buffer
   * Checks sell conditions on each new candle from the buffer
   * @private
   */
  _monitorActivePosition(symbol, observer, candle) {
    const candleObserver = this.tradingState.activeCandleObserver;
    const cryptoObserverBuffer = candleObserver.cryptoObserver;

    // Update with latest candle data from the 1m buffer
    candleObserver.updateWithCandle({
      close: observer.currentPrice,
      ma20: observer.ma20,
      ma99: observer.ma99,
      bbUpper: observer.bbUpper,
      bbLower: observer.bbLower,
    });

    // Monitor sell condition: simple price-based target
    // Sell when: currentPrice >= buyPrice * 1.005 (0.5% profit target)
    const sellTarget = candleObserver.buyPrice * 1.005;
    const currentPrice = observer.currentPrice;
    const shouldSell = currentPrice >= sellTarget;

    if (shouldSell) {
      console.log(
        `[GainersManager] 📊 Sell target reached for ${symbol}:`,
        `currentPrice=${currentPrice.toFixed(8)} >= sellTarget=${sellTarget.toFixed(8)}`
      );
    }

    if (shouldSell) {
      this._executeSellOrder(candleObserver, cryptoObserverBuffer);
    }
  }

  /**
   * Execute sell order when condition is met in 1m candle buffer
   * Applies 0.1% fee on USDT received
   * @private
   */
  _executeSellOrder(candleObserver, cryptoObserverBuffer) {
    const sellInfo = candleObserver.executeSell();

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
   * Get top N gainers in the last 1 hour
   * Sorted descending (largest gains first)
   *
   * @param {number} limit - Number of gainers to return (default: 10)
   * @returns {Array<Object>} Array of top gainers
   */
  getTop1hGainers(limit = 10) {
    const gainers = Array.from(this.observers.values())
      .filter((observer) => observer.isReady) // Only ready observers
      .map((observer) => ({
        symbol: observer.symbol,
        gainer1h: observer.gainer1h,
        price: observer.currentPrice,
        bufferSize: observer.bufferSize,
      }))
      .sort((a, b) => b.gainer1h - a.gainer1h) // Descending
      .slice(0, limit);

    return gainers;
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
      topGainers: this.getTop1hGainers(10),
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
