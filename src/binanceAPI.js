// ─────────────────────────────────────────────
// src/binanceAPI.js
// Binance API utilities for fetching klines
// Filters out: recently listed, inactive, and extremely volatile symbols
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
      takerBuyBaseAssetVolume: parseFloat(kline[9]), // Buy volume for buy ratio calculation
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
 * Fetch exchange info and check for restricted/under-review symbols
 * @returns {Promise<Map<string, Object>>} Map of symbol to restrictions info
 */
async function getSymbolRestrictions() {
  try {
    const response = await retryRequest(async () => {
      return await binanceClient.get("/api/v3/exchangeInfo");
    });

    const restrictions = new Map();
    if (response.data.symbols) {
      response.data.symbols.forEach((symbol) => {
        if (!symbol.symbol) return;

        restrictions.set(symbol.symbol, {
          status: symbol.status,
          isSpotTradingAllowed: symbol.isSpotTradingAllowed !== false,
          icebergAllowed: symbol.icebergAllowed !== false,
          ocoAllowed: symbol.ocoAllowed !== false,
          restrictions: symbol.restrictions ? symbol.restrictions.length : 0,
          underReview: symbol.status !== "TRADING" || !symbol.isSpotTradingAllowed,
        });
      });
    }
    return restrictions;
  } catch (error) {
    console.warn("[BinanceAPI] Could not fetch exchange info, skipping restriction filter:", error.message);
    return new Map();
  }
}

/**
 * Fetch all available USDT trading pairs with volume filter
 * Filters out symbols with no active orders (delisted/inactive) and recently listed symbols
 * @param {number} minVolume - Minimum 24h volume in USDT (default: 1M)
 * @param {number} minListingAgeDays - Minimum days since listing (default: 30)
 * @returns {Promise<Array>} Array of symbols
 */
async function getAvailableSymbols(minVolume = 1_000_000, minListingAgeDays = 30) {
  try {
    // Check cache first
    const cachedSymbols = loadSymbolsFromCache();
    if (cachedSymbols) {
      console.log("[BinanceAPI] Using cached symbols (same day)");
      return cachedSymbols;
    }

    console.log("[BinanceAPI] Cache invalid/missing, fetching from Binance...");
    const tickerResponse = await retryRequest(async () => {
      return await binanceClient.get("/api/v3/ticker/24hr");
    });

    // Get exchange info to filter restricted symbols
    console.log("[BinanceAPI] Fetching exchange info to filter restricted/under-review symbols...");
    const symbolRestrictions = await getSymbolRestrictions();

    const now = Date.now();
    const minListingAgeMs = minListingAgeDays * 24 * 60 * 60 * 1000;

    const filtered = tickerResponse.data
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
        if (vol < minVolume) {
          return false;
        }

        // Filter out symbols with extreme volatility (potential "En observación" candidates)
        // Typically, recently listed coins have: changePercent24h > 50% or < -30%
        const changePercent = parseFloat(ticker.priceChangePercent || 0);
        if (Math.abs(changePercent) > 100) {
          console.log(`[BinanceAPI] Excluding ${ticker.symbol} - Extreme volatility: ${changePercent.toFixed(2)}%`);
          return false;
        }

        // Check symbol restrictions (CRITICAL: Status not TRADING or Spot trading disabled)
        const restrictions = symbolRestrictions.get(ticker.symbol);
        if (restrictions) {
          // CRITICAL: Block symbols not in TRADING status or with spot trading disabled
          if (!restrictions.isSpotTradingAllowed) {
            console.log(`[BinanceAPI] Excluding ${ticker.symbol} - Spot trading DISABLED (under review/restricted)`);
            return false;
          }

          if (restrictions.underReview) {
            console.log(`[BinanceAPI] Excluding ${ticker.symbol} - Status: ${restrictions.status} (under review)`);
            return false;
          }

          // WARNING: Log symbols with order restrictions (but don't exclude)
          if (restrictions.restrictions > 0) {
            console.log(`[BinanceAPI] ⚠️ WARNING: ${ticker.symbol} has ${restrictions.restrictions} restriction(s)`);
          }
        }

        return true;
      })
      .map((ticker) => ticker.symbol)
      .sort();

    console.log(
      `[BinanceAPI] Found ${filtered.length} symbols with volume >= ${minVolume.toLocaleString()} ` +
      `(excluded: inactive, under-review, restricted, extremely volatile, low-volume)`
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
  getSymbolRestrictions,
};
