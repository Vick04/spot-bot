// ─────────────────────────────────────────────
// src/server.js
// SPOT-BOT API Server with GainersManager
// ─────────────────────────────────────────────

require("dotenv").config();

const express = require("express");
const cors = require("cors");
const http = require("http");
const WebSocket = require("ws");
const GainersManager = require("./GainersManager");
const BinanceWebSocket = require("./BinanceWebSocket");
const TradingManager = require("./TradingManager");
const config = require("./config");
const fs = require("fs");

// Clean debug log
const debugLog = fs.createWriteStream("debug.log", { flags: "a" });

const app = express();
const PORT = config.API_PORT;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static("public")); // Serve static files from public directory

// ── GainersManager & BinanceWebSocket Instances ────────────────────────────

const gainersManager = new GainersManager();
const binanceWS = new BinanceWebSocket();
let tradingManager = null; // Will be initialized after gainersManager

// ── WebSocket Setup ────────────────────────────────────────────────────────

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const wsClients = new Set();

wss.on("connection", (ws) => {
  const clientCount = wsClients.size + 1;
  console.log(`[WS] ✅ Client connected (${clientCount} total)`);
  wsClients.add(ws);

  // Send welcome message with current status
  ws.send(
    JSON.stringify({
      type: "welcome",
      message: "Connected to SPOT-BOT API",
      status: gainersManager.getStatus(),
    })
  );

  ws.on("close", () => {
    wsClients.delete(ws);
    console.log(`[WS] ❌ Client disconnected (${wsClients.size} remaining)`);
  });

  ws.on("error", (err) => {
    console.error(`[WS] Error:`, err.message);
  });

  ws.on("message", (data) => {
    try {
      const msg = JSON.parse(data);
      console.log(`[WS] Received:`, msg.type);

      // Handle different message types if needed
      if (msg.type === "ping") {
        ws.send(JSON.stringify({ type: "pong", timestamp: Date.now() }));
      }
    } catch (error) {
      console.error(`[WS] Message parse error:`, error.message);
    }
  });
});

function broadcastEvent(event) {
  const message = JSON.stringify(event);
  wsClients.forEach((ws) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(message);
    }
  });
}

// Listen to GainersManager events
gainersManager.on("initialized", (data) => {
  console.log(`[Server] GainersManager initialized: ${data.count} symbols`);
  broadcastEvent({
    type: "manager-status",
    status: gainersManager.getStatus(),
  });
});

// Listen for trading signals (BUYUP/BUYDOWN) - BUY orders executed
gainersManager.on("trading-signal", (signalData) => {
  console.log(`[Server] Trading signal detected: ${signalData.type} ${signalData.symbol}`);

  // Subscribe to 1-second candles for active order monitoring
  binanceWS.subscribe1s(signalData.symbol);

  // Get the active order observer for fee information
  const position = gainersManager.tradingState.activeCandleObserver;
  const signalWithFees = {
    ...signalData,
    feeOnBuy: position?.feeOnBuy || 0,
    investedAmount: position?.investedAmount || 0,
  };

  broadcastEvent({
    type: "trading-signal",
    signal: signalWithFees,
    tradingState: gainersManager.getTradingStatus(),
  });
});

// Listen for closed orders (SELL completed)
gainersManager.on("order-closed", (orderData) => {
  console.log(`[Server] Order closed: ${orderData.type} ${orderData.orderInfo.symbol}`);

  // Unsubscribe from 1-second candles - order complete
  binanceWS.unsubscribe1s(orderData.orderInfo.symbol);

  broadcastEvent({
    type: "order-closed",
    order: orderData.orderInfo,
    tradingState: orderData.tradingState,
  });
});

// Listen to BinanceWebSocket candle updates and update gainers
let candleCount = 0;
binanceWS.on("candle", (candle) => {
  candleCount++;
  debugLog.write(`[${new Date().toISOString()}] Candle #${candleCount}: ${candle.symbol} ${candle.close}\n`);

  if (candleCount % 50 === 0) {
    console.log(`[Server] Received ${candleCount} candles from Binance`);
  }

  gainersManager.updateCandle(candle.symbol, {
    openTime: candle.openTime,
    open: candle.open,
    high: candle.high,
    low: candle.low,
    close: candle.close,
    volume: candle.volume,
    closeTime: candle.closeTime,
    quoteAssetVolume: candle.quoteAssetVolume,
    takerBuyBaseAssetVolume: candle.takerBuyBaseAssetVolume,
  });

  // Broadcast order in progress updates (real-time position updates)
  if (gainersManager.tradingState.activeCandleObserver &&
      gainersManager.tradingState.activeCandleObserver.symbol === candle.symbol) {
    const position = gainersManager.tradingState.activeCandleObserver;
    const observer = gainersManager.observers.get(candle.symbol);

    if (observer && position) {
      const sellTarget = position.buyPrice * 1.005;
      const currentPrice = observer.currentPrice;
      const pnlValue = (currentPrice - position.buyPrice) * position.quantity;
      const pnlPercent = ((currentPrice - position.buyPrice) / position.buyPrice) * 100;
      const timeInTrade = Math.floor((Date.now() - new Date(position.buyTime).getTime()) / 1000 / 60);
      const progressPercent = ((currentPrice - position.buyPrice) / (sellTarget - position.buyPrice)) * 100;

      broadcastEvent({
        type: "order-progress",
        position: {
          symbol: position.symbol,
          buyPrice: position.buyPrice,
          currentPrice: currentPrice,
          quantity: position.quantity,
          sellTarget: sellTarget,
          pnlValue: pnlValue,
          pnlPercent: pnlPercent,
          timeInTrade: timeInTrade,
          progressPercent: Math.min(Math.max(progressPercent, 0), 100),
          priceGapToTarget: sellTarget - currentPrice,
          buyTime: position.buyTime,
        },
        timestamp: new Date().toISOString(),
      });
    }
  }

  // Broadcast updated top gainers and trading state to all WebSocket clients
  if (candleCount % 10 === 0) {
    const gainersToSend = gainersManager.getTop1hGainers(30).map(gainer => {
      const observer = gainersManager.observers.get(gainer.symbol);

      // Get buffer data for charts
      const bufferData = observer?.buffer?.map(candle => ({
        time: Math.floor(candle.openTime / 1000),
        open: parseFloat(candle.open),
        high: parseFloat(candle.high),
        low: parseFloat(candle.low),
        close: parseFloat(candle.close),
      })) || [];

      return {
        ...gainer,
        // Technical indicators
        ma20: observer?.ma20 || 0,
        ma99: observer?.ma99 || 0,
        bbUpper: observer?.bbUpper || 0,
        bbLower: observer?.bbLower || 0,
        // Multi-timeframe gainer percentages
        gainer5m: observer?.gainer5m || 0,
        gainer15m: observer?.gainer15m || 0,
        gainer30m: observer?.gainer30m || 0,
        // Trading conditions
        conditions: observer?.getConditions() || {},
        // Buffer data for charts
        bufferData: bufferData,
      };
    });
    console.log(`[Server] Broadcasting gainers update #${candleCount} - Top gainer: ${gainersToSend[0]?.symbol} ${gainersToSend[0]?.gainer1h.toFixed(2)}%`);
    broadcastEvent({
      type: "gainers-update",
      gainers: gainersToSend,
      timestamp: new Date().toISOString(),
    });

    // Broadcast trading state (balance, active position, stats)
    broadcastEvent({
      type: "trading-status",
      data: gainersManager.getTradingStatus(),
    });
  }

  // Pass candle to TradingManager for trading execution
  if (tradingManager) {
    const observer = gainersManager.observers.get(candle.symbol);
    if (observer) {
      const indicators = observer.getIndicators();
      const candleWithIndicators = {
        openTime: candle.openTime,
        open: candle.open,
        high: candle.high,
        low: candle.low,
        close: candle.close,
        volume: candle.volume,
        closeTime: candle.closeTime,
        quoteAssetVolume: candle.quoteAssetVolume,
        ...indicators,
        gainer1h: observer.gainer1h,
      };
      tradingManager.processCandle(candle.symbol, candleWithIndicators);
    }
  }
});

// Listen to BinanceWebSocket 1-second candles for active order monitoring
binanceWS.on("candle1s", (candle) => {
  // Only process if there's an active order for this symbol
  if (gainersManager.tradingState.activeCandleObserver &&
      gainersManager.tradingState.activeCandleObserver.symbol === candle.symbol) {
    // Pass 1s candle to GainersManager for sell condition checking
    gainersManager.monitorActivePosition(candle.symbol, {
      close: candle.close,
      openTime: candle.openTime,
      open: candle.open,
      high: candle.high,
      low: candle.low,
    });

    // Broadcast real-time position update with 1s price data
    const position = gainersManager.tradingState.activeCandleObserver;
    const pnlInfo = position.getPnLInfo();

    broadcastEvent({
      type: "order-progress",
      position: {
        symbol: position.symbol,
        buyPrice: position.buyPrice,
        currentPrice: position.currentPrice,
        quantity: position.quantity,
        sellTarget: position.sellTarget,
        pnlValue: pnlInfo.pnlValue,
        pnlPercent: pnlInfo.pnlPercent,
        timeInTrade: pnlInfo.timeInTrade,
        progressPercent: Math.min(Math.max(pnlInfo.progressPercent, 0), 100),
        priceGapToTarget: pnlInfo.gapToTarget,
        buyTime: position.buyTime,
        // Fee information
        feeOnBuy: position.feeOnBuy,
        investedAmount: position.investedAmount,
      },
      timestamp: new Date().toISOString(),
    });
  }
});

binanceWS.on("error", (error) => {
  debugLog.write(`[${new Date().toISOString()}] BinanceWS Error: ${error.message}\n`);
  console.error("[Server] BinanceWS error:", error.message);
});

// ── REST API Endpoints ─────────────────────────────────────────────────────

// Health check
app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    manager: gainersManager.getStatus(),
  });
});

// Get manager status
app.get("/api/status", (req, res) => {
  res.json(gainersManager.getStatus());
});

// Get top 1-hour gainers (with observer indicators and conditions)
app.get("/api/gainers", (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 10, 100);
  const gainers = gainersManager.getTop1hGainers(limit).map(gainer => {
    const observer = gainersManager.observers.get(gainer.symbol);
    return {
      ...gainer,
      // Technical indicators
      ma20: observer?.ma20 || 0,
      ma99: observer?.ma99 || 0,
      bbUpper: observer?.bbUpper || 0,
      bbLower: observer?.bbLower || 0,
      // Multi-timeframe gainer percentages
      gainer5m: observer?.gainer5m || 0,
      gainer15m: observer?.gainer15m || 0,
      gainer30m: observer?.gainer30m || 0,
      // Trading conditions
      conditions: observer?.getConditions() || {},
    };
  });

  res.json({
    count: gainers.length,
    gainers,
  });
});

// Get all gainers
app.get("/api/gainers/all", (req, res) => {
  const gainers = gainersManager.getAllGainers();

  res.json({
    count: gainers.length,
    gainers,
  });
});

// Get observer state (debugging)
app.get("/api/debug/observer/:symbol", (req, res) => {
  const { symbol } = req.params;
  const state = gainersManager.getObserverState(symbol);

  if (!state) {
    return res.status(404).json({ error: `Observer not found for ${symbol}` });
  }

  res.json(state);
});

// Get all observers states (debugging)
app.get("/api/debug/observers", (req, res) => {
  res.json(gainersManager.getAllStates());
});

// Get detailed candle data for a symbol (debugging)
app.get("/api/debug/candles/:symbol", (req, res) => {
  const { symbol } = req.params;
  const observer = gainersManager.observers.get(symbol);

  if (!observer) {
    return res.status(404).json({ error: `Observer not found for ${symbol}` });
  }

  const candles = observer.buffer.map((candle, index) => ({
    index,
    time: new Date(candle.openTime).toISOString(),
    open: parseFloat(candle.open.toFixed(8)),
    close: parseFloat(candle.close.toFixed(8)),
    high: parseFloat(candle.high.toFixed(8)),
    low: parseFloat(candle.low.toFixed(8)),
    change: parseFloat(((candle.close - candle.open) / candle.open * 100).toFixed(2)) + "%",
  }));

  const oldest = candles[0];
  const latest = candles[candles.length - 1];
  const priceChange = ((latest.close - oldest.close) / oldest.close * 100).toFixed(2);

  res.json({
    symbol,
    totalCandles: candles.length,
    timeSpan: `${oldest.time} to ${latest.time}`,
    oldestPrice: oldest.close,
    latestPrice: latest.close,
    priceChange: priceChange + "%",
    candles: candles,
  });
});

// Get TradingManager status
app.get("/api/trading/status", (req, res) => {
  if (!tradingManager) {
    return res.status(503).json({ error: "TradingManager not initialized yet" });
  }

  res.json(tradingManager.getStatus());
});

// Get active CandleObserver (current position)
app.get("/api/trading/position", (req, res) => {
  if (!tradingManager) {
    return res.status(503).json({ error: "TradingManager not initialized yet" });
  }

  const activeObserver = tradingManager.getActiveObserver();
  res.json(activeObserver ? activeObserver.getState() : null);
});

// Get trading state from GainersManager (balance, stats)
app.get("/api/trading/state", (req, res) => {
  res.json(gainersManager.getTradingState());
});

// Get detailed trading status (with additional info)
app.get("/api/trading/state/status", (req, res) => {
  res.json(gainersManager.getTradingStatus());
});

// Manual SELL order - Close active position immediately at current price
app.post("/api/sell-manual", (req, res) => {
  const { symbol, currentPrice, quantity } = req.body;

  console.log("[Server] Manual SELL request:", { symbol, currentPrice, quantity });

  // Validate there's an active position
  const activePosition = gainersManager.tradingState.activeCandleObserver;
  if (!activePosition) {
    console.warn("[Server] Manual SELL failed: No active position");
    return res.status(400).json({
      error: "No active position to sell. Use the symbol link to check Binance.",
      status: "error",
      activePosition: null
    });
  }

  console.log("[Server] Active position found:", { symbol: activePosition.symbol, buyPrice: activePosition.buyPrice });

  // Verify the symbol matches
  if (activePosition.symbol !== symbol) {
    console.warn(`[Server] Manual SELL failed: Symbol mismatch. Expected ${activePosition.symbol}, got ${symbol}`);
    return res.status(400).json({
      error: `Symbol mismatch. Active position is ${activePosition.symbol}, requested ${symbol}`,
      status: "error",
      activeSymbol: activePosition.symbol,
      requestedSymbol: symbol
    });
  }

  try {
    console.log(`[Server] Manual SELL order received for ${symbol} at $${currentPrice.toFixed(8)}`);

    // Execute the sell order using the current price provided by the client
    const sellResult = activePosition.executeSellManual(currentPrice);

    // Update balance in trading state
    gainersManager.tradingState.balance = sellResult.sellValueAfterFee;

    // Update stats
    gainersManager.tradingState.stats.totalProfit += sellResult.profit;
    gainersManager.tradingState.stats.totalProfitPercent += sellResult.profitPercent;
    gainersManager.tradingState.stats.totalFees += sellResult.feeOnSell;

    if (sellResult.profit > 0) {
      gainersManager.tradingState.stats.winTrades++;
    } else if (sellResult.profit < 0) {
      gainersManager.tradingState.stats.lossTrades++;
    }

    if (gainersManager.tradingState.stats.totalTrades > 0) {
      gainersManager.tradingState.stats.avgProfitPercent =
        gainersManager.tradingState.stats.totalProfitPercent / gainersManager.tradingState.stats.totalTrades;
    }

    // Record sell order
    const sellOrder = {
      type: "SELL",
      timestamp: new Date().toISOString(),
      symbol: sellResult.symbol,
      sellPrice: sellResult.sellPrice,
      quantity: sellResult.quantity,
      profit: sellResult.profit,
      profitPercent: sellResult.profitPercent,
      feeOnSell: sellResult.feeOnSell,
      status: "closed",
      manualSell: true, // Flag this as a manual sell
    };

    gainersManager.tradingState.completedOrders.push(sellOrder);

    // Clear active position
    gainersManager.tradingState.activeCandleObserver = null;

    // Unsubscribe from 1-second candles
    binanceWS.unsubscribe1s(symbol);

    console.log(`[Server] ✅ Manual SELL completed: ${symbol} @ $${sellResult.sellPrice.toFixed(8)} | Profit: ${sellResult.profitPercent.toFixed(4)}% | New Balance: $${gainersManager.tradingState.balance.toFixed(2)}`);

    // Broadcast order closed event
    broadcastEvent({
      type: "order-closed",
      order: sellOrder,
      orderInfo: sellResult,
      tradingState: gainersManager.getTradingStatus(),
    });

    res.json({
      status: "success",
      message: "Manual sell order executed",
      orderInfo: sellResult,
      newBalance: gainersManager.tradingState.balance,
      tradingStats: gainersManager.tradingState.stats,
    });
  } catch (error) {
    console.error(`[Server] Manual SELL failed:`, error.message);
    res.status(500).json({
      error: error.message,
      status: "error"
    });
  }
});

// ── Error Handler ──────────────────────────────────────────────────────────

app.use((err, req, res, next) => {
  console.error("[API] Error:", err.message);
  res.status(500).json({ error: err.message });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: "Not found" });
});

// ── Server Start ───────────────────────────────────────────────────────────

async function start() {
  try {
    console.log(`
╔════════════════════════════════════════════╗
║         SPOT-BOT API SERVER                ║
║                                            ║
║  HTTP:  http://localhost:${PORT}           ║
║  WebSocket: ws://localhost:${PORT}         ║
║                                            ║
║  Endpoints:                                ║
║    GET  /api/health            Health      ║
║    GET  /api/status            Status      ║
║    GET  /api/gainers           Top 10      ║
║    GET  /api/gainers/all       All gainers ║
║                                            ║
║  Trading:                                  ║
║    GET  /api/trading/status    Trading     ║
║    GET  /api/trading/observers All orders  ║
║    GET  /api/trading/observer  Order state ║
║                                            ║
║  Debug:                                    ║
║    GET  /api/debug/observers   All state   ║
║    GET  /api/debug/observer/:s Sym state   ║
║                                            ║
╚════════════════════════════════════════════╝
    `);

    // Initialize GainersManager with auto-detect of top symbols
    // This will download the last 60 klines for each symbol
    console.log("[Server] Initializing GainersManager...");
    const symbolsLimit = config.GAINERS_SYMBOLS_LIMIT || 500; // 0 or 500+ = all symbols
    const minVolume = config.GAINERS_MIN_VOLUME;
    console.log(
      `[Server] Config: Symbols limit: ${symbolsLimit === 500 ? "All" : symbolsLimit}, Min volume: $${minVolume.toLocaleString()}`
    );
    await gainersManager.initializeAuto(symbolsLimit, minVolume);

    console.log(
      `[Server] ✅ GainersManager ready. Tracking ${gainersManager.totalSymbols} symbols`
    );

    // Initialize TradingManager
    console.log("[Server] Initializing TradingManager...");
    tradingManager = new TradingManager(gainersManager, gainersManager.observers);

    // Listen to TradingManager events for WebSocket broadcasting

    // Real-time position updates
    tradingManager.on("position-update", (data) => {
      broadcastEvent({
        type: "position-update",
        data,
      });
    });

    tradingManager.on("order-buy", (data) => {
      console.log(
        `[Server] BUY order: ${data.symbol} @ ${data.buyPrice.toFixed(8)} USDT | Qty: ${data.quantity.toFixed(8)} BTC`
      );
      broadcastEvent({
        type: "trading-order",
        action: "buy",
        data,
        timestamp: new Date().toISOString(),
      });
    });

    tradingManager.on("order-sell", (data) => {
      console.log(
        `[Server] SELL order: ${data.symbol} @ ${data.sellPrice.toFixed(8)} USDT | Profit: ${data.profit.toFixed(2)} USDT (${data.profitPercent.toFixed(4)}%)`
      );
      broadcastEvent({
        type: "trading-order",
        action: "sell",
        data,
        timestamp: new Date().toISOString(),
      });
    });

    console.log("[Server] ✅ TradingManager initialized");

    // Connect to Binance WebSocket for real-time candle updates
    console.log("[Server] Connecting to Binance WebSocket...");
    const trackedSymbols = Array.from(gainersManager.observers.keys());
    try {
      await binanceWS.connect(trackedSymbols);
      console.log(`[Server] ✅ Binance WebSocket connected. Subscribed to ${trackedSymbols.length} symbols`);
    } catch (error) {
      console.error("[Server] Failed to connect to Binance WebSocket:", error.message);
      console.log("[Server] ⚠️  Continuing without real-time updates");
    }

    // Start HTTP server
    server.listen(PORT, () => {
      console.log(`[Server] Listening on port ${PORT}`);
    });
  } catch (error) {
    console.error("[Server] Failed to start:", error.message);
    process.exit(1);
  }
}

// Graceful shutdown
process.on("SIGINT", () => {
  console.log("\n[Server] Shutting down...");
  wsClients.forEach((ws) => ws.close());
  binanceWS.close();
  if (tradingManager) {
    tradingManager.shutdown();
  }
  server.close(() => {
    console.log("[Server] Closed");
    process.exit(0);
  });
});

// Start server
start();

module.exports = { app, server, broadcastEvent, gainersManager };
