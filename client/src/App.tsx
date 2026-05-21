import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import type { Status, Trade, WatchlistItem, BotConfig } from "./types";

// ── Constants ────────────────────────────────────────────────────────────
// API URL: use env var or default to /api (proxied by Nginx)
const API = import.meta.env.VITE_API_URL ?? "/api";

// WebSocket URL: convert http(s) to ws(s), or if relative path, build from current origin
const WS_URL = (() => {
  if (API.startsWith("http")) {
    return API.replace(/^https/, "wss").replace(/^http/, "ws");
  }
  // For relative paths like "/api", construct full WebSocket URL from current origin
  const protocol = window.location.protocol === "https:" ? "wss" : "ws";
  return `${protocol}://${window.location.host}${API}`;
})();
const POLL_STATUS = 5000;   // Poll status less frequently (REST)
const POLL_TRADES = 15000;  // Poll trades even less frequently
const PAGE_LIMIT = 20;

// ── Formatters ───────────────────────────────────────────────────────────
const f$ = (n: number | null | undefined) =>
  n == null ? "—" : "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fPct = (n: number | null | undefined) =>
  n == null ? "—" : (n >= 0 ? "+" : "") + n.toFixed(3) + "%";

const fDate = (ts: number | string | null | undefined) => {
  if (!ts) return "—";
  const d = typeof ts === "number" ? new Date(ts) : new Date(ts);
  return d.toISOString().replace("T", " ").slice(0, 16) + " UTC";
};

const fDur = (startMs: number, endMs?: number) => {
  const ms = (endMs ?? Date.now()) - startMs;
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
};

// ── usePoll hook ─────────────────────────────────────────────────────────
function usePoll<T>(url: string, interval: number, defaultVal: T) {
  const [data, setData] = useState<T>(defaultVal);
  const [err, setErr] = useState(false);

  const fetch_ = useCallback(() => {
    fetch(url)
      .then(r => r.json())
      .then(d => { setData(d); setErr(false); })
      .catch(() => setErr(true));
  }, [url]);

  useEffect(() => {
    fetch_();
    const id = setInterval(fetch_, interval);
    return () => clearInterval(id);
  }, [fetch_, interval]);

  return { data, err };
}

// ── useWebSocket hook ────────────────────────────────────────────────────
function useWebSocket(url: string) {
  const [connected, setConnected] = useState(false);
  const [prices, setPrices] = useState<Map<string, number>>(new Map());
  const [config, setConfig] = useState<BotConfig | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    console.log(`[WS] Attempting to connect to ${url}`);

    const ws = new WebSocket(url);

    ws.onopen = () => {
      console.log("[WS] ✅ Connected successfully");
      setConnected(true);
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        console.log(`[WS] Received message type: ${msg.type}`);

        if (msg.type === "price") {
          console.log(`[WS] Price update: ${msg.symbol} @ $${msg.price}`);
          setPrices(prev => new Map(prev).set(msg.symbol, msg.price));
        } else if (msg.type === "config") {
          const { timestamp, ...cfg } = msg;
          console.log(`[WS] Config updated`, cfg);
          setConfig(cfg as BotConfig);
        } else if (msg.type === "initial") {
          console.log(`[WS] Initial state received`);
          // Initial state on connect
          if (msg.watchlist) {
            const pMap = new Map<string, number>();
            msg.watchlist.forEach((w: any) => {
              if (w.lastPrice) pMap.set(w.symbol, w.lastPrice);
            });
            setPrices(pMap);
          }
        }
      } catch (e) {
        console.error("[WS] Message parse error:", e);
      }
    };

    ws.onerror = (event) => {
      console.error("[WS] ❌ Connection error:", event);
      setConnected(false);
    };

    ws.onclose = (event) => {
      console.log(`[WS] ❌ Disconnected (code: ${event.code}, reason: ${event.reason})`);
      setConnected(false);
    };

    wsRef.current = ws;

    return () => {
      console.log("[WS] Cleaning up connection");
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.close();
      }
    };
  }, [url]);

  return { connected, prices, config, ws: wsRef.current };
}

// ── Components ───────────────────────────────────────────────────────────
function Pill({ label, value, color = "text-zinc-100" }: { label: string; value: string; color?: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] text-zinc-500 uppercase tracking-widest">{label}</span>
      <span className={`text-sm font-mono font-medium ${color}`}>{value}</span>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900">
      <div className="px-4 py-2 border-b border-zinc-800 text-[10px] uppercase tracking-widest text-zinc-500">
        {title}
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

// ── App ──────────────────────────────────────────────────────────────────
export default function App() {
  // WebSocket real-time data (prices, config)
  const ws = useWebSocket(WS_URL);

  // Status & config (REST polling, less frequent)
  const { data: status, err: statusErr } = usePoll<Status>(
    `${API}/status`, POLL_STATUS, {
      running: false,
      sessionId: 0,
      balance: 0,
      dailyStats: { day: "", trades: 0, pnlPct: 0 },
      activeTrade: null,
      stats: { totalClosedTrades: 0, totalPnl: 0, winRate: 0 },
      config: {
        UP_MAX_STREAK: 0,
        DAILY_MAX_TRADES: 0,
        DAILY_MAX_PNL_PCT: 0,
        FEE_RATE: 0,
        INITIAL_BALANCE_USDT: 0,
      },
    }
  );

  // Watchlist symbols (REST polling)
  const { data: watchlistSymbols, err: watchlistErr } = usePoll<WatchlistItem[]>(
    `${API}/watchlist`, 5000, []
  );

  // Merge watchlist with real-time prices from WebSocket (memoized to prevent infinite loops)
  const watchlist = useMemo(
    () => watchlistSymbols.map(w => ({
      ...w,
      lastPrice: ws.prices.get(w.symbol) ?? w.lastPrice,
    })),
    [watchlistSymbols, ws.prices]
  );

  // Use WebSocket config if available, otherwise use REST config
  const currentConfig = ws.config ?? status.config;

  // Trades pagination
  const [page, setPage] = useState(1);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [tradeErr, setTradeErr] = useState(false);

  // Load trades on page change and set up polling interval
  useEffect(() => {
    const loadPage = async () => {
      try {
        const r = await fetch(`${API}/trades?page=${page}&limit=${PAGE_LIMIT}`);
        const d: Trade[] = await r.json();
        setTrades(d);
        setTradeErr(false);
      } catch {
        setTradeErr(true);
      }
    };

    loadPage(); // Load immediately
    const id = setInterval(loadPage, POLL_TRADES); // Poll periodically
    return () => clearInterval(id);
  }, [page]);

  // Config editing
  const [configEditOpen, setConfigEditOpen] = useState(false);
  const [configEdit, setConfigEdit] = useState<BotConfig | null>(null);
  const [configSaving, setConfigSaving] = useState(false);

  // Watchlist params editing
  const [watchlistEditOpen, setWatchlistEditOpen] = useState(false);
  const [watchlistEdit, setWatchlistEdit] = useState<Record<string, any>>({});
  const [watchlistSaving, setWatchlistSaving] = useState(false);

  // Only sync config from API when NOT editing
  useEffect(() => {
    if (!configEditOpen) {
      setConfigEdit(currentConfig);
    }
  }, [currentConfig, configEditOpen]);

  // Initialize watchlist edit state
  useEffect(() => {
    if (!watchlistEditOpen) {
      const editState: Record<string, any> = {};
      watchlist.forEach(w => {
        editState[w.symbol] = { ...w.params };
      });
      setWatchlistEdit(editState);
    }
  }, [watchlist, watchlistEditOpen]);

  const handleSaveConfig = async () => {
    if (!configEdit) return;
    setConfigSaving(true);
    try {
      await fetch(`${API}/config`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(configEdit),
      });
      setConfigEditOpen(false);
    } catch (e) {
      console.error("Config save failed:", e);
    }
    setConfigSaving(false);
  };

  const handleSaveWatchlistParams = async () => {
    setWatchlistSaving(true);
    try {
      for (const symbol in watchlistEdit) {
        await fetch(`${API}/watchlist/${symbol}/params`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(watchlistEdit[symbol]),
        });
      }
      setWatchlistEditOpen(false);
      console.log("[Client] Watchlist params saved successfully");
    } catch (e) {
      console.error("Watchlist params save failed:", e);
    }
    setWatchlistSaving(false);
  };

  const s = status;
  const op = status.activeTrade;
  const pnl = status.stats.totalPnl;
  const pnlPct = status.stats.totalClosedTrades > 0
    ? (pnl / currentConfig.INITIAL_BALANCE_USDT) * 100
    : 0;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 font-mono p-4 space-y-4">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold tracking-wider text-amber-400">SPOT-BOT MULTI</h1>
          <p className="text-[10px] text-zinc-500 uppercase tracking-widest">
            Multi-Symbol · Live Engine
          </p>
        </div>

        <div className="flex flex-col items-end gap-1">
          {/* Bot status */}
          <div className="flex items-center gap-1.5">
            <span className={`w-1.5 h-1.5 rounded-full ${
              status.running ? "bg-green-400 animate-pulse"
              : statusErr ? "bg-red-500"
              : "bg-zinc-600"
            }`} />
            <span className="text-[9px] text-zinc-400 uppercase tracking-wider">
              {statusErr ? "API ERROR" : status.running ? "BOT LIVE" : "BOT OFFLINE"}
            </span>
          </div>
          {/* WebSocket status */}
          <div className="flex items-center gap-1.5">
            <span className={`w-1.5 h-1.5 rounded-full ${
              ws.connected ? "bg-blue-400 animate-pulse" : "bg-zinc-600"
            }`} />
            <span className="text-[9px] text-zinc-400 uppercase tracking-wider">
              {ws.connected ? "WS LIVE" : "WS OFFLINE"}
            </span>
          </div>
          {status.running && (
            <span className="text-[10px] text-zinc-500">
              Session #{status.sessionId}
            </span>
          )}
        </div>
      </div>

      {/* Top stats */}
      {status.running && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Card title="Balance">
            <span className="text-2xl font-semibold text-amber-400">{f$(status.balance)}</span>
            <p className="text-[10px] text-zinc-500 mt-1">
              Initial {f$(currentConfig.INITIAL_BALANCE_USDT)}
            </p>
          </Card>
          <Card title="Total P&L">
            <span className={`text-2xl font-semibold ${pnl >= 0 ? "text-green-400" : "text-red-400"}`}>
              {f$(pnl)}
            </span>
            <p className="text-[10px] text-zinc-500 mt-1">{fPct(pnlPct)} overall</p>
          </Card>
          <Card title="Win Rate">
            <span className={`text-2xl font-semibold ${status.stats.winRate >= 60 ? "text-green-400" : "text-zinc-300"}`}>
              {status.stats.winRate.toFixed(1)}%
            </span>
            <p className="text-[10px] text-zinc-500 mt-1">{status.stats.totalClosedTrades} closed</p>
          </Card>
          <Card title="Daily Stats">
            <span className="text-2xl font-semibold text-zinc-300">{status.dailyStats.trades}</span>
            <p className="text-[10px] text-zinc-500 mt-1">
              trades · {fPct(status.dailyStats.pnlPct)} P&L
            </p>
          </Card>
        </div>
      )}

      {/* Watchlist */}
      <Card title="📊 Watchlist">
        {watchlistErr ? (
          <p className="text-red-400 text-xs">Failed to load watchlist</p>
        ) : watchlist.length === 0 ? (
          <p className="text-zinc-500 text-xs">No symbols in watchlist</p>
        ) : !watchlistEditOpen ? (
          <div className="space-y-3">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {watchlist.map(w => (
                <div key={w.symbol} className="border border-zinc-800 rounded p-3 bg-zinc-800/30">
                  <div className="text-sm font-semibold text-amber-400">{w.symbol}</div>
                  <div className={`text-xs mt-1 ${ws.prices.has(w.symbol) ? "text-green-400" : "text-zinc-500"}`}>
                    Price: {w.lastPrice ? f$(w.lastPrice) : "—"}
                  </div>
                  <div className="text-[10px] text-zinc-600 mt-2 space-y-0.5">
                    <div>upCond2: {w.params.upCond2?.toFixed(4) ?? "—"}</div>
                    <div>upSell: {w.params.upSell?.toFixed(4) ?? "—"}</div>
                    <div>downCond2: {w.params.downCond2?.toFixed(4) ?? "—"}</div>
                    <div>downSell: {w.params.downSell?.toFixed(4) ?? "—"}</div>
                  </div>
                </div>
              ))}
            </div>
            <button
              onClick={() => setWatchlistEditOpen(true)}
              className="text-[10px] mt-3 px-4 py-2 border border-amber-500 text-amber-400 rounded hover:bg-amber-500/10 transition-colors"
            >
              EDIT SYMBOL PARAMS
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {watchlist.map(w => (
              <div key={w.symbol} className="border border-zinc-700 rounded p-3 bg-zinc-800/20">
                <div className="text-sm font-semibold text-amber-400 mb-3">{w.symbol}</div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] text-zinc-500 uppercase">upCond2</label>
                    <input
                      type="number"
                      step="0.001"
                      value={watchlistEdit[w.symbol]?.upCond2 ?? ""}
                      onChange={(e) => setWatchlistEdit(prev => ({
                        ...prev,
                        [w.symbol]: { ...prev[w.symbol], upCond2: parseFloat(e.target.value) || 1.0 }
                      }))}
                      className="w-full mt-1 px-2 py-1 bg-zinc-800 border border-zinc-700 rounded text-sm font-mono"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-zinc-500 uppercase">upSell</label>
                    <input
                      type="number"
                      step="0.001"
                      value={watchlistEdit[w.symbol]?.upSell ?? ""}
                      onChange={(e) => setWatchlistEdit(prev => ({
                        ...prev,
                        [w.symbol]: { ...prev[w.symbol], upSell: parseFloat(e.target.value) || 1.0 }
                      }))}
                      className="w-full mt-1 px-2 py-1 bg-zinc-800 border border-zinc-700 rounded text-sm font-mono"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-zinc-500 uppercase">downCond2</label>
                    <input
                      type="number"
                      step="0.001"
                      value={watchlistEdit[w.symbol]?.downCond2 ?? ""}
                      onChange={(e) => setWatchlistEdit(prev => ({
                        ...prev,
                        [w.symbol]: { ...prev[w.symbol], downCond2: parseFloat(e.target.value) || 1.0 }
                      }))}
                      className="w-full mt-1 px-2 py-1 bg-zinc-800 border border-zinc-700 rounded text-sm font-mono"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-zinc-500 uppercase">downSell</label>
                    <input
                      type="number"
                      step="0.001"
                      value={watchlistEdit[w.symbol]?.downSell ?? ""}
                      onChange={(e) => setWatchlistEdit(prev => ({
                        ...prev,
                        [w.symbol]: { ...prev[w.symbol], downSell: parseFloat(e.target.value) || 1.0 }
                      }))}
                      className="w-full mt-1 px-2 py-1 bg-zinc-800 border border-zinc-700 rounded text-sm font-mono"
                    />
                  </div>
                </div>
              </div>
            ))}
            <div className="flex gap-2 pt-3 border-t border-zinc-800">
              <button
                onClick={handleSaveWatchlistParams}
                disabled={watchlistSaving}
                className="flex-1 text-[10px] px-4 py-2 bg-green-900/40 border border-green-800 text-green-400 rounded hover:bg-green-900/60 disabled:opacity-50 transition-colors"
              >
                {watchlistSaving ? "SAVING..." : "SAVE PARAMS"}
              </button>
              <button
                onClick={() => setWatchlistEditOpen(false)}
                className="flex-1 text-[10px] px-4 py-2 bg-zinc-800/40 border border-zinc-700 text-zinc-400 rounded hover:bg-zinc-800/60 transition-colors"
              >
                CANCEL
              </button>
            </div>
          </div>
        )}
      </Card>

      {/* Active order */}
      {op && (
        <Card title="▶ Active Order">
          <div className="grid grid-cols-2 sm:grid-cols-6 gap-4">
            <Pill label="Symbol" value={op.symbol} color="text-amber-400" />
            <Pill label="Buy Price" value={f$(op.buyPrice)} color="text-amber-400" />
            <Pill label="Current" value={op.currentPrice ? f$(op.currentPrice) : "—"} />
            <Pill label="Target" value={f$(op.sellTarget)} color="text-green-400" />
            <Pill label="P&L" value={f$(op.pnlUsd)} color={op.pnlUsd ? (op.pnlUsd >= 0 ? "text-green-400" : "text-red-400") : ""} />
            <Pill label="P&L %" value={fPct(op.pnlPct)} color={op.pnlPct ? (op.pnlPct >= 0 ? "text-green-400" : "text-red-400") : ""} />
            <Pill label="Duration" value={fDur(op.buyTime)} />
            <Pill label="Strategy" value={op.strategy ?? "—"} />
            <Pill label="Size" value={f$(op.usdtSpent)} />
            <Pill label="Sell Mult" value={op.sellMult.toFixed(4)} />
          </div>
        </Card>
      )}

      {/* Trade history */}
      <Card title="📈 Trade History">
        {tradeErr ? (
          <p className="text-red-400 text-xs">Failed to load trades</p>
        ) : trades.length === 0 ? (
          <p className="text-zinc-500 text-xs">No trades closed yet</p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-zinc-500 uppercase tracking-widest text-[10px] border-b border-zinc-800">
                    <th className="pb-2 text-left">ID</th>
                    <th className="pb-2 text-left">Symbol</th>
                    <th className="pb-2 text-left">Buy Time</th>
                    <th className="pb-2 text-right">Buy</th>
                    <th className="pb-2 text-right">Sell</th>
                    <th className="pb-2 text-right">P&L</th>
                    <th className="pb-2 text-right">P&L %</th>
                  </tr>
                </thead>
                <tbody>
                  {trades.map(t => {
                    const win = (t.pnlUsdt ?? 0) >= 0;
                    return (
                      <tr key={t.id} className="border-b border-zinc-800/50 hover:bg-zinc-800/30 transition-colors">
                        <td className="py-2 text-zinc-500">{t.id}</td>
                        <td className="py-2 font-semibold text-amber-400">{t.symbol}</td>
                        <td className="py-2 text-zinc-400 text-[9px]">{fDate(t.buyTime)}</td>
                        <td className="py-2 text-right">{f$(t.buyPrice)}</td>
                        <td className="py-2 text-right">{f$(t.sellPrice)}</td>
                        <td className={`py-2 text-right font-medium ${win ? "text-green-400" : "text-red-400"}`}>
                          {f$(t.pnlUsdt)}
                        </td>
                        <td className={`py-2 text-right ${win ? "text-green-400" : "text-red-400"}`}>
                          {fPct(t.pnlPct)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between mt-3 pt-3 border-t border-zinc-800">
              <span className="text-[10px] text-zinc-500 uppercase tracking-widest">Page {page}</span>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="text-[10px] px-3 py-1 border border-zinc-700 text-zinc-400 rounded disabled:opacity-30 hover:border-amber-500 hover:text-amber-400 transition-colors"
                >
                  PREV
                </button>
                <button
                  onClick={() => setPage(p => p + 1)}
                  disabled={trades.length < PAGE_LIMIT}
                  className="text-[10px] px-3 py-1 border border-zinc-700 text-zinc-400 rounded disabled:opacity-30 hover:border-amber-500 hover:text-amber-400 transition-colors"
                >
                  NEXT
                </button>
              </div>
            </div>
          </>
        )}
      </Card>

      {/* Configuration */}
      <Card title="⚙ Configuration">
        {!configEditOpen ? (
          <div className="space-y-2">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
              <div>
                <span className="text-zinc-500 text-[10px]">UP_MAX_STREAK</span>
                <div className="font-mono font-semibold">{currentConfig.UP_MAX_STREAK}</div>
              </div>
              <div>
                <span className="text-zinc-500 text-[10px]">DAILY_MAX_TRADES</span>
                <div className="font-mono font-semibold">{currentConfig.DAILY_MAX_TRADES}</div>
              </div>
              <div>
                <span className="text-zinc-500 text-[10px]">DAILY_MAX_PNL_PCT</span>
                <div className="font-mono font-semibold">{currentConfig.DAILY_MAX_PNL_PCT}%</div>
              </div>
              <div>
                <span className="text-zinc-500 text-[10px]">FEE_RATE</span>
                <div className="font-mono font-semibold">{(currentConfig.FEE_RATE * 100).toFixed(3)}%</div>
              </div>
              <div>
                <span className="text-zinc-500 text-[10px]">INITIAL_BALANCE</span>
                <div className="font-mono font-semibold">{f$(currentConfig.INITIAL_BALANCE_USDT)}</div>
              </div>
            </div>
            <button
              onClick={() => setConfigEditOpen(true)}
              className="text-[10px] mt-3 px-4 py-2 border border-amber-500 text-amber-400 rounded hover:bg-amber-500/10 transition-colors"
            >
              EDIT CONFIG
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] text-zinc-500 uppercase">UP_MAX_STREAK</label>
                <input
                  type="number"
                  value={configEdit?.UP_MAX_STREAK ?? ""}
                  onChange={(e) => setConfigEdit(c => c ? { ...c, UP_MAX_STREAK: parseInt(e.target.value) || 0 } : null)}
                  className="w-full mt-1 px-2 py-1 bg-zinc-800 border border-zinc-700 rounded text-sm"
                />
              </div>
              <div>
                <label className="text-[10px] text-zinc-500 uppercase">DAILY_MAX_TRADES</label>
                <input
                  type="number"
                  value={configEdit?.DAILY_MAX_TRADES ?? ""}
                  onChange={(e) => setConfigEdit(c => c ? { ...c, DAILY_MAX_TRADES: parseInt(e.target.value) || 0 } : null)}
                  className="w-full mt-1 px-2 py-1 bg-zinc-800 border border-zinc-700 rounded text-sm"
                />
              </div>
              <div>
                <label className="text-[10px] text-zinc-500 uppercase">DAILY_MAX_PNL_PCT</label>
                <input
                  type="number"
                  step="0.1"
                  value={configEdit?.DAILY_MAX_PNL_PCT ?? ""}
                  onChange={(e) => setConfigEdit(c => c ? { ...c, DAILY_MAX_PNL_PCT: parseFloat(e.target.value) || 0 } : null)}
                  className="w-full mt-1 px-2 py-1 bg-zinc-800 border border-zinc-700 rounded text-sm"
                />
              </div>
              <div>
                <label className="text-[10px] text-zinc-500 uppercase">FEE_RATE</label>
                <input
                  type="number"
                  step="0.00001"
                  value={configEdit?.FEE_RATE ?? ""}
                  onChange={(e) => setConfigEdit(c => c ? { ...c, FEE_RATE: parseFloat(e.target.value) || 0 } : null)}
                  className="w-full mt-1 px-2 py-1 bg-zinc-800 border border-zinc-700 rounded text-sm"
                />
              </div>
              <div>
                <label className="text-[10px] text-zinc-500 uppercase">INITIAL_BALANCE_USDT</label>
                <input
                  type="number"
                  step="100"
                  value={configEdit?.INITIAL_BALANCE_USDT ?? ""}
                  onChange={(e) => setConfigEdit(c => c ? { ...c, INITIAL_BALANCE_USDT: parseFloat(e.target.value) || 0 } : null)}
                  className="w-full mt-1 px-2 py-1 bg-zinc-800 border border-zinc-700 rounded text-sm"
                />
              </div>
            </div>
            <div className="flex gap-2 pt-3 border-t border-zinc-800">
              <button
                onClick={handleSaveConfig}
                disabled={configSaving}
                className="flex-1 text-[10px] px-4 py-2 bg-green-900/40 border border-green-800 text-green-400 rounded hover:bg-green-900/60 disabled:opacity-50 transition-colors"
              >
                {configSaving ? "SAVING..." : "SAVE"}
              </button>
              <button
                onClick={() => setConfigEditOpen(false)}
                className="flex-1 text-[10px] px-4 py-2 bg-zinc-800/40 border border-zinc-700 text-zinc-400 rounded hover:bg-zinc-800/60 transition-colors"
              >
                CANCEL
              </button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
