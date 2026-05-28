// ─────────────────────────────────────────────
// src/CandleObserver.js
// Monitors candles for a single active trading position
// Executes sell when target is reached
// ─────────────────────────────────────────────

const { EventEmitter } = require("events");

const FEE = 0.001; // 0.1% fee on both buy and sell

class CandleObserver extends EventEmitter {
  constructor(symbol, buyPrice, quantity) {
    super();
    this.symbol = symbol;

    // ──── Order Info ────
    this.buyPrice = buyPrice;
    this.quantity = quantity;
    this.buyTime = new Date().toISOString();

    // ──── Current Data ────
    this.currentPrice = 0;
    this.ma20 = 0;
    this.ma99 = 0;
    this.bbUpper = 0;
    this.bbLower = 0;

    // ──── P&L ────
    this.pnlPercent = 0;
    this.pnlValue = 0;
    this.timeInTrade = 0; // seconds

    // ──── Sell Target ────
    this.sellTarget = this.buyPrice * 1.005;
    this.shouldSell = false;

    console.log(
      `[CandleObserver] ${symbol} created - Buy: ${buyPrice.toFixed(8)} USDT, Qty: ${quantity.toFixed(8)} BTC, Target: ${this.sellTarget.toFixed(8)}`
    );
  }

  /**
   * Update with latest candle data
   */
  updateWithCandle(candle) {
    this.currentPrice = candle.close;
    this.ma20 = candle.ma20 || this.ma20;
    this.ma99 = candle.ma99 || this.ma99;
    this.bbUpper = candle.bbUpper || this.bbUpper;
    this.bbLower = candle.bbLower || this.bbLower;

    // Calculate current P&L
    const currentValue = this.quantity * this.currentPrice;
    const boughtValue = this.quantity * this.buyPrice;
    this.pnlValue = currentValue - boughtValue;
    this.pnlPercent = (this.pnlValue / boughtValue) * 100;

    // Calculate time in trade
    this.timeInTrade = Math.floor(
      (Date.now() - new Date(this.buyTime).getTime()) / 1000
    );

    // Check sell condition
    this.shouldSell = this.currentPrice >= this.sellTarget;
  }

  /**
   * Execute sell - returns order summary
   */
  executeSell() {
    const sellValue = this.quantity * this.currentPrice;
    const sellValueAfterFee = sellValue * (1 - FEE);
    const boughtValue = this.quantity * this.buyPrice;
    const profit = sellValueAfterFee - boughtValue;
    const profitPercent = (profit / boughtValue) * 100;

    const sellInfo = {
      symbol: this.symbol,
      buyPrice: this.buyPrice,
      sellPrice: this.currentPrice,
      quantity: this.quantity,
      buyValue: boughtValue,
      sellValue: sellValue,
      feeOnSell: sellValue * FEE,
      sellValueAfterFee: sellValueAfterFee,
      profit: profit,
      profitPercent: profitPercent,
      buyTime: this.buyTime,
      sellTime: new Date().toISOString(),
      timeInTrade: this.timeInTrade,
    };

    console.log(
      `[CandleObserver] SELL ${this.symbol} @ ${this.currentPrice.toFixed(8)} | Profit: ${profitPercent.toFixed(4)}%`
    );

    this.emit("sell", sellInfo);

    return sellInfo;
  }

  /**
   * Get current state
   */
  getState() {
    return {
      symbol: this.symbol,
      buyPrice: this.buyPrice,
      currentPrice: this.currentPrice,
      quantity: this.quantity,
      sellTarget: this.sellTarget,
      shouldSell: this.shouldSell,
      pnlPercent: this.pnlPercent,
      pnlValue: this.pnlValue,
      timeInTrade: this.timeInTrade,
      buyTime: this.buyTime,
      ma20: this.ma20,
      ma99: this.ma99,
      bbUpper: this.bbUpper,
      bbLower: this.bbLower,
    };
  }

  /**
   * Cleanup
   */
  destroy() {
    this.removeAllListeners();
  }
}

module.exports = CandleObserver;
