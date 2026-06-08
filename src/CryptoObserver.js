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

    // MA99 momentum tracking (slope + acceleration)
    this._ma99Buffer = [];      // Last 5 MA99 values for momentum calculation
    this._ma99BufferSize = 5;   // Fixed window for momentum detection

    // MA20 momentum tracking (slope + acceleration)
    this._ma20Buffer = [];      // Last 5 MA20 values for momentum calculation
    this._ma20BufferSize = 5;   // Fixed window for momentum detection

    this._initialized = false;
    this._loading = false;

    // Sequential state machine for buy signal (v1.4.0-beta)
    // Condition 1: MA99 momentum gate (GATE - TRUE only with strong uptrend)
    //   If cond1 is TRUE (MA99 slope >= 0.02 AND positive accel) → strong uptrend, allows condition 2 to flow
    //   If cond1 is FALSE (MA99 slope < 0.02 OR stable/downtrend) → blocks all trading (no uptrend momentum)
    // Condition 2: Candle breakout + bullish confirmation (can revert)
    //   TRUE when: ((low < ma20 && high > bbUpper) || (low < bbLower && high > ma20)) AND (close > open)
    //   Requires: Pure breakout pattern without tolerance margins
    // readyToBuy: Cond1=TRUE AND Cond2=TRUE
    this._selectionState = {
      cond1_ma99StrongUptrend: false,  // 1) TRUE if MA99 slope >= 0.02 AND accel >= 0 (strong uptrend gate - required to proceed)
      cond2_candleBreakout: false,     // 2) Candle breakout + bullish
      // Derived state
      readyToBuy: false,               // Cond1=TRUE AND Cond2=TRUE = ready to buy
      readyToBuyTimestamp: null,       // Timestamp when readyToBuy becomes TRUE
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

      // Warm up MA99 momentum buffer with historical data
      // We need to calculate MA99 for each point in the buffer to fill momentum buffer
      // For efficiency, we just fill with the last 5 MA99 values (sliding window)
      for (let i = Math.max(0, this.buffer.length - 5); i < this.buffer.length; i++) {
        // Recalculate MA99 up to this candle index
        const tempSlice = this.buffer.slice(0, i + 1);
        if (tempSlice.length >= 99) {
          const ma99Value = tempSlice.slice(-99).reduce((acc, c) => acc + c.close, 0) / 99;
          this.pushMa99(ma99Value);
        }
      }

      // Warm up MA20 momentum buffer with historical data
      // For efficiency, we just fill with the last 5 MA20 values (sliding window)
      for (let i = Math.max(0, this.buffer.length - 5); i < this.buffer.length; i++) {
        // Recalculate MA20 up to this candle index
        const tempSlice = this.buffer.slice(0, i + 1);
        if (tempSlice.length >= 20) {
          const ma20Value = tempSlice.slice(-20).reduce((acc, c) => acc + c.close, 0) / 20;
          this.pushMa20(ma20Value);
        }
      }

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
   * Check if there's buying pressure
   * Returns true if current buyRatio > 0.6 (strong buying pressure)
   * Secondary check: if history exists, average shouldn't be too low (avoid spikes)
   * @returns {boolean}
   */
  isBuyingPressure() {
    // Current candle must have buyRatio > 0.6 (strong buying)
    if (this._currentBuyRatio <= 0.6) {
      return false;  // Not strong buying pressure
    }

    // If we have sufficient history, check it's not a lone spike
    // Average of last 3-5 candles should show reasonable buying
    if (this._buyRatioHistory.length >= 3) {
      const recentHistory = this._buyRatioHistory.slice(-3);
      const avgBuyRatio = recentHistory.reduce((a, b) => a + b, 0) / recentHistory.length;

      // If current is high but average is very low, it's a spike (reject)
      if (avgBuyRatio < 0.45) {
        return false;  // Spike detected, not sustained pressure
      }
    }

    return true;  // Strong buying pressure (current > 0.6)
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
   * Add MA99 value to momentum buffer
   * Maintains sliding window of 5 most recent MA99 values
   * @private
   */
  pushMa99(value) {
    this._ma99Buffer.push(value);
    if (this._ma99Buffer.length > this._ma99BufferSize) {
      this._ma99Buffer.shift();
    }
  }

  /**
   * Calculate MA99 momentum (slope + acceleration)
   * Requires 5 candles minimum for momentum calculation
   * @returns {Object|null} { slope: number, accel: number } or null if insufficient data
   */
  getMa99Momentum() {
    if (this._ma99Buffer.length < this._ma99BufferSize) {
      return null; // Warmup period - not enough data
    }

    // Index 0 = oldest, index 4 = newest
    const [m0, m1, m2, m3, m4] = this._ma99Buffer;

    // Slope: percentage change between current and 2 candles ago
    const slopeNow = (m4 - m2) / m2 * 100;

    // Previous slope: percentage change between 2 and 4 candles ago
    const slopePrev = (m2 - m0) / m0 * 100;

    // Acceleration: difference between current and previous slope
    const accel = slopeNow - slopePrev;

    return { slope: slopeNow, accel };
  }

  /**
   * Add MA20 value to momentum buffer
   * Maintains sliding window of 5 most recent MA20 values
   * @private
   */
  pushMa20(value) {
    this._ma20Buffer.push(value);
    if (this._ma20Buffer.length > this._ma20BufferSize) {
      this._ma20Buffer.shift();
    }
  }

  /**
   * Calculate MA20 momentum (slope + acceleration)
   * Requires 5 candles minimum for momentum calculation
   * @returns {Object|null} { slope: number, accel: number } or null if insufficient data
   */
  getMa20Momentum() {
    if (this._ma20Buffer.length < this._ma20BufferSize) {
      return null; // Warmup period - not enough data
    }

    // Index 0 = oldest, index 4 = newest
    const [m0, m1, m2, m3, m4] = this._ma20Buffer;

    // Slope: percentage change between current and 2 candles ago
    const slopeNow = (m4 - m2) / m2 * 100;

    // Previous slope: percentage change between 2 and 4 candles ago
    const slopePrev = (m2 - m0) / m0 * 100;

    // Acceleration: difference between current and previous slope
    const accel = slopeNow - slopePrev;

    return { slope: slopeNow, accel };
  }

  /**
   * Update sequential buy signal state machine (v1.3.0)
   * 4 sequential conditions for buy execution
   * Each condition depends on previous being true
   * Some conditions can revert to false if criteria no longer met
   * @private
   */
  _updateSelectionState() {
    const ma99 = this.ma99;
    const ma20 = this.ma20;

    // Update momentum buffers with latest values
    if (ma99 > 0) {
      this.pushMa99(ma99);
    }
    if (ma20 > 0) {
      this.pushMa20(ma20);
    }

    // Get current momentum values
    const ma99Mom = this.getMa99Momentum();
    const ma20Mom = this.getMa20Momentum();

    // ═════════════════════════════════════════════════════════════
    // CONDITION 1: MA99 Strong Uptrend Gate
    // ═════════════════════════════════════════════════════════════
    // Condition 1 acts as a GATE: TRUE only during strong uptrend
    // If TRUE (MA99 slope >= 0.02 AND accel >= 0) → strong uptrend, allows condition 2 to be evaluated
    // If FALSE (MA99 slope < 0.02 OR stable/downtrend) → blocks trading (no uptrend momentum)

    if (ma99Mom && ma99Mom.slope >= 0.02 && ma99Mom.accel >= 0) {
      // MA99 in strong uptrend = GATE OPENED (momentum is positive, allow evaluation)
      this._selectionState.cond1_ma99StrongUptrend = true;
    } else {
      // MA99 stable or downtrend = GATE CLOSED (no uptrend momentum, block trading)
      this._selectionState.cond1_ma99StrongUptrend = false;
    }

    // If condition 1 is FALSE (GATE closed), reset condition 2 and readyToBuy
    if (!this._selectionState.cond1_ma99StrongUptrend) {
      this._selectionState.cond2_candleBreakout = false;
      this._selectionState.readyToBuy = false;
      return;
    }

    // GATE is open (condition 1 is TRUE), proceed with condition 2

    // ═════════════════════════════════════════════════════════════
    // CONDITION 2: Candle breakout pattern + bullish confirmation
    // ═════════════════════════════════════════════════════════════
    // TRUE when: ((low < ma20 && high > bbUpper) || (low < bbLower && high > ma20)) AND (close > open)
    // Requires: breakout pattern + bullish candle (price action)
    const currentCandle = this.buffer[this.buffer.length - 1];
    const low = currentCandle ? currentCandle.low : 0;
    const high = currentCandle ? currentCandle.high : 0;
    const open = currentCandle ? currentCandle.open : 0;
    const close = currentCandle ? currentCandle.close : 0;
    const bbLower = this.bbLower;

    if (currentCandle && low > 0 && high > 0 && open > 0 && close > 0) {
      // Pattern 1: low < MA20 AND high > BBUpper
      const pattern1 = (low < ma20) && (high > this.bbUpper);

      // Pattern 2: low < BBLower AND high > MA20
      const pattern2 = (low < bbLower) && (high > ma20);

      const breakoutPattern = pattern1 || pattern2;
      const bullishCandle = close > open;
      this._selectionState.cond2_candleBreakout = breakoutPattern && bullishCandle;
    } else {
      this._selectionState.cond2_candleBreakout = false;
    }

    // ═════════════════════════════════════════════════════════════
    // FINAL: Ready to buy - STICKY with MA99 Uptrend Gate
    // Note: Condition 1 is a GATE - must be TRUE (MA99 strong uptrend) to proceed
    // Once readyToBuy becomes TRUE, it stays TRUE (sticky state)
    // UNLESS: Condition 1 closes (uptrend ends) → readyToBuy resets to FALSE
    // Logic: Cond1=TRUE AND Cond2=TRUE (both required)
    // ═════════════════════════════════════════════════════════════
    const shouldBeReady =
      this._selectionState.cond1_ma99StrongUptrend &&
      this._selectionState.cond2_candleBreakout;

    // GATE CLOSURE: If gate closes while readyToBuy is TRUE, reset it
    if (this._selectionState.readyToBuy && !this._selectionState.cond1_ma99StrongUptrend) {
      this._selectionState.readyToBuy = false;
      this._selectionState.readyToBuyTimestamp = null;
    }

    // Sticky logic: Once TRUE (and no circuit breaker), never becomes FALSE from conditions
    if (!this._selectionState.readyToBuy && shouldBeReady) {
      this._selectionState.readyToBuy = true;
      // Capture timestamp when readyToBuy becomes TRUE
      this._selectionState.readyToBuyTimestamp = Date.now();
    }
    // If already TRUE (and no circuit breaker), stays TRUE (ignore other condition changes)
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
   * Get MA99 momentum (slope and acceleration)
   * Returns null if insufficient data for momentum calculation
   */
  get ma99Momentum() {
    return this.getMa99Momentum();
  }

  /**
   * Get MA99 slope percentage
   * Returns null if insufficient data
   */
  get ma99Slope() {
    const momentum = this.getMa99Momentum();
    return momentum ? momentum.slope : null;
  }

  /**
   * Get MA99 acceleration
   * Returns null if insufficient data
   */
  get ma99Accel() {
    const momentum = this.getMa99Momentum();
    return momentum ? momentum.accel : null;
  }

  /**
   * Get MA20 momentum (slope and acceleration)
   * Returns null if insufficient data for momentum calculation
   */
  get ma20Momentum() {
    return this.getMa20Momentum();
  }

  /**
   * Get MA20 slope percentage
   * Returns null if insufficient data
   */
  get ma20Slope() {
    const momentum = this.getMa20Momentum();
    return momentum ? momentum.slope : null;
  }

  /**
   * Get MA20 acceleration
   * Returns null if insufficient data
   */
  get ma20Accel() {
    const momentum = this.getMa20Momentum();
    return momentum ? momentum.accel : null;
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
   * Get the timestamp when readyToBuy became TRUE
   */
  get readyToBuyTime() {
    return this._selectionState.readyToBuyTimestamp;
  }

  /**
   * Get minutes elapsed since readyToBuy became TRUE
   * Returns null if readyToBuy is not active
   */
  get readyToBuyMinutesElapsed() {
    if (!this._selectionState.readyToBuyTimestamp) {
      return null;
    }
    const elapsedMs = Date.now() - this._selectionState.readyToBuyTimestamp;
    return Math.floor(elapsedMs / 60000); // Convert to minutes
  }

  /**
   * Get formatted time string for when readyToBuy became TRUE
   * Format: "HH:MM:SS"
   */
  get readyToBuyTimeFormatted() {
    if (!this._selectionState.readyToBuyTimestamp) {
      return null;
    }
    const date = new Date(this._selectionState.readyToBuyTimestamp);
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    return `${hours}:${minutes}:${seconds}`;
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
   * CAN BUY: All 4 sequential conditions must be true (v1.3.0)
   */
  get canBuyUP() {
    return this._selectionState.readyToBuy;
  }

  /**
   * Get all condition evaluations (sequential state machine)
   */
  getConditions() {
    return {
      // v1.4.0-beta: Two sequential conditions (MA99 Uptrend Gate + Candle Breakout)
      cond1_ma99StrongUptrend: this._selectionState.cond1_ma99StrongUptrend,
      cond2_candleBreakout: this._selectionState.cond2_candleBreakout,
      readyToBuy: this._selectionState.readyToBuy,

      // Technical indicators (for reference)
      ma20: this.ma20,
      ma99: this.ma99,
      bbUpper: this.bbUpper,
      bbLower: this.bbLower,
      currentPrice: this.currentPrice,
      gainer1m: this._gainer1m,
      gainer5m: this._gainer5m,
      gainer15m: this._gainer15m,
      gainer30m: this._gainer30m,
      gainer1h: this._gainer1h,
      // MA99 Momentum
      ma99Slope: this.ma99Slope,
      ma99Accel: this.ma99Accel,
      // MA20 Momentum
      ma20Slope: this.ma20Slope,
      ma20Accel: this.ma20Accel,
      // Volume delta indicators
      buyRatio: this.buyRatio,
      avgBuyRatio: this.avgBuyRatio,
      isBuyingPressure: this.isBuyingPressure(),
      // Ready to buy timing
      readyToBuyTime: this.readyToBuyTimeFormatted,
      readyToBuyMinutesElapsed: this.readyToBuyMinutesElapsed,
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
