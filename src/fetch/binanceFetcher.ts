// ─────────────────────────────────────────────
// src/fetch/binanceFetcher.ts
// Fetches raw OHLCV klines from Binance REST API
// ─────────────────────────────────────────────

import axios from "axios";
import {
  BINANCE_BASE_URL,
  BINANCE_LIMIT,
  FETCH_DELAY_MS,
  Timeframe,
} from "../config/constants";

/** Raw kline row as returned by Binance */
export interface RawKline {
  openTime:  number;
  open:      number;
  high:      number;
  low:       number;
  close:     number;
  volume:    number;
  closeTime: number;
}

/** Sleep helper */
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Fetch a single page of klines from Binance.
 * @param symbol   e.g. "BTCUSDT"
 * @param interval e.g. "1m"
 * @param startMs  UTC epoch ms (inclusive)
 * @param endMs    UTC epoch ms (inclusive)
 */
async function fetchKlinePage(
  symbol: string,
  interval: Timeframe,
  startMs: number,
  endMs: number
): Promise<RawKline[]> {
  const url = `${BINANCE_BASE_URL}/api/v3/klines`;
  const params = {
    symbol,
    interval,
    startTime: startMs,
    endTime:   endMs,
    limit:     BINANCE_LIMIT,
  };

  const { data } = await axios.get<unknown[][]>(url, { params });

  return data.map((row) => ({
    openTime:  Number(row[0]),
    open:      parseFloat(row[1] as string),
    high:      parseFloat(row[2] as string),
    low:       parseFloat(row[3] as string),
    close:     parseFloat(row[4] as string),
    volume:    parseFloat(row[5] as string),
    closeTime: Number(row[6]),
  }));
}

/**
 * Fetch ALL klines for a given symbol/interval between startMs and endMs.
 * Paginates automatically and applies a delay between requests.
 */
export async function fetchAllKlines(
  symbol: string,
  interval: Timeframe,
  startMs: number,
  endMs: number,
  onProgress?: (fetched: number) => void
): Promise<RawKline[]> {
  const result: RawKline[] = [];
  let cursor = startMs;

  while (cursor <= endMs) {
    const page = await fetchKlinePage(symbol, interval, cursor, endMs);
    if (page.length === 0) break;

    result.push(...page);
    onProgress?.(result.length);

    const lastCandle = page[page.length - 1];
    cursor = lastCandle.openTime + 1; // advance past last fetched candle

    if (page.length < BINANCE_LIMIT) break; // last page
    await sleep(FETCH_DELAY_MS);
  }

  return result;
}
