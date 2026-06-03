// ─────────────────────────────────────────────
// src/CryptoObserver.js
// Per-crypto observer with 1-hour buffer and real-time gainer calculation
// ─────────────────────────────────────────────

const { fetchKlines } = require("./binanceAPI");
const config = require("./config");

class CryptoObserver {
  constructor(symbol) {
    this.symbol = symbol;
    this.bufferSize = config.GAINERS_BUFFER_SIZE; // Configurable (default: 60 for 1 hour)
    this.buffer = []; // Queue of last N candles

    // Multi-timeframe gainer percentages (calculated from same 1m buffer)
    this._gainer1m = 0;   // % change in last 1 minute
    this._gainer5m = 0;   // % change in last 5 minutes
    this._gainer15m = 0;  // % change in last 15 minutes
    this._gainer30m = 0;  // % change in last 30 minutes
    this._gainer1h = 0;   // % change in last 1 hour

    // Volume delta tracking (buy pressure validation)
    this._buyRatioHistory = []; // Last 5 buy ratios (max 5 elements)
    this._currentBuyRatio = 0;  // Buy ratio of current candle

    this._initialized = false;
    this._loading = false;

    // Sequential state machine for symbol selection
    // Each condition builds on the previous one (must be true to advance)
    // All reset when Price < MA99
    this._selectionState = {
      step1_initialized: false,        // 1) Observer initialized (_initialized = true)
      step2_bufferFull: false,         // 2) Buffer full (buffer.length === 99)
      step3_pisoMet: false,            // 3) PISO: BBUPPER < MA99
      step4_subidaMet: false,          // 4) SUBIDA: gainer5m > 1.0
      step5_canBuy: false,             // 5) COMPRA: BBUPPER < PRICE
      step6_priceExceeded: false,      // 6) Invalidación: Price > MA99 × 1.015 (permanent disqualification)
    };
  }

  /**
   * Initialize observer by downloading the last N klines
   * Calculates initial gainer percentage
   */
  async initialize() {
    if (this._initialized || this._loading) {
      return;
    }

    this._loading = true;
    try {
      console.log(
        `[CryptoObserver] ${this.symbol}: Loading initial ${this.bufferSize} klines...`
      );

      // Fetch the last N candles (default: 60 for 1 hour at 1m interval)
      const klines = await fetchKlines(this.symbol, this.bufferSize, "1m");

      if (klines.length === 0) {
        throw new Error("No klines returned from Binance");
      }

      // Store in buffer
      this.buffer = klines;

      // Calculate initial gainer
      this._recalculateGainer();

      // Update UP condition state machine
      this._updateSelectionState();

      this._initialized = true;
      console.log(
        `[CryptoObserver] ${this.symbol}: ✅ Initialized. Gainer: ${this._gainer1h.toFixed(2)}%`
      );
    } catch (error) {
      console.error(`[CryptoObserver] ${this.symbol}: ❌ Failed to initialize:`, error.message);
      throw error;
    } finally {
      this._loading = false;
    }
  }

  /**
   * Add a new 1-minute candle to the buffer
   * Automatically maintains FIFO queue (max bufferSize candles)
   * Recalculates gainer
   *
   * @param {Object} candle - New candle data
   */
  updateCandle(candle) {
    if (!this._initialized) {
      console.warn(`[CryptoObserver] ${this.symbol}: Candle received before initialization`);
      return;
    }

    // Remove oldest if buffer is full
    if (this.buffer.length >= this.bufferSize) {
      this.buffer.shift();
    }

    // Add new candle
    this.buffer.push(candle);

    // Recalculate gainer
    this._recalculateGainer();

    // Update buy volume ratio
    this._updateBuyRatio(candle);

    // Update sequential selection state machine
    this._updateSelectionState();
  }

  /**
   * Calculate gainer percentage for a specific timeframe
   * Formula: ((close[latest] - close[N min ago]) / close[N min ago]) * 100
   * Buffer has 60 1-minute candles, so max lookback is 60 minutes
   *
   * @param {number} minutesAgo - How many minutes back to look (5, 15, 30, 60)
   * @returns {number} Percentage change
   * @private
   */
  _calculateGainerForTimeframe(minutesAgo) {
    if (this.buffer.length < 2) {
      return 0;
    }

    const latestCandle = this.buffer[this.buffer.length - 1];

    // Calculate index: minutesAgo minutes back from the end
    // Buffer indexes: [0, 1, 2, ..., length-1]
    // buffer[length-1] = current candle (t)
    // buffer[length-2] = 1 minute ago (t-1)
    // buffer[length-1-minutesAgo] = minutesAgo minutes ago
    const indexAgo = Math.max(0, this.buffer.length - minutesAgo - 1);
    const candleAgo = this.buffer[indexAgo];

    if (!candleAgo || candleAgo.close === 0) {
      return 0;
    }

    const change = (latestCandle.close - candleAgo.close) / candleAgo.close;
    return change * 100;
  }

  /**
   * Recalculate all gainer percentages (1m, 5m, 15m, 30m, 1h)
   * Called whenever a new candle is added
   * Uses the same buffer data for all timeframes
   * @private
   */
  _recalculateGainer() {
    if (this.buffer.length < 2) {
      this._gainer1m = 0;
      this._gainer5m = 0;
      this._gainer15m = 0;
      this._gainer30m = 0;
      this._gainer1h = 0;
      return;
    }

    // Calculate all timeframes from the same 1m buffer
    this._gainer1m = this._calculateGainerForTimeframe(1);
    this._gainer5m = this._calculateGainerForTimeframe(5);
    this._gainer15m = this._calculateGainerForTimeframe(15);
    this._gainer30m = this._calculateGainerForTimeframe(30);
    this._gainer1h = this._calculateGainerForTimeframe(60);
  }

  /**
   * Update buy volume ratio (buy pressure indicator)
   * buyRatio = takerBuyBaseAssetVolume / totalVolume
   * Higher ratio = more buying pressure
   * @private
   */
  _updateBuyRatio(candle) {
    if (!candle.volume || candle.volume === 0 || !candle.takerBuyBaseAssetVolume) {
      this._currentBuyRatio = 0;
      return;
    }

    // Calculate buy ratio for this candle
    this._currentBuyRatio = candle.takerBuyBaseAssetVolume / candle.volume;

    // Keep history of last 5 ratios
    this._buyRatioHistory.push(this._currentBuyRatio);
    if (this._buyRatioHistory.length > 5) {
      this._buyRatioHistory.shift();
    }
  }

  /**
   * Check if there's consistent buying pressure
   * Returns true if current buyRatio > 0.6 AND average of last 3-5 ratios is strong
   * @returns {boolean}
   */
  isBuyingPressure() {
    // Need at least 1 candle
    if (this._buyRatioHistory.length === 0) {
      return false;
    }

    // Current candle must have buyRatio > 0.6
    if (this._currentBuyRatio <= 0.6) {
      return false;
    }

    // If we have history, check if trend is UP (at least last 3 ratios increasing)
    if (this._buyRatioHistory.length >= 3) {
      const lastThree = this._buyRatioHistory.slice(-3);
      // All three should be > 0.55 (slightly below threshold) to show consistent pressure
      const allAboveThreshold = lastThree.every((ratio) => ratio > 0.55);
      if (!allAboveThreshold) {
        return false;
      }
    }

    return true;
  }

  /**
   * Get buy ratio for current candle
   */
  get buyRatio() {
    return this._currentBuyRatio;
  }

  /**
   * Get average buy ratio of last 5 candles
   */
  get avgBuyRatio() {
    if (this._buyRatioHistory.length === 0) {
      return 0;
    }
    return this._buyRatioHistory.reduce((a, b) => a + b, 0) / this._buyRatioHistory.length;
  }

  /**
   * Update sequential selection state machine
   * Sequential progression: each step requires previous step to be true
   * Step 1: _initialized = true (initial state, no condition required)
   * Step 2: Buffer full (buffer.length === 99)
   * Step 3: PISO (BBUPPER < MA99)
   * Step 4: SUBIDA (gainer1m > 1.0)
   * Step 5: COMPRA (BBUPPER < PRICE)
   * Step 6: Invalidación (Price > MA99 × 1.015) - permanent disqualification
   * Step 7: Reset cuando Price < MA99
   * @private
   */
  _updateSelectionState() {
    const ma99 = this.ma99;
    const price = this.currentPrice;

    // Condition 7: Reset all when Price < MA99
    if (ma99 > 0 && price < ma99) {
      this._selectionState.step1_initialized = false;
      this._selectionState.step2_bufferFull = false;
      this._selectionState.step3_pisoMet = false;
      this._selectionState.step4_subidaMet = false;
      this._selectionState.step5_canBuy = false;
      this._selectionState.step6_priceExceeded = false;
      return;
    }

    // Step 1: Initialized (initial state)
    if (!this._selectionState.step1_initialized && this._initialized) {
      this._selectionState.step1_initialized = true;
    }

    // Step 2: Buffer full (requires step1 true)
    if (this._selectionState.step1_initialized && !this._selectionState.step2_bufferFull &&
        this.buffer.length === this.bufferSize) {
      this._selectionState.step2_bufferFull = true;
    }

    // Step 3: PISO - BBUPPER < MA99 (requires step2 true)
    if (this._selectionState.step2_bufferFull && !this._selectionState.step3_pisoMet &&
        ma99 > 0 && this.bbUpper < ma99) {
      this._selectionState.step3_pisoMet = true;
    }

    // Step 4: SUBIDA - gainer1m > 1.0 (requires step3 true)
    if (this._selectionState.step3_pisoMet && !this._selectionState.step4_subidaMet &&
        this._gainer1m > 1.0) {
      this._selectionState.step4_subidaMet = true;
    }

    // Step 5: COMPRA - BBUPPER < PRICE (requires step4 true)
    if (this._selectionState.step4_subidaMet && !this._selectionState.step5_canBuy &&
        price > 0 && this.bbUpper < price) {
      this._selectionState.step5_canBuy = true;
    }

    // Step 6: Invalidación - Price > MA99 × 1.015 (independent disqualifier)
    if (!this._selectionState.step6_priceExceeded && ma99 > 0 &&
        price > (ma99 * 1.015)) {
      this._selectionState.step6_priceExceeded = true;
    }
  }

  /**
   * Get current 1-minute gainer percentage
   */
  get gainer1m() {
    return this._gainer1m;
  }

  /**
   * Get current 5-minute gainer percentage
   */
  get gainer5m() {
    return this._gainer5m;
  }

  /**
   * Get current 15-minute gainer percentage
   */
  get gainer15m() {
    return this._gainer15m;
  }

  /**
   * Get current 30-minute gainer percentage
   */
  get gainer30m() {
    return this._gainer30m;
  }

  /**
   * Get current 1-hour gainer percentage
   */
  get gainer1h() {
    return this._gainer1h;
  }

  /**
   * Get current price (latest close)
   */
  get currentPrice() {
    if (this.buffer.length === 0) return null;
    return this.buffer[this.buffer.length - 1].close;
  }

  /**
   * Calculate Moving Average (SMA) for last N candles
   * @param {number} period - Number of candles to average
   * @returns {number} Moving average value (0 if insufficient data)
   * @private
   */
  _calculateMA(period) {
    if (this.buffer.length < period) {
      return 0;
    }

    const slice = this.buffer.slice(-period);
    const sum = slice.reduce((acc, candle) => acc + candle.close, 0);
    return sum / period;
  }

  /**
   * Get MA20 (20-period moving average)
   */
  get ma20() {
    return this._calculateMA(20);
  }

  /**
   * Get MA99 (99-period moving average)
   * Returns 0 if insufficient data
   */
  get ma99() {
    // If buffer has less than 99 candles, use what we have
    if (this.buffer.length < 99) {
      return 0; // Not enough data for MA99
    }
    return this._calculateMA(99);
  }

  /**
   * Calculate Bollinger Bands (20-period, 2 standard deviations)
   * Uses simple moving average and standard deviation
   * @returns {Object} { bbUpper, bbMiddle, bbLower }
   * @private
   */
  _calculateBollingerBands(period = 20, numStdDev = 2) {
    if (this.buffer.length < period) {
      return { bbUpper: 0, bbMiddle: 0, bbLower: 0 };
    }

    const slice = this.buffer.slice(-period);
    const closes = slice.map((c) => c.close);

    // Calculate SMA (middle band)
    const sma = closes.reduce((a, b) => a + b, 0) / period;

    // Calculate standard deviation
    const variance =
      closes.reduce((acc, close) => acc + Math.pow(close - sma, 2), 0) / period;
    const stdDev = Math.sqrt(variance);

    return {
      bbMiddle: sma,
      bbUpper: sma + numStdDev * stdDev,
      bbLower: sma - numStdDev * stdDev,
    };
  }

  /**
   * Get Bollinger Bands upper band
   */
  get bbUpper() {
    return this._calculateBollingerBands().bbUpper;
  }

  /**
   * Get Bollinger Bands lower band
   */
  get bbLower() {
    return this._calculateBollingerBands().bbLower;
  }

  /**
   * Get all technical indicators as object
   * Includes multi-timeframe gainer percentages
   */
  getIndicators() {
    return {
      // Moving averages
      ma20: this.ma20,
      ma99: this.ma99,
      // Bollinger Bands
      bbUpper: this.bbUpper,
      bbLower: this.bbLower,
      // Multi-timeframe gainer percentages
      gainer1m: this.gainer1m,
      gainer5m: this.gainer5m,
      gainer15m: this.gainer15m,
      gainer30m: this.gainer30m,
      gainer1h: this.gainer1h,
    };
  }

  /**
   * Evaluate condition: Price above MA20
   */
  get priceAboveMA20() {
    return this.ma20 > 0 && this.currentPrice > this.ma20;
  }

  /**
   * Evaluate condition: Price below MA20
   */
  get priceBelowMA20() {
    return this.ma20 > 0 && this.currentPrice < this.ma20;
  }

  /**
   * Evaluate condition: MA20 above MA99 (uptrend)
   */
  get ma20AboveMA99() {
    return this.ma99 > 0 && this.ma20 > this.ma99;
  }

  /**
   * Evaluate condition: MA20 below MA99 (downtrend)
   */
  get ma20BelowMA99() {
    return this.ma99 > 0 && this.ma20 < this.ma99;
  }

  /**
   * Evaluate condition: Price above upper Bollinger Band
   */
  get priceAboveBBUpper() {
    return this.bbUpper > 0 && this.currentPrice > this.bbUpper;
  }

  /**
   * Evaluate condition: Price below lower Bollinger Band
   */
  get priceBelowBBLower() {
    return this.bbLower > 0 && this.currentPrice < this.bbLower;
  }

  /**
   * Evaluate condition: Price between Bollinger Bands
   */
  get priceBetweenBB() {
    return this.bbUpper > 0 && this.bbLower > 0 &&
           this.currentPrice >= this.bbLower &&
           this.currentPrice <= this.bbUpper;
  }

  /**
   * Price in breakout range (MA99 × 0.97 to MA99 × 1.03)
   * Breakout Alcista condition: Price between -3% and +3% relative to MA99
   */
  get priceAboveMA99Breakout() {
    if (this.ma99 === 0) return false;
    const lowerBound = this.ma99 * 0.97;
    const upperBound = this.ma99 * 1.03;
    return this.currentPrice >= lowerBound && this.currentPrice <= upperBound;
  }

  /**
   * Price below MA99 depressed level (MA99 × 0.970)
   * Precio Deprimido condition
   */
  get priceBelowMA99Depressed() {
    if (this.ma99 === 0) return false;
    return this.currentPrice < (this.ma99 * 0.970);
  }

  /**
   * CAN BUY: Sequential conditions met (step 5) and not invalidated (step 6 false)
   * All 5 sequential steps must be true AND price must not exceed MA99 × 1.015
   */
  get canBuyUP() {
    return this._selectionState.step5_canBuy && !this._selectionState.step6_priceExceeded;
  }

  /**
   * Get all condition evaluations (sequential state machine)
   */
  getConditions() {
    return {
      // Sequential selection conditions
      // Step 1: Observer initialized
      step1_initialized: this._selectionState.step1_initialized,
      // Step 2: Buffer full (99 candles)
      step2_bufferFull: this._selectionState.step2_bufferFull,
      // Step 3: PISO - BBUPPER < MA99
      step3_pisoMet: this._selectionState.step3_pisoMet,
      // Step 4: SUBIDA - gainer5m > 1.0
      step4_subidaMet: this._selectionState.step4_subidaMet,
      // Step 5: COMPRA - BBUPPER < PRICE
      step5_canBuy: this._selectionState.step5_canBuy,
      // Step 6: Invalidación - Price > MA99 × 1.015
      step6_priceExceeded: this._selectionState.step6_priceExceeded,
      // Final: Can execute buy
      canBuyUP: this.canBuyUP,

      // Technical indicators (for reference)
      ma20: this.ma20,
      ma99: this.ma99,
      bbUpper: this.bbUpper,
      bbLower: this.bbLower,
      currentPrice: this.currentPrice,
      gainer1m: this._gainer1m,
      gainer5m: this._gainer5m,
      // Volume delta indicators
      buyRatio: this.buyRatio,
      avgBuyRatio: this.avgBuyRatio,
      isBuyingPressure: this.isBuyingPressure(),
    };
  }

  /**
   * Check if observer is ready (has full buffer = complete timeframe)
   */
  get isReady() {
    return this._initialized && this.buffer.length === this.bufferSize;
  }

  /**
   * Get buffer state for debugging
   */
  getState() {
    return {
      symbol: this.symbol,
      initialized: this._initialized,
      configuredBufferSize: this.bufferSize,
      currentBufferSize: this.buffer.length,
      isFull: this.buffer.length === this.bufferSize,
      gainer1h: this._gainer1h,
      currentPrice: this.currentPrice,
      oldestCandle: this.buffer.length > 0 ? new Date(this.buffer[0].openTime).toISOString() : null,
      latestCandle: this.buffer.length > 0 ? new Date(this.buffer[this.buffer.length - 1].openTime).toISOString() : null,
    };
  }
}

module.exports = CryptoObserver;
