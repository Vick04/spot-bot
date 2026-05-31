// ─────────────────────────────────────────────
// src/OrderObserver.js
// Lightweight observer for active trading positions
// Monitors 1-second candles and evaluates sell conditions only
// No buffer, no technical indicators, just price tracking
// ─────────────────────────────────────────────

class OrderObserver {
  constructor(symbol, buyPrice, quantity, feeOnBuy = 0, investedAmount = 0) {
    this.symbol = symbol;
    this.buyPrice = buyPrice;
    this.quantity = quantity;
    this.investedAmount = investedAmount; // USDT invested before fee
    this.feeOnBuy = feeOnBuy; // Fee applied during buy
    this.currentPrice = buyPrice; // Start with buy price
    this.lastUpdateTime = Date.now();
    this.buyTime = new Date().toISOString();

    // Sell target: 0.5% profit
    this.sellTarget = buyPrice * 1.005;
  }

  /**
   * Update with a new 1-second candle
   * Only tracks the close price - no buffer needed
   *
   * @param {Object} candle - Candle data with close price
   */
  updateWithCandle(candle) {
    this.currentPrice = candle.close;
    this.lastUpdateTime = Date.now();
  }

  /**
   * Check if sell condition has been met
   * Returns true when currentPrice >= sellTarget
   *
   * @returns {boolean} Whether sell target has been reached
   */
  checkSellCondition() {
    return this.currentPrice >= this.sellTarget;
  }

  /**
   * Get current P&L information
   * Useful for real-time UI updates
   *
   * @returns {Object} { pnlValue, pnlPercent, timeInTrade }
   */
  getPnLInfo() {
    const pnlValue = (this.currentPrice - this.buyPrice) * this.quantity;
    const pnlPercent = ((this.currentPrice - this.buyPrice) / this.buyPrice) * 100;
    const timeInTrade = Math.floor((Date.now() - new Date(this.buyTime).getTime()) / 1000 / 60); // minutes

    return {
      pnlValue,
      pnlPercent,
      timeInTrade,
      gapToTarget: this.sellTarget - this.currentPrice,
      progressPercent: ((this.currentPrice - this.buyPrice) / (this.sellTarget - this.buyPrice)) * 100,
    };
  }

  /**
   * Execute sell order and return profit summary
   * Called when sell condition is met
   * Applies 0.1% fee on USDT received
   *
   * @returns {Object} Sell order summary with complete fee breakdown
   */
  executeSell() {
    const FEE = 0.001; // 0.1% fee

    // Sell calculation
    const sellValue = this.quantity * this.currentPrice;
    const feeOnSell = sellValue * FEE;
    const sellValueAfterFee = sellValue - feeOnSell;

    // Profit calculation
    // boughtValue = quantity * buyPrice (the actual USDT spent before buy fee)
    const boughtValue = this.quantity * this.buyPrice;
    const totalProfit = sellValueAfterFee - this.investedAmount;
    const profitPercent = (totalProfit / this.investedAmount) * 100;

    const sellInfo = {
      // Trade info
      symbol: this.symbol,
      buyTime: this.buyTime,
      sellTime: new Date().toISOString(),
      timeInTrade: Math.floor((Date.now() - new Date(this.buyTime).getTime()) / 1000 / 60),

      // Buy info
      buyPrice: this.buyPrice,
      quantity: this.quantity,
      investedUSDT: this.investedAmount,
      feeOnBuy: this.feeOnBuy,

      // Sell info
      sellPrice: this.currentPrice,
      sellValue: sellValue,
      feeOnSell: feeOnSell,
      sellValueAfterFee: sellValueAfterFee,

      // Profit info
      totalFees: this.feeOnBuy + feeOnSell,
      profit: totalProfit,
      profitPercent: profitPercent,
      newBalance: sellValueAfterFee,
    };

    return sellInfo;
  }

  /**
   * Get complete state for debugging
   */
  getState() {
    return {
      symbol: this.symbol,
      buyPrice: this.buyPrice,
      currentPrice: this.currentPrice,
      quantity: this.quantity,
      sellTarget: this.sellTarget,
      buyTime: this.buyTime,
      lastUpdate: new Date(this.lastUpdateTime).toISOString(),
      ...this.getPnLInfo(),
    };
  }
}

module.exports = OrderObserver;
