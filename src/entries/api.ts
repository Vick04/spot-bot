// ─────────────────────────────────────────────
// src/entries/api.ts
// Unified API server entry point
// REST API + WebSocket server for live trading
// Integrated with TradingManager
// Run with: npm run api (or npm run live:api which includes this)
// ─────────────────────────────────────────────

import "dotenv/config";
import express from "express";
import cors from "cors";
import http from "http";
import WebSocket from "ws";
import { TradingManager } from "../core/manager";
import { BinanceWebSocketProvider } from "../data/sources/live";
import { startSession, endSession, liveExecuteBuy, liveExecuteSell } from "../execution/executor";
import { processCandles } from "../processors/candleProcessor";
import { prisma } from "../db/prismaClient";
import { INITIAL_BALANCE_USDT } from "../config/constants";
import { fmtN } from "../utils/formatters";

const app = express();
const PORT = process.env.API_PORT ?? 3131;

app.use(cors());
app.use(express.json());

// ── State ──────────────────────────────────────────────────────────────────

let manager: TradingManager | null = null;
let provider: BinanceWebSocketProvider | null = null;
const wsClients = new Set<WebSocket>();

// ── Helpers ────────────────────────────────────────────────────────────────

async function initializeManager(): Promise<{ manager: TradingManager; provider: BinanceWebSocketProvider }> {
  if (manager && provider) {
    return { manager, provider };
  }

  // Load configuration from database
  const config = await loadConfigFromDatabase();
  console.log("[API] Config loaded:", config);

  // Load watchlist from database
  const watchlist = await loadWatchlist();
  if (watchlist.length === 0) {
    console.warn("[API] Watchlist is empty — populate the watchlist table to start trading");
  }

  const symbols = watchlist.map((w) => w.symbol);
  console.log("[API] Symbols:", symbols.join(", "));

  // Initialize trading manager
  const newManager = new TradingManager(symbols);

  // Build symbol params from watchlist
  const symbolParamsMap: Record<string, any> = {};
  for (const watch of watchlist) {
    symbolParamsMap[watch.symbol] = watch.params || {};
  }

  newManager.initialize(symbols, {
    upMaxStreak: config.UP_MAX_STREAK,
    dailyMaxTrades: config.DAILY_MAX_TRADES,
    dailyMaxPnlPct: config.DAILY_MAX_PNL_PCT,
    feeRate: config.FEE_RATE,
    initialBalanceUsdt: config.INITIAL_BALANCE_USDT,
    symbolParams: symbolParamsMap,
  });

  // Start session
  const { sessionId, wallet, openPosition } = await startSession(config.FEE_RATE);
  newManager.setSession(sessionId, wallet);

  if (openPosition) {
    console.warn(
      `[API] WARNING: recovered orphan position ` +
      `${openPosition.symbol} @ $${openPosition.buyPrice.toFixed(2)}`
    );
  }

  // Initialize data provider
  const newProvider = new BinanceWebSocketProvider(symbols);

  // Load warmup candles for each symbol
  console.log("[API] Loading warmup candles...");
  for (const symbol of symbols) {
    try {
      const rawCandles = await newProvider.loadWarmupCandles(symbol);
      const processedCandles = processCandles(rawCandles);
      await newManager.warmupObserver(symbol, processedCandles);
    } catch (e) {
      console.error(`[API] Failed to warmup ${symbol}:`, (e as Error).message);
    }
  }

  // Connect data provider to manager
  newProvider.onCandle(async (symbol, candle) => {
    try {
      await newManager.onCandleClose(symbol, candle);
    } catch (e) {
      console.error(`[API] Error processing candle:`, (e as Error).message);
    }
  });

  // Listen to manager events
  newManager.on("price", (event: any) => {
    broadcastEvent({ type: "price", symbol: event.symbol, price: event.price });
  });

  newManager.on("buy", (event: any) => {
    broadcastEvent({
      type: "trade",
      action: "buy",
      symbol: event.symbol,
      price: event.price,
      timestamp: event.timestamp,
    });
  });

  newManager.on("sell", (event: any) => {
    broadcastEvent({
      type: "trade",
      action: "sell",
      symbol: event.symbol,
      price: event.price,
      pnl: event.pnl,
      pnlPct: event.pnlPct,
      timestamp: event.timestamp,
    });
  });

  newManager.on("config", (event: any) => {
    broadcastEvent({ type: "config", config: event.config });
  });

  newManager.on("error", (event: any) => {
    console.error(`[API] Manager error:`, event.error);
    broadcastEvent({ type: "error", error: event.error });
  });

  // Start manager and provider
  console.log("[API] Starting manager and provider...");
  newManager.start();

  try {
    await newProvider.start();
  } catch (e) {
    console.error("[API] Provider failed to start:", (e as Error).message);
    newManager.stop();
    throw e;
  }

  manager = newManager;
  provider = newProvider;

  console.log("[API] ✅ Manager and provider started");

  return { manager: newManager, provider: newProvider };
}

async function loadConfigFromDatabase() {
  try {
    const rows = await prisma.botConfig.findMany();
    const map: Record<string, string> = {};
    for (const r of rows) map[r.key] = r.value;

    return {
      UP_MAX_STREAK: Number(map["UP_MAX_STREAK"] ?? 1),
      DAILY_MAX_TRADES: Number(map["DAILY_MAX_TRADES"] ?? 2),
      DAILY_MAX_PNL_PCT: Number(map["DAILY_MAX_PNL_PCT"] ?? 10),
      FEE_RATE: Number(map["FEE_RATE"] ?? 0.00075),
      INITIAL_BALANCE_USDT: Number(map["INITIAL_BALANCE_USDT"] ?? INITIAL_BALANCE_USDT),
    };
  } catch (e) {
    console.error("[API] Failed to load config from DB:", (e as Error).message);
    return {
      UP_MAX_STREAK: 1,
      DAILY_MAX_TRADES: 2,
      DAILY_MAX_PNL_PCT: 10,
      FEE_RATE: 0.00075,
      INITIAL_BALANCE_USDT: INITIAL_BALANCE_USDT,
    };
  }
}

async function loadWatchlist() {
  try {
    return await prisma.watchlist.findMany({ where: { active: true } });
  } catch (e) {
    console.error("[API] Failed to load watchlist:", (e as Error).message);
    return [];
  }
}

function broadcastEvent(message: any): void {
  const data = JSON.stringify(message);
  wsClients.forEach((ws) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(data);
    }
  });
}

// ── REST API Endpoints ─────────────────────────────────────────────────────

// GET /api/watchlist — List of active symbols
app.get("/api/watchlist", async (_req, res) => {
  try {
    let rows;
    try {
      rows = await prisma.watchlist.findMany({ where: { active: true } });
      console.log(`[API] GET /watchlist: loaded ${rows.length} symbols`);
    } catch (e) {
      console.error(`[API] GET /watchlist: DB query failed —`, (e as Error).message);
      throw e;
    }

    const lastPrices = manager?.lastPrices ?? new Map();
    console.log(`[API] GET /watchlist: ${lastPrices.size} prices available`);

    const data = rows.map((r) => ({
      symbol: r.symbol,
      params: r.params,
      lastPrice: lastPrices.get(r.symbol) ?? null,
      active: r.active,
    }));

    res.json(data);
  } catch (e) {
    const err = (e as Error).message;
    console.error(`[API] GET /watchlist error:`, err);
    res.status(500).json({ error: err });
  }
});

// POST /api/watchlist — Update watchlist
app.post("/api/watchlist", async (req, res) => {
  try {
    const symbols = req.body.symbols as string[];
    if (!Array.isArray(symbols)) {
      res.status(400).json({ error: "symbols must be an array" });
      return;
    }

    // Clear and repopulate watchlist
    await prisma.watchlist.deleteMany({});
    for (const sym of symbols) {
      await prisma.watchlist.create({
        data: {
          symbol: sym,
          params: {} as any,
          active: true,
        },
      });
    }

    // Hot-reload if manager is running
    if (manager?.isRunning) {
      console.log(`[API] Watchlist updated: ${symbols.join(", ")}`);
      // Note: Full reload would require stopping/restarting manager
      // For now, just acknowledge the update
    }

    res.json({ success: true, symbols });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// PATCH /api/watchlist/:symbol/params — Update symbol params
app.patch("/api/watchlist/:symbol/params", async (req, res) => {
  try {
    const { symbol } = req.params;
    const params = req.body;

    // Validate params
    if (typeof params !== "object" || !params) {
      res.status(400).json({ error: "params must be an object" });
      return;
    }

    const updated = await prisma.watchlist.update({
      where: { symbol },
      data: { params },
    });

    console.log(`[API] Updated params for ${symbol}:`, params);
    res.json({ success: true, symbol, params: updated.params });
  } catch (e) {
    if ((e as any).code === "P2025") {
      res.status(404).json({ error: "Symbol not found in watchlist" });
    } else {
      res.status(500).json({ error: String(e) });
    }
  }
});

// GET /api/status — Current bot status
app.get("/api/status", async (_req, res) => {
  try {
    if (!manager) {
      res.json({
        running: false,
        message: "Manager not initialized",
      });
      return;
    }

    console.log(`[API] GET /status: fetching current state`);

    const isRunning = manager.isRunning;
    const activeTrade = manager.activeTrade;
    const dailyStats = manager.dailyStats;
    const config = manager.config;

    // Total stats from DB (all closed trades)
    let allClosed;
    try {
      allClosed = await prisma.liveTrade.findMany({
        where: { sellTime: { not: null } },
      });
      console.log(`[API] GET /status: loaded ${allClosed.length} closed trades`);
    } catch (e) {
      console.error(`[API] GET /status: failed to load trades —`, (e as Error).message);
      throw e;
    }

    const totalPnl = allClosed.reduce((s, t) => s + (t.pnlUsdt ?? 0), 0);
    const winners = allClosed.filter((t) => (t.pnlUsdt ?? 0) > 0).length;
    const winRate = allClosed.length > 0 ? (winners / allClosed.length) * 100 : 0;

    // Transform config to SNAKE_CASE for client compatibility
    const configSnakeCase = {
      UP_MAX_STREAK: config.upMaxStreak,
      DAILY_MAX_TRADES: config.dailyMaxTrades,
      DAILY_MAX_PNL_PCT: config.dailyMaxPnlPct,
      FEE_RATE: config.feeRate,
      INITIAL_BALANCE_USDT: config.initialBalanceUsdt,
    };

    const statusData = {
      running: isRunning,
      sessionId: manager.sessionId,
      balance: manager.balance,
      dailyStats,
      activeTrade: activeTrade
        ? {
            symbol: activeTrade.position.symbol,
            buyPrice: activeTrade.position.buyPrice,
            buyTime: activeTrade.position.buyTime,
            usdtSpent: activeTrade.position.usdtSpent,
            currentPrice: activeTrade.currentPrice,
            strategy: activeTrade.strategy,
            sellTarget: activeTrade.position.buyPrice * activeTrade.sellMult,
            sellMult: activeTrade.sellMult,
            pnlUsd: activeTrade.currentPrice
              ? activeTrade.currentPrice * activeTrade.position.btcNet - activeTrade.position.usdtSpent
              : null,
            pnlPct: activeTrade.currentPrice
              ? ((activeTrade.currentPrice * activeTrade.position.btcNet - activeTrade.position.usdtSpent) /
                  activeTrade.position.usdtSpent) *
                100
              : null,
          }
        : null,
      stats: {
        totalClosedTrades: allClosed.length,
        totalPnl,
        winRate,
      },
      config: configSnakeCase,
    };

    console.log(
      `[API] GET /status: running=${isRunning}, balance=$${manager.balance.toFixed(2)}, ` +
      `trades=${allClosed.length}, activeTrade=${activeTrade ? activeTrade.position.symbol : "none"}`
    );

    res.json(statusData);
  } catch (e) {
    const err = (e as Error).message;
    console.error(`[API] GET /status error:`, err);
    res.status(500).json({ error: err });
  }
});

// GET /api/trades — Paginated trade history
app.get("/api/trades", async (req, res) => {
  try {
    const page = Math.max(1, parseInt((req.query.page as string) || "1"));
    const limit = Math.min(50, parseInt((req.query.limit as string) || "20"));

    const trades = await prisma.liveTrade.findMany({
      where: { sellTime: { not: null } },
      orderBy: { id: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    });

    res.json(trades);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// GET /api/config — Read current config
app.get("/api/config", async (_req, res) => {
  try {
    const rows = await prisma.botConfig.findMany();
    const map: Record<string, string> = {};
    for (const r of rows) map[r.key] = r.value;

    const defaults = {
      UP_MAX_STREAK: 1,
      DAILY_MAX_TRADES: 2,
      DAILY_MAX_PNL_PCT: 5,
      FEE_RATE: 0.001,
      INITIAL_BALANCE_USDT: 100,
    };

    const config = {
      UP_MAX_STREAK: Number(map["UP_MAX_STREAK"] ?? defaults.UP_MAX_STREAK),
      DAILY_MAX_TRADES: Number(map["DAILY_MAX_TRADES"] ?? defaults.DAILY_MAX_TRADES),
      DAILY_MAX_PNL_PCT: Number(map["DAILY_MAX_PNL_PCT"] ?? defaults.DAILY_MAX_PNL_PCT),
      FEE_RATE: Number(map["FEE_RATE"] ?? defaults.FEE_RATE),
      INITIAL_BALANCE_USDT: Number(map["INITIAL_BALANCE_USDT"] ?? defaults.INITIAL_BALANCE_USDT),
    };

    res.json(config);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// PUT /api/config — Update config
app.put("/api/config", async (req, res) => {
  try {
    const keys = [
      "UP_MAX_STREAK",
      "DAILY_MAX_TRADES",
      "DAILY_MAX_PNL_PCT",
      "FEE_RATE",
      "INITIAL_BALANCE_USDT",
    ];

    console.log("[API] PUT /config received:", req.body);

    // Write all updates to database
    for (const key of keys) {
      if (key in req.body) {
        const val = String(req.body[key]);
        console.log(`[API] Upserting ${key} = ${val}`);

        const result = await prisma.botConfig.upsert({
          where: { key },
          update: { value: val },
          create: { key, value: val },
        });

        console.log(`[API] Upserted: ${key} => ${result.value}`);
      }
    }

    console.log("[API] All updates written to DB");

    // Reload manager config if running
    if (manager?.isRunning) {
      console.log("[API] Reloading manager config...");
      const config = await loadConfigFromDatabase();
      manager.updateConfig({
        upMaxStreak: config.UP_MAX_STREAK,
        dailyMaxTrades: config.DAILY_MAX_TRADES,
        dailyMaxPnlPct: config.DAILY_MAX_PNL_PCT,
        feeRate: config.FEE_RATE,
        initialBalanceUsdt: config.INITIAL_BALANCE_USDT,
      });
      console.log(`[API] Manager config reloaded`);
    }

    // Read fresh config from DB
    const rows = await prisma.botConfig.findMany();
    const map: Record<string, string> = {};
    for (const r of rows) map[r.key] = r.value;

    const defaults = {
      UP_MAX_STREAK: 1,
      DAILY_MAX_TRADES: 2,
      DAILY_MAX_PNL_PCT: 5,
      FEE_RATE: 0.001,
      INITIAL_BALANCE_USDT: 100,
    };

    const config = {
      UP_MAX_STREAK: Number(map["UP_MAX_STREAK"] ?? defaults.UP_MAX_STREAK),
      DAILY_MAX_TRADES: Number(map["DAILY_MAX_TRADES"] ?? defaults.DAILY_MAX_TRADES),
      DAILY_MAX_PNL_PCT: Number(map["DAILY_MAX_PNL_PCT"] ?? defaults.DAILY_MAX_PNL_PCT),
      FEE_RATE: Number(map["FEE_RATE"] ?? defaults.FEE_RATE),
      INITIAL_BALANCE_USDT: Number(map["INITIAL_BALANCE_USDT"] ?? defaults.INITIAL_BALANCE_USDT),
    };

    res.json({ success: true, config });
  } catch (e) {
    console.error("[API] PUT /config error:", e);
    res.status(500).json({ error: String(e) });
  }
});

// GET /api/health — Health check
app.get("/api/health", (_req, res) => {
  res.json({ ok: true, running: manager?.isRunning ?? false });
});

// ── WebSocket Server ───────────────────────────────────────────────────────

const server = http.createServer(app);
// WebSocket server handles HTTP upgrade requests automatically
const wss = new WebSocket.Server({ server });

wss.on("connection", (ws: WebSocket) => {
  wsClients.add(ws);
  console.log(`[API] ✅ WebSocket client connected (${wsClients.size} total)`);

  // Send initial state
  const sendInitialState = async () => {
    try {
      console.log(`[API] Preparing initial state...`);

      if (!manager) {
        const { manager: m } = await initializeManager();
        manager = m;
      }

      let watchlist;
      try {
        watchlist = await prisma.watchlist.findMany({ where: { active: true } });
      } catch (e) {
        console.error(`[API] Failed to load watchlist from DB:`, (e as Error).message);
        throw e;
      }

      const lastPrices = manager?.lastPrices ?? new Map();
      console.log(`[API] Loaded ${watchlist.length} symbols, ${lastPrices.size} prices available`);

      const watchlistData = watchlist.map((r) => ({
        symbol: r.symbol,
        params: r.params,
        lastPrice: lastPrices.get(r.symbol) ?? null,
        active: r.active,
      }));

      const msg = {
        type: "initial",
        watchlist: watchlistData,
        status: manager?.isRunning
          ? {
              running: true,
              sessionId: manager.sessionId,
              balance: manager.balance,
              lastPrices: Object.fromEntries(manager.lastPrices),
            }
          : { running: false },
      };

      try {
        ws.send(JSON.stringify(msg));
        console.log(`[API] ✅ Sent initial state (${watchlistData.length} symbols)`);
      } catch (e) {
        console.error(`[API] Failed to send initial state:`, (e as Error).message);
        throw e;
      }
    } catch (e) {
      const err = (e as Error).message;
      console.error(`[API] Error in sendInitialState:`, err);
      try {
        ws.close(1011, `Error: ${err}`);
      } catch (closeErr) {
        console.error(`[API] Failed to close WS connection:`, (closeErr as Error).message);
      }
    }
  };

  sendInitialState().catch((e) => {
    console.error(`[API] Unhandled error in sendInitialState:`, (e as Error).message);
    try {
      ws.close(1011, "Internal server error");
    } catch (closeErr) {
      console.error(`[API] Failed to close connection:`, (closeErr as Error).message);
    }
  });

  ws.on("close", () => {
    wsClients.delete(ws);
    console.log(`[API] ❌ Client disconnected (${wsClients.size} remaining)`);
  });

  ws.on("error", (e) => {
    console.error(`[API] ❌ Client error:`, (e as Error).message);
  });
});

// ── Server startup ─────────────────────────────────────────────────────────

server.listen(PORT, async () => {
  console.log(`[API] Server listening on http://localhost:${PORT}`);
  console.log(`[API] WebSocket: ws://localhost:${PORT}`);
  console.log(`[API] REST Endpoints:`);
  console.log(`[API]   GET  /api/watchlist      — list of active symbols`);
  console.log(`[API]   POST /api/watchlist      — update watchlist`);
  console.log(`[API]   GET  /api/status         — live bot status`);
  console.log(`[API]   GET  /api/trades         — closed trade history`);
  console.log(`[API]   GET  /api/config         — read bot config`);
  console.log(`[API]   PUT  /api/config         — write bot config`);
  console.log(`[API]   GET  /api/health         — health check`);

  // Initialize manager and provider on startup
  try {
    await initializeManager();
    console.log(`[API] ✅ Manager initialized and running`);
  } catch (e) {
    console.error(`[API] ❌ Failed to initialize manager:`, (e as Error).message);
    console.log(`[API] Continuing without live trading (API-only mode)`);
  }
});

// ── Graceful shutdown ──────────────────────────────────────────────────────

process.on("SIGINT", async () => {
  console.log("\n[API] SIGINT received, shutting down...");

  if (manager?.isRunning) {
    manager.stop();
  }

  if (provider) {
    try {
      await provider.stop();
    } catch (e) {
      console.error(`[API] Failed to stop provider:`, (e as Error).message);
    }
  }

  wsClients.forEach((ws) => ws.close());
  server.close();
  await prisma.$disconnect();

  process.exit(0);
});

process.on("uncaughtException", (err) => {
  console.error("[API] ❌ Uncaught exception:", err);
  process.exit(1);
});

process.on("unhandledRejection", (reason) => {
  console.error("[API] ❌ Unhandled rejection:", reason);
  process.exit(1);
});
