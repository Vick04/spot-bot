// ─────────────────────────────────────────────
// src/TradingManager.js
// Manages active trading: balance, orders, and execution
// ─────────────────────────────────────────────

const { EventEmitter } = require("events");
const CandleObserver = require("./CandleObserver");
const config = require("./config");

const INITIAL_BALANCE = 10000; // USDT
const FEE = 0.001; // 0.1% fee

class TradingManager extends EventEmitter {
  constructor(gainersManager, cryptoObserverMap) {
    super();
    this.gainersManager = gainersManager;
    this.cryptoObserverMap = cryptoObserverMap;

    // ──── Balance and Trading ────
    this.balance = INITIAL_BALANCE;
    this.activeCandleObserver = null; // Current open order
    this.completedOrders = []; // History of completed trades

    // ──── Tracking ────
    this.stats = {
      totalTrades: 0,
      totalProfit: 0,
      totalProfitPercent: 0,
      winTrades: 0,
      lossTrades: 0,
      totalFees: 0,
    };

    console.log("[TradingManager] Initialized with balance: $" + INITIAL_BALANCE);
  }

  /**
   * Process new candle and check for trading signals
   */
  processCandle(symbol, candle) {
    // Update active order if exists
    if (this.activeCandleObserver && this.activeCandleObserver.symbol === symbol) {
      this.activeCandleObserver.updateWithCandle(candle);

      // Emit real-time update
      this.emit("position-update", {
        symbol: this.activeCandleObserver.symbol,
        state: this.activeCandleObserver.getState(),
        timestamp: new Date().toISOString(),
      });

      // Check sell condition
      if (this.activeCandleObserver.shouldSell) {
        this._executeSell();
      }
    }

    // Look for buy signals if no active order
    if (!this.activeCandleObserver) {
      const observer = this.cryptoObserverMap.get(symbol);
      if (observer) {
        if (observer.canBuyDOWN || observer.canBuyUP) {
          this._selectAndBuy(symbol, observer);
        }
      }
    }
  }

  /**
   * Select a symbol and execute buy
   */
  _selectAndBuy(symbol, observer) {
    if (this.balance <= 0) {
      console.log("[TradingManager] Insufficient balance for trading");
      return;
    }

    // Calculate quantity: (balance / price) * (1 - fee)
    const pricePerUnit = observer.currentPrice;
    const quantityBeforeFee = this.balance / pricePerUnit;
    const quantityAfterFee = quantityBeforeFee * (1 - FEE);

    if (quantityAfterFee <= 0) {
      console.log("[TradingManager] Quantity after fee is zero");
      return;
    }

    // Create new CandleObserver
    this.activeCandleObserver = new CandleObserver(
      symbol,
      pricePerUnit,
      quantityAfterFee
    );

    // Listen for sell event
    this.activeCandleObserver.on("sell", (sellInfo) => {
      this._handleSellEvent(sellInfo);
    });

    // Update balance (subtract used balance)
    const usedBalance = this.balance;
    this.balance = 0;

    // Emit buy signal
    const buyInfo = {
      symbol: symbol,
      buyPrice: pricePerUnit,
      quantity: quantityAfterFee,
      usedBalance: usedBalance,
      feeOnBuy: quantityBeforeFee - quantityAfterFee,
      timestamp: new Date().toISOString(),
    };

    console.log(
      `[TradingManager] BUY ${symbol} @ ${pricePerUnit.toFixed(8)} USDT | Qty: ${quantityAfterFee.toFixed(8)} BTC | Fee: ${(
        quantityBeforeFee - quantityAfterFee
      ).toFixed(8)} BTC`
    );

    this.emit("order-buy", buyInfo);
  }

  /**
   * Execute sell (when target reached)
   */
  _executeSell() {
    if (!this.activeCandleObserver) return;

    const sellInfo = this.activeCandleObserver.executeSell();
    this._handleSellEvent(sellInfo);
  }

  /**
   * Handle completed sell order
   */
  _handleSellEvent(sellInfo) {
    // Update balance with profit
    this.balance = sellInfo.sellValueAfterFee;

    // Update stats
    this.stats.totalTrades++;
    this.stats.totalProfit += sellInfo.profit;
    this.stats.totalProfitPercent += sellInfo.profitPercent;
    this.stats.totalFees += sellInfo.feeOnSell;

    if (sellInfo.profit > 0) {
      this.stats.winTrades++;
    } else if (sellInfo.profit < 0) {
      this.stats.lossTrades++;
    }

    // Save to history
    this.completedOrders.push({
      ...sellInfo,
      orderIndex: this.completedOrders.length + 1,
    });

    // Cleanup
    if (this.activeCandleObserver) {
      this.activeCandleObserver.destroy();
      this.activeCandleObserver = null;
    }

    console.log(
      `[TradingManager] ✅ ORDER COMPLETED - Profit: $${sellInfo.profit.toFixed(2)} (${sellInfo.profitPercent.toFixed(4)}%) | New Balance: $${this.balance.toFixed(2)}`
    );

    // Emit sell signal
    this.emit("order-sell", sellInfo);
  }

  /**
   * Get current trading status
   */
  getStatus() {
    return {
      balance: this.balance,
      activeCandleObserver: this.activeCandleObserver
        ? this.activeCandleObserver.getState()
        : null,
      completedOrders: this.completedOrders,
      stats: {
        ...this.stats,
        avgProfitPercent:
          this.stats.totalTrades > 0
            ? this.stats.totalProfitPercent / this.stats.totalTrades
            : 0,
      },
      lastUpdate: new Date().toISOString(),
    };
  }

  /**
   * Get active observer (for dashboard)
   */
  getActiveObserver() {
    return this.activeCandleObserver;
  }

  /**
   * Shutdown
   */
  shutdown() {
    console.log("[TradingManager] Shutting down");
    if (this.activeCandleObserver) {
      this.activeCandleObserver.destroy();
    }
    this.removeAllListeners();
  }
}

module.exports = TradingManager;
