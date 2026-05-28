// ─────────────────────────────────────────────
// src/GainersManager.js
// Manages multiple CryptoObservers and provides top gainers
// ─────────────────────────────────────────────

const { EventEmitter } = require("events");
const CryptoObserver = require("./CryptoObserver");
const { getAvailableSymbols } = require("./binanceAPI");

class GainersManager extends EventEmitter {
  constructor() {
    super();
    this.observers = new Map(); // symbol -> CryptoObserver
    this._initialized = false;
    this._initializationPromise = null;
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

}

module.exports = GainersManager;
