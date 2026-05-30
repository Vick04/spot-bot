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
    this._gainer1h = 0; // % change in last 1 hour
    this._initialized = false;
    this._loading = false;

    // State machine for sequential BUY UP conditions
    this._upConditionState = {
      step1_pisoMet: false,       // Piso: MA20 < MA99
      step2_zonaFuerteMet: false, // Zona Fuerte: MA20 > MA99 (after step1)
      step3_breakoutMet: false,   // Breakout Alcista: Price in range (after step2)
      step4_priceExceeded: false, // Invalidation: Price > MA99 × 1.015 (disqualifies purchase)
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
      this._updateUpConditionState();

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

    // Update UP condition state machine
    this._updateUpConditionState();
  }

  /**
   * Calculate 1-hour gainer percentage (exactly 1 hour)
   * Formula: ((close[latest] - close[1h ago]) / close[1h ago]) * 100
   * Uses index 39 for 1h ago (buffer[99] - 60min = buffer[39])
   * @private
   */
  _recalculateGainer() {
    if (this.buffer.length < 2) {
      this._gainer1h = 0;
      return;
    }

    const latestCandle = this.buffer[this.buffer.length - 1];

    // Use candle from exactly 1 hour ago (index 39 in 99-candle buffer)
    // This is precise: 99 - 60 = 39
    const oneHourAgoIndex = Math.min(39, this.buffer.length - 1);
    const oneHourAgoCandle = this.buffer[oneHourAgoIndex];

    if (!oneHourAgoCandle) {
      this._gainer1h = 0;
      return;
    }

    const change = (latestCandle.close - oneHourAgoCandle.close) / oneHourAgoCandle.close;
    this._gainer1h = change * 100;
  }

  /**
   * Update UP condition state machine
   * Implements sequential logic:
   * - Step 1 (Piso): MA20 < MA99
   * - Step 2 (Zona Fuerte): MA20 > MA99 (only after step1 was true)
   * - Step 3 (Breakout Alcista): Price in range (only after step2 is true)
   * - Step 4 (Invalidation): Price > MA99 × 1.015 (disqualifies purchase permanently)
   * All steps reset when DOWN condition is met
   * @private
   */
  _updateUpConditionState() {
    const ma20 = this.ma20;
    const ma99 = this.ma99;

    // Check if DOWN condition is met - if so, reset all UP states
    if (this.ma20BelowMA99 && this.priceBelowMA99Depressed) {
      this._upConditionState.step1_pisoMet = false;
      this._upConditionState.step2_zonaFuerteMet = false;
      this._upConditionState.step3_breakoutMet = false;
      this._upConditionState.step4_priceExceeded = false;
      return;
    }

    // Step 1: Piso - MA20 < MA99
    if (!this._upConditionState.step1_pisoMet && ma99 > 0 && ma20 < ma99) {
      this._upConditionState.step1_pisoMet = true;
    }

    // Step 2: Zona Fuerte - MA20 > MA99 (only if step1 was already met)
    if (this._upConditionState.step1_pisoMet && !this._upConditionState.step2_zonaFuerteMet &&
        ma99 > 0 && ma20 > ma99) {
      this._upConditionState.step2_zonaFuerteMet = true;
    }

    // Step 3: Breakout Alcista - Price in range (only if step2 is active)
    if (this._upConditionState.step2_zonaFuerteMet && !this._upConditionState.step3_breakoutMet &&
        this.priceAboveMA99Breakout) {
      this._upConditionState.step3_breakoutMet = true;
    }

    // Step 4: Invalidation - Price exceeded max threshold (disqualifies purchase)
    // Once triggered, stays true until DOWN signal resets it
    if (!this._upConditionState.step4_priceExceeded && ma99 > 0 &&
        this.currentPrice > (ma99 * 1.015)) {
      this._upConditionState.step4_priceExceeded = true;
    }
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
   */
  getIndicators() {
    return {
      ma20: this.ma20,
      ma99: this.ma99,
      bbUpper: this.bbUpper,
      bbLower: this.bbLower,
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
   * Price in breakout range (MA99 × 1.002 to MA99 × 1.010)
   * Breakout Alcista condition: Price between 0.2% and 1.0% above MA99
   */
  get priceAboveMA99Breakout() {
    if (this.ma99 === 0) return false;
    const lowerBound = this.ma99 * 1.002;
    const upperBound = this.ma99 * 1.010;
    return this.currentPrice > lowerBound && this.currentPrice < upperBound;
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
   * BUY condition UP: Sequential state machine
   * Step 1 (Piso): MA20 < MA99 must be met first
   * Step 2 (Zona Fuerte): MA20 > MA99 transitions from step 1
   * Step 3 (Breakout Alcista): Price in range (MA99 × 1.002 to 1.010) after step 2
   * Step 4 (Invalidation): Price > MA99 × 1.015 disqualifies the purchase permanently
   * Returns true when all three steps are sequentially completed AND price hasn't exceeded limit
   * All steps reset when DOWN condition is met
   */
  get canBuyUP() {
    return this._upConditionState.step3_breakoutMet && !this._upConditionState.step4_priceExceeded;
  }

  /**
   * BUY condition DOWN: Zona Débil + Precio Deprimido
   * Requires BOTH: MA20 < MA99 AND Price < (MA99 × 0.970)
   */
  get canBuyDOWN() {
    return this.ma20BelowMA99 && this.priceBelowMA99Depressed;
  }

  /**
   * Get all condition evaluations
   */
  getConditions() {
    return {
      // UP Condition breakdown (sequential state machine)
      // Step 1: Piso - MA20 < MA99
      upCondition1_Piso: this._upConditionState.step1_pisoMet,
      // Step 2: Zona Fuerte - MA20 > MA99 (after step 1)
      upCondition2_ZonaFuerte: this._upConditionState.step2_zonaFuerteMet,
      // Step 3: Breakout Alcista - Price in range (after step 2)
      upCondition3_BreakoutAlcista: this._upConditionState.step3_breakoutMet,
      // Step 4: Invalidation - Price exceeded max threshold (disqualifies purchase)
      upCondition4_PriceExceeded: this._upConditionState.step4_priceExceeded,
      canBuyUP: this.canBuyUP,

      // DOWN Condition breakdown
      // Zona Débil: MA20 < MA99
      downCondition1_ZonaDebil: this.ma20BelowMA99,
      // Precio Deprimido: Price < (MA99 × 0.970)
      downCondition2_PrecioDeprimido: this.priceBelowMA99Depressed,
      canBuyDOWN: this.canBuyDOWN,

      // Price vs MA20 (for reference)
      priceAboveMA20: this.priceAboveMA20,
      priceBelowMA20: this.priceBelowMA20,

      // MA20 vs MA99 (for reference)
      ma20AboveMA99: this.ma20AboveMA99,
      ma20BelowMA99: this.ma20BelowMA99,

      // Price vs Bollinger Bands (for reference)
      priceAboveBBUpper: this.priceAboveBBUpper,
      priceBelowBBLower: this.priceBelowBBLower,
      priceBetweenBB: this.priceBetweenBB,
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
