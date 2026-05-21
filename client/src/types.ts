export interface SymbolParams {
  downCond2: number;
  upCond2: number;
  downSell: number;
  upSell: number;
}

export interface WatchlistItem {
  symbol: string;
  params: SymbolParams;
  lastPrice: number | null;
  active: boolean;
}

export interface BotConfig {
  UP_MAX_STREAK: number;
  DAILY_MAX_TRADES: number;
  DAILY_MAX_PNL_PCT: number;
  FEE_RATE: number;
  INITIAL_BALANCE_USDT: number;
}

export interface DailyStats {
  day: string;
  trades: number;
  pnlPct: number;
}

export interface ActiveTrade {
  symbol: string;
  buyPrice: number;
  buyTime: number;
  usdtSpent: number;
  currentPrice: number | null;
  strategy: "up" | "down" | null;
  sellTarget: number;
  sellMult: number;
  pnlUsd: number | null;
  pnlPct: number | null;
}

export interface Status {
  running: boolean;
  sessionId: number;
  balance: number;
  dailyStats: DailyStats;
  activeTrade: ActiveTrade | null;
  stats: {
    totalClosedTrades: number;
    totalPnl: number;
    winRate: number;
  };
  config: BotConfig;
}

export interface Trade {
  id: number;
  sessionId: number;
  symbol: string;
  buyTime: string;
  buyPrice: number;
  usdtSpent: number;
  btcGross: number;
  feeBtc: number;
  btcNet: number;
  sellTime: string | null;
  sellPrice: number | null;
  usdtGross: number | null;
  feeUsdt: number | null;
  usdtNet: number | null;
  pnlUsdt: number | null;
  pnlPct: number | null;
  balanceAfter: number | null;
}
