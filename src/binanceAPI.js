// ─────────────────────────────────────────────
// src/binanceAPI.js
// Binance API utilities for fetching klines
// ─────────────────────────────────────────────

const axios = require("axios");
const fs = require("fs");
const path = require("path");

const BINANCE_BASE_URL = "https://api.binance.com";
const FETCH_DELAY_MS = 100; // Delay between requests to avoid rate limiting
const SYMBOLS_CACHE_FILE = path.join(__dirname, "../symbols.json");

/**
 * Check if cache file is from today
 * @returns {boolean} True if file exists and is from today
 */
function isCacheValid() {
  if (!fs.existsSync(SYMBOLS_CACHE_FILE)) {
    return false;
  }

  const stats = fs.statSync(SYMBOLS_CACHE_FILE);
  const modifiedTime = new Date(stats.mtime);
  const today = new Date();

  // Check if file was modified today (same day, month, year)
  return (
    modifiedTime.getFullYear() === today.getFullYear() &&
    modifiedTime.getMonth() === today.getMonth() &&
    modifiedTime.getDate() === today.getDate()
  );
}

/**
 * Load symbols from cache file
 * @returns {Array<string>|null} Array of symbols or null if cache invalid
 */
function loadSymbolsFromCache() {
  if (!isCacheValid()) {
    return null;
  }

  try {
    const data = fs.readFileSync(SYMBOLS_CACHE_FILE, "utf8");
    const { symbols, timestamp } = JSON.parse(data);
    console.log(`[BinanceAPI] Loaded ${symbols.length} symbols from cache (${new Date(timestamp).toISOString()})`);
    return symbols;
  } catch (error) {
    console.error("[BinanceAPI] Error loading cache:", error.message);
    return null;
  }
}

/**
 * Save symbols to cache file
 * @param {Array<string>} symbols - Array of symbol strings
 */
function saveSymbolsToCache(symbols) {
  try {
    const data = {
      symbols,
      timestamp: new Date().toISOString(),
      count: symbols.length,
    };
    fs.writeFileSync(SYMBOLS_CACHE_FILE, JSON.stringify(data, null, 2));
    console.log(`[BinanceAPI] Cached ${symbols.length} symbols to ${SYMBOLS_CACHE_FILE}`);
  } catch (error) {
    console.error("[BinanceAPI] Error saving cache:", error.message);
  }
}

// Create axios instance with proper headers
const binanceClient = axios.create({
  baseURL: BINANCE_BASE_URL,
  timeout: 10000,
  headers: {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
    "Accept": "application/json",
    "Accept-Language": "en-US,en;q=0.9",
  },
});

/**
 * Retry logic for failed requests
 * @param {Function} fn - Async function to retry
 * @param {number} maxRetries - Maximum number of retries (default: 3)
 * @returns {Promise} Result of function
 */
async function retryRequest(fn, maxRetries = 3) {
  let lastError;
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      const statusCode = error.response?.status;

      // Don't retry on 4xx errors except 429 (rate limit)
      if (statusCode && statusCode >= 400 && statusCode < 500 && statusCode !== 429) {
        throw error;
      }

      // Wait before retrying (exponential backoff)
      const delay = Math.min(1000 * Math.pow(2, i), 10000);
      console.log(`[BinanceAPI] Retry attempt ${i + 1}/${maxRetries} after ${delay}ms (Status: ${statusCode})`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  throw lastError;
}

/**
 * Fetch klines (candles) for a symbol
 * @param {string} symbol - Trading pair (e.g., "BTCUSDT")
 * @param {number} limit - Number of candles to fetch (default: 60 for 1 hour)
 * @param {string} interval - Timeframe (default: "1m")
 * @returns {Promise<Array>} Array of klines
 */
async function fetchKlines(symbol, limit = 60, interval = "1m") {
  try {
    const response = await retryRequest(async () => {
      return await binanceClient.get("/api/v3/klines", {
        params: {
          symbol,
          interval,
          limit,
        },
      });
    });

    // Convert raw Binance format to normalized format
    return response.data.map((kline) => ({
      openTime: Number(kline[0]),
      open: parseFloat(kline[1]),
      high: parseFloat(kline[2]),
      low: parseFloat(kline[3]),
      close: parseFloat(kline[4]),
      volume: parseFloat(kline[5]),
      closeTime: Number(kline[6]),
      quoteAssetVolume: parseFloat(kline[7]),
    }));
  } catch (error) {
    console.error(`[BinanceAPI] Error fetching klines for ${symbol}:`, error.message);
    throw error;
  }
}

/**
 * Fetch 24h ticker data for all symbols
 * @returns {Promise<Array>} Array of ticker data
 */
async function fetch24hTicker() {
  try {
    const response = await retryRequest(async () => {
      return await binanceClient.get("/api/v3/ticker/24hr");
    });

    // Filter for USDT pairs only (most liquid)
    return response.data
      .filter((ticker) => ticker.symbol && ticker.symbol.endsWith("USDT"))
      .map((ticker) => ({
        symbol: ticker.symbol,
        priceChangePercent: parseFloat(ticker.priceChangePercent || 0),
        lastPrice: parseFloat(ticker.lastPrice || 0),
        highPrice: parseFloat(ticker.highPrice || 0),
        lowPrice: parseFloat(ticker.lowPrice || 0),
        quoteAssetVolume: parseFloat(ticker.quoteVolume || 0),
      }));
  } catch (error) {
    console.error("[BinanceAPI] Error fetching 24h ticker:", error.message);
    throw error;
  }
}

/**
 * Fetch all available USDT trading pairs with volume filter
 * Filters out symbols with no active orders (delisted/inactive)
 * @param {number} minVolume - Minimum 24h volume in USDT (default: 10k)
 * @returns {Promise<Array>} Array of symbols
 */
async function getAvailableSymbols(minVolume = 10000) {
  try {
    // Check cache first
    const cachedSymbols = loadSymbolsFromCache();
    if (cachedSymbols) {
      console.log("[BinanceAPI] Using cached symbols (same day)");
      return cachedSymbols;
    }

    console.log("[BinanceAPI] Cache invalid/missing, fetching from Binance...");
    const response = await retryRequest(async () => {
      return await binanceClient.get("/api/v3/ticker/24hr");
    });

    const filtered = response.data
      .filter((ticker) => {
        // Only USDT pairs
        if (!ticker.symbol || !ticker.symbol.endsWith("USDT")) {
          return false;
        }
        // Only symbols with active orders (bid/ask prices > 0)
        const bidPrice = parseFloat(ticker.bidPrice || 0);
        const askPrice = parseFloat(ticker.askPrice || 0);
        if (bidPrice === 0 || askPrice === 0) {
          return false;
        }
        // Minimum volume threshold
        const vol = parseFloat(ticker.quoteVolume || 0);
        return vol >= minVolume;
      })
      .map((ticker) => ticker.symbol)
      .sort();

    console.log(
      `[BinanceAPI] Found ${filtered.length} symbols with volume >= ${minVolume.toLocaleString()} (excluding inactive symbols)`
    );

    // Save to cache for reuse today
    saveSymbolsToCache(filtered);

    return filtered;
  } catch (error) {
    console.error("[BinanceAPI] Error getting available symbols:", error.message);

    // If API fails but we have stale cache, use it as fallback
    const fallbackSymbols = loadSymbolsFromCache();
    if (fallbackSymbols) {
      console.log("[BinanceAPI] API failed, using stale cache as fallback");
      return fallbackSymbols;
    }

    throw error;
  }
}

module.exports = {
  fetchKlines,
  fetch24hTicker,
  getAvailableSymbols,
};
