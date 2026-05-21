// ─────────────────────────────────────────────
// src/utils/formatters.ts
// Consolidated formatting utilities for numbers, dates, and currencies
// ─────────────────────────────────────────────

import { formatTimeGMT3 } from "./timeUtils";

/**
 * Format number with fixed decimal places
 * @param n - Number to format
 * @param decimals - Number of decimal places (default: 2)
 * @returns Formatted number string
 */
export function fmtN(n: number, decimals = 2): string {
  return n.toFixed(decimals);
}

/**
 * Format date/timestamp as readable string in GMT-3
 * @param ts - Unix timestamp in milliseconds
 * @returns Date string in format: "YYYY-MM-DD HH:mm:ss GMT-3"
 */
export function fmtDate(ts: number): string {
  return formatTimeGMT3(ts) + " GMT-3";
}

/**
 * Format signed currency value with $ and +/- sign
 * @param n - Value to format
 * @returns Formatted string like "+$123.45" or "-$45.67"
 */
export function fmtSign(n: number): string {
  return (n >= 0 ? "+" : "") + "$" + n.toFixed(2);
}

/**
 * Format percentage with sign and 3 decimal places
 * @param n - Percentage value (e.g., 5.123 for 5.123%)
 * @returns Formatted string like "+5.123%" or "-2.456%"
 */
export function fmtPercent(n: number): string {
  return (n >= 0 ? "+" : "") + n.toFixed(3) + "%";
}

/**
 * Format percentage with 2 decimal places
 * @param n - Percentage value
 * @returns Formatted string like "+5.12%" or "-2.46%"
 */
export function fmtPercent2(n: number): string {
  return (n >= 0 ? "+" : "") + n.toFixed(2) + "%";
}

/**
 * Format BTC amount with 8 decimal places
 * @param btc - BTC amount
 * @returns Formatted string with 8 decimals
 */
export function fmtBTC(btc: number): string {
  return btc.toFixed(8);
}

/**
 * Format large numbers with thousand separators
 * @param n - Number to format
 * @param decimals - Number of decimal places (default: 2)
 * @returns Formatted string with commas
 */
export function fmtLargeNumber(n: number, decimals = 2): string {
  return n.toFixed(decimals).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/**
 * Format USDT amount with currency symbol
 * @param usdt - USDT amount
 * @returns Formatted string like "$1,234.56"
 */
export function fmtUSDT(usdt: number): string {
  return "$" + fmtLargeNumber(usdt, 2);
}

/**
 * Format status text with emoji indicators
 * @param status - Status text
 * @param success - Whether status is successful
 * @returns Formatted string with emoji
 */
export function fmtStatus(status: string, success: boolean): string {
  return (success ? "✅" : "❌") + " " + status;
}

/**
 * Truncate string to max length with ellipsis
 * @param str - String to truncate
 * @param maxLen - Maximum length
 * @returns Truncated string
 */
export function fmtTruncate(str: string, maxLen: number): string {
  return str.length > maxLen ? str.slice(0, maxLen - 3) + "..." : str;
}

/**
 * Format win rate percentage
 * @param wins - Number of winning trades
 * @param total - Total number of trades
 * @returns Formatted string like "75.50%"
 */
export function fmtWinRate(wins: number, total: number): string {
  if (total === 0) return "0.00%";
  const rate = (wins / total) * 100;
  return rate.toFixed(2) + "%";
}

/**
 * Create colored/formatted status bar for terminal output
 * @param value - Current value
 * @param max - Maximum value
 * @param width - Width of bar (default: 20)
 * @returns String representation of bar
 */
export function fmtProgressBar(value: number, max: number, width = 20): string {
  const percent = Math.min(max > 0 ? (value / max) * 100 : 0, 100);
  const filled = Math.round((percent / 100) * width);
  const empty = width - filled;
  return "[" + "█".repeat(filled) + "░".repeat(empty) + "]";
}
