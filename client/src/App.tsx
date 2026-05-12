import { useEffect, useState, useCallback } from "react";
import type { Status, Trade } from "./types";

// ── Constants ────────────────────────────────────────────────────────────
const API          = import.meta.env.VITE_API_URL ?? "";
const TP_MULT      = 1.1;
const POLL_STATUS  = 5000;
const POLL_TRADES  = 15000;
const PAGE_LIMIT   = 20;

const BUY_CONDITIONS = [
  "Cond 1: close < bbLower  →  arms the sequence (persists)",
  "Cond 2: bbUpper < close  AND  ma99 < bbUpper  →  fires buy",
];
const SELL_CONDITIONS = [
  "close >= buyPrice × 1.03  AND  close ≤ ma20",
];

// ── Formatters ───────────────────────────────────────────────────────────
const f$ = (n: number | null | undefined) =>
  n == null ? "—" : "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fPct = (n: number | null | undefined) =>
  n == null ? "—" : (n >= 0 ? "+" : "") + n.toFixed(3) + "%";

const fDate = (d: string | null | undefined) => {
  if (!d) return "—";
  return new Date(new Date(d).getTime() - 3 * 3600_000)
    .toISOString().replace("T", " ").slice(0, 16) + " GMT-3";
};

const fDur = (start: string, end?: string | null) => {
  const ms = (end ? new Date(end) : new Date()).getTime() - new Date(start).getTime();
  const h  = Math.floor(ms / 3_600_000);
  const m  = Math.floor((ms % 3_600_000) / 60_000);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
};

// ── usePoll hook ─────────────────────────────────────────────────────────
function usePoll<T>(url: string, interval: number, defaultVal: T) {
  const [data, setData] = useState<T>(defaultVal);
  const [err,  setErr]  = useState(false);

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
  const { data: status, err: statusErr } = usePoll<Status>(
    `${API}/api/status`, POLL_STATUS, { running: false }
  );

  const [page,     setPage]     = useState(1);
  const [trades,   setTrades]   = useState<Trade[]>([]);
  const [tradeErr, setTradeErr] = useState(false);

  const loadTrades = useCallback((p: number) => {
    fetch(`${API}/api/trades?page=${p}&limit=${PAGE_LIMIT}`)
      .then(r => r.json())
      .then((d: Trade[]) => { setTrades(d); setTradeErr(false); })
      .catch(() => setTradeErr(true));
  }, []);

  useEffect(() => { loadTrades(page); }, [loadTrades, page]);
  useEffect(() => {
    const id = setInterval(() => loadTrades(page), POLL_TRADES);
    return () => clearInterval(id);
  }, [loadTrades, page]);

  const s   = status.session;
  const st  = status.stats;
  const op  = status.openPosition;
  const pnl = st?.totalPnl ?? 0;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 font-mono p-4 space-y-4">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold tracking-wider text-amber-400">SPOT-BOT</h1>
          <p className="text-[10px] text-zinc-500 uppercase tracking-widest">BTC/USDT · Live Engine</p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${
            status.running ? "bg-green-400 animate-pulse"
            : statusErr    ? "bg-red-500"
                           : "bg-zinc-600"
          }`} />
          <span className="text-xs text-zinc-400 uppercase tracking-wider">
            {statusErr ? "ERROR" : status.running ? "LIVE" : "OFFLINE"}
          </span>
        </div>
      </div>

      {/* Stats */}
      {s && st && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Card title="Balance">
            <span className="text-2xl font-semibold text-amber-400">{f$(s.currentBalance)}</span>
            <p className="text-[10px] text-zinc-500 mt-1">Initial {f$(s.initialBalance)}</p>
          </Card>
          <Card title="Total P&L">
            <span className={`text-2xl font-semibold ${pnl >= 0 ? "text-green-400" : "text-red-400"}`}>
              {f$(pnl)}
            </span>
            <p className="text-[10px] text-zinc-500 mt-1">
              {fPct(s.initialBalance > 0 ? pnl / s.initialBalance * 100 : 0)} overall
            </p>
          </Card>
          <Card title="Win Rate">
            <span className={`text-2xl font-semibold ${st.winRate >= 60 ? "text-green-400" : "text-zinc-300"}`}>
              {st.winRate.toFixed(1)}%
            </span>
            <p className="text-[10px] text-zinc-500 mt-1">{st.totalTrades} closed trades</p>
          </Card>
          <Card title="Session">
            <span className="text-2xl font-semibold text-zinc-300">#{s.id}</span>
            <p className="text-[10px] text-zinc-500 mt-1">{fDur(s.startedAt, s.endedAt)}</p>
          </Card>
        </div>
      )}

      {/* Open position */}
      {op && (
        <Card title="▶ Open Position">
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
            <Pill label="Buy Price" value={f$(op.buyPrice)} color="text-amber-400" />
            <Pill label="Size"      value={f$(op.usdtSpent)} />
            <Pill label="BTC Held"  value={op.btcNet.toFixed(8) + " BTC"} />
            <Pill label="Opened"    value={fDate(op.buyTime)} />
            <Pill label="TP Target" value={f$(op.buyPrice * TP_MULT)} color="text-amber-300" />
          </div>
        </Card>
      )}

      {/* Conditions */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Card title="Buy Conditions">
          <ul className="space-y-2">
            {BUY_CONDITIONS.map((c, i) => (
              <li key={i} className="flex gap-2 text-xs text-zinc-300">
                <span className="text-green-400 shrink-0">✓</span>
                <span>{c}</span>
              </li>
            ))}
          </ul>
        </Card>
        <Card title="Sell Conditions">
          <ul className="space-y-2">
            {SELL_CONDITIONS.map((c, i) => (
              <li key={i} className="flex gap-2 text-xs text-zinc-300">
                <span className="text-red-400 shrink-0">✗</span>
                <span>{c}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      {/* Trade log */}
      <Card title="Trade Log">
        {tradeErr ? (
          <p className="text-red-400 text-xs">Failed to load trades</p>
        ) : trades.length === 0 ? (
          <p className="text-zinc-500 text-xs">No trades yet</p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-zinc-500 uppercase tracking-widest text-[10px] border-b border-zinc-800">
                    <th className="pb-2 text-left">#</th>
                    <th className="pb-2 text-left">Buy Time</th>
                    <th className="pb-2 text-right">Buy Price</th>
                    <th className="pb-2 text-left">Sell Time</th>
                    <th className="pb-2 text-right">Sell Price</th>
                    <th className="pb-2 text-right">P&L</th>
                    <th className="pb-2 text-right">P&L %</th>
                    <th className="pb-2 text-right">Balance</th>
                    <th className="pb-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {trades.map(t => {
                    const win = (t.pnlUsdt ?? 0) >= 0;
                    return (
                      <tr key={t.id} className="border-b border-zinc-800/50 hover:bg-zinc-800/30 transition-colors">
                        <td className="py-2 text-zinc-500">{t.id}</td>
                        <td className="py-2 text-zinc-400">{fDate(t.buyTime)}</td>
                        <td className="py-2 text-right">{f$(t.buyPrice)}</td>
                        <td className="py-2 text-zinc-400">{fDate(t.sellTime)}</td>
                        <td className="py-2 text-right">{f$(t.sellPrice)}</td>
                        <td className={`py-2 text-right font-medium ${win ? "text-green-400" : "text-red-400"}`}>
                          {f$(t.pnlUsdt)}
                        </td>
                        <td className={`py-2 text-right ${win ? "text-green-400" : "text-red-400"}`}>
                          {fPct(t.pnlPct)}
                        </td>
                        <td className="py-2 text-right">{f$(t.balanceAfter)}</td>
                        <td className="py-2 text-center">
                          <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium border ${
                            win
                              ? "bg-green-900/40 text-green-400 border-green-800"
                              : "bg-red-900/40 text-red-400 border-red-800"
                          }`}>
                            {win ? "WIN" : "LOSS"}
                          </span>
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
    </div>
  );
}
