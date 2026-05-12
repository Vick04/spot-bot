export interface Status {
  running: boolean;
  session?: {
    id: number;
    startedAt: string;
    endedAt: string | null;
    initialBalance: number;
    currentBalance: number;
    feeRate: number;
  };
  stats?: {
    totalTrades: number;
    openPosition: boolean;
    winRate: number;
    totalPnl: number;
    totalFees: number;
  };
  openPosition?: {
    buyTime: string;
    buyPrice: number;
    usdtSpent: number;
    btcNet: number;
  } | null;
}

export interface Trade {
  id: number;
  sessionId: number;
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
