// ─────────────────────────────────────────────
// src/api/server.ts
// Lightweight Express API — serves dashboard data
// from the DB. Run with: npm run api
// ─────────────────────────────────────────────

import "dotenv/config";
import express    from "express";
import cors       from "cors";
import path       from "path";
import { prisma } from "../db/prismaClient";

const app  = express();
const PORT = process.env.API_PORT ?? 3131;

app.use(cors());
app.use(express.json());

app.use(express.static(path.join(__dirname, "../../dashboard")));

// ── GET /api/status ───────────────────────────────────────────────────────
// Latest session info + global stats across ALL sessions
app.get("/api/status", async (_req, res) => {
  try {
    const session = await prisma.liveSession.findFirst({
      orderBy: { id: "desc" },
    });

    if (!session) {
      res.json({ running: false });
      return;
    }

    // Stats computed across ALL closed trades regardless of session
    const allClosed = await prisma.liveTrade.findMany({
      where:   { sellTime: { not: null } },
      orderBy: { id: "desc" },
    });

    const open = await prisma.liveTrade.findFirst({
      where:   { sellTime: null },
      orderBy: { id: "desc" },
    });

    const running     = session.endedAt === null;
    const totalPnl    = allClosed.reduce((s, t) => s + (t.pnlUsdt ?? 0), 0);
    const totalFees   = allClosed.reduce((s, t) => {
      const buyFee = (t.feeBtc ?? 0) * (t.sellPrice ?? 0);
      return s + buyFee + (t.feeUsdt ?? 0);
    }, 0);
    const winners  = allClosed.filter((t) => (t.pnlUsdt ?? 0) > 0).length;
    const winRate  = allClosed.length > 0 ? (winners / allClosed.length) * 100 : 0;
    const balance  = open
      ? session.initialBalance
      : (allClosed[0]?.balanceAfter ?? session.initialBalance);

    res.json({
      running,
      session: {
        id:             session.id,
        startedAt:      session.startedAt,
        endedAt:        session.endedAt,
        initialBalance: session.initialBalance,
        currentBalance: running ? balance : session.finalBalance,
        feeRate:        session.feeRate,
      },
      stats: {
        totalTrades:  allClosed.length,
        openPosition: open !== null,
        winRate,
        totalPnl,
        totalFees,
      },
      openPosition: open ? {
        buyTime:   open.buyTime,
        buyPrice:  open.buyPrice,
        usdtSpent: open.usdtSpent,
        btcNet:    open.btcNet,
      } : null,
    });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// ── GET /api/trades ───────────────────────────────────────────────────────
// Paginated trade history across ALL sessions
app.get("/api/trades", async (req, res) => {
  try {
    const page  = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(50, parseInt(req.query.limit as string) || 20);

    const trades = await prisma.liveTrade.findMany({
      where:   { sellTime: { not: null } },
      orderBy: { id: "desc" },
      skip:    (page - 1) * limit,
      take:    limit,
    });

    res.json(trades);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// ── GET /api/sessions ─────────────────────────────────────────────────────
app.get("/api/sessions", async (_req, res) => {
  try {
    const sessions = await prisma.liveSession.findMany({
      orderBy: { id: "desc" },
      include: { _count: { select: { trades: true } } },
    });
    res.json(sessions);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

app.listen(PORT, () => {
  console.log(`[API] Dashboard running at http://localhost:${PORT}`);
});
