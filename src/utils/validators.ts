// ─────────────────────────────────────────────
// src/utils/validators.ts
// Input validation helpers for trading parameters
// ─────────────────────────────────────────────

/**
 * Validate that a price is positive and reasonable
 * @param price - Price to validate
 * @param name - Field name for error message
 * @throws Error if price is invalid
 */
export function validatePrice(price: number, name = "price"): void {
  if (typeof price !== "number" || isNaN(price)) {
    throw new Error(`${name} must be a number`);
  }
  if (price <= 0) {
    throw new Error(`${name} must be positive, got ${price}`);
  }
  if (!isFinite(price)) {
    throw new Error(`${name} must be finite, got ${price}`);
  }
}

/**
 * Validate that a balance is non-negative
 * @param balance - Balance to validate
 * @param name - Field name for error message
 * @throws Error if balance is invalid
 */
export function validateBalance(balance: number, name = "balance"): void {
  if (typeof balance !== "number" || isNaN(balance)) {
    throw new Error(`${name} must be a number`);
  }
  if (balance < 0) {
    throw new Error(`${name} cannot be negative, got ${balance}`);
  }
  if (!isFinite(balance)) {
    throw new Error(`${name} must be finite, got ${balance}`);
  }
}

/**
 * Validate that a symbol is valid (format: XYZUSDT)
 * @param symbol - Symbol to validate
 * @throws Error if symbol is invalid
 */
export function validateSymbol(symbol: string): void {
  if (typeof symbol !== "string") {
    throw new Error("symbol must be a string");
  }
  if (!symbol.match(/^[A-Z0-9]{1,10}USDT$/)) {
    throw new Error(`Invalid symbol format: ${symbol} (expected format: XYZUSDT)`);
  }
}

/**
 * Validate timestamp
 * @param ts - Timestamp in milliseconds
 * @param name - Field name for error message
 * @throws Error if timestamp is invalid
 */
export function validateTimestamp(ts: number, name = "timestamp"): void {
  if (typeof ts !== "number" || isNaN(ts)) {
    throw new Error(`${name} must be a number`);
  }
  if (ts < 0) {
    throw new Error(`${name} cannot be negative, got ${ts}`);
  }
  // Check reasonable range (after 2009-01-01 and before 2100-01-01)
  if (ts < 1230000000000 || ts > 4102444800000) {
    throw new Error(`${name} is out of reasonable range: ${ts}`);
  }
}

/**
 * Validate percentage value
 * @param pct - Percentage value
 * @param name - Field name for error message
 * @param min - Minimum allowed percentage (default: -100)
 * @param max - Maximum allowed percentage (default: 100)
 * @throws Error if percentage is invalid
 */
export function validatePercentage(pct: number, name = "percentage", min = -100, max = 100): void {
  if (typeof pct !== "number" || isNaN(pct)) {
    throw new Error(`${name} must be a number`);
  }
  if (pct < min || pct > max) {
    throw new Error(`${name} must be between ${min}% and ${max}%, got ${pct}%`);
  }
}

/**
 * Validate configuration parameter range
 * @param value - Value to validate
 * @param min - Minimum allowed value
 * @param max - Maximum allowed value
 * @param name - Field name for error message
 * @throws Error if value is out of range
 */
export function validateRange(value: number, min: number, max: number, name = "value"): void {
  if (typeof value !== "number" || isNaN(value)) {
    throw new Error(`${name} must be a number`);
  }
  if (value < min || value > max) {
    throw new Error(`${name} must be between ${min} and ${max}, got ${value}`);
  }
}

/**
 * Validate fee rate (should be between 0 and 1%)
 * @param feeRate - Fee rate (e.g., 0.001 for 0.1%)
 * @throws Error if fee rate is invalid
 */
export function validateFeeRate(feeRate: number): void {
  validateRange(feeRate, 0, 0.01, "feeRate");
}

/**
 * Validate trading configuration values
 * @param config - Configuration object to validate
 * @throws Error if any config value is invalid
 */
export function validateTradingConfig(config: {
  upMaxStreak?: number;
  dailyMaxTrades?: number;
  dailyMaxPnlPct?: number;
  feeRate?: number;
}): void {
  if (config.upMaxStreak !== undefined) {
    validateRange(config.upMaxStreak, 0, 10, "upMaxStreak");
  }
  if (config.dailyMaxTrades !== undefined) {
    validateRange(config.dailyMaxTrades, 1, 100, "dailyMaxTrades");
  }
  if (config.dailyMaxPnlPct !== undefined) {
    validateRange(config.dailyMaxPnlPct, -100, 100, "dailyMaxPnlPct");
  }
  if (config.feeRate !== undefined) {
    validateFeeRate(config.feeRate);
  }
}

/**
 * Validate array is not empty
 * @param arr - Array to validate
 * @param name - Field name for error message
 * @throws Error if array is empty
 */
export function validateNotEmpty<T>(arr: T[], name = "array"): void {
  if (!Array.isArray(arr) || arr.length === 0) {
    throw new Error(`${name} must not be empty`);
  }
}

/**
 * Validate required field
 * @param value - Value to check
 * @param name - Field name
 * @throws Error if value is null or undefined
 */
export function validateRequired<T>(value: T | null | undefined, name = "field"): asserts value is T {
  if (value == null) {
    throw new Error(`${name} is required`);
  }
}
