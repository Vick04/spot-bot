// ─────────────────────────────────────────────
// src/utils/timeUtils.ts
// Time and timezone utilities for GMT-3 (South America)
// ─────────────────────────────────────────────

import { GMT3_OFFSET_MS } from "../config/constants";

/**
 * Get date string in GMT-3 timezone
 * Returns YYYY-MM-DD format for the date in GMT-3
 * @param timeMs - Unix timestamp in milliseconds
 * @returns Date string in YYYY-MM-DD format
 */
export function dayGMT3(timeMs: number): string {
  return new Date(timeMs + GMT3_OFFSET_MS).toISOString().slice(0, 10);
}

/**
 * Get current date in GMT-3 timezone
 * @returns Current date string in YYYY-MM-DD format
 */
export function todayGMT3(): string {
  return dayGMT3(Date.now());
}

/**
 * Convert unix timestamp to Date object adjusted for GMT-3
 * @param timeMs - Unix timestamp in milliseconds
 * @returns Date object in GMT-3
 */
export function toDateGMT3(timeMs: number): Date {
  return new Date(timeMs + GMT3_OFFSET_MS);
}

/**
 * Convert Date to unix timestamp accounting for GMT-3
 * @param date - Date object in GMT-3
 * @returns Unix timestamp in milliseconds
 */
export function fromDateGMT3(date: Date): number {
  return date.getTime() - GMT3_OFFSET_MS;
}

/**
 * Get midnight timestamp of the current GMT-3 day
 * Returns the unix timestamp for 00:00:00 in GMT-3 today
 * @returns Unix timestamp in milliseconds
 */
export function midnightGMT3Today(): number {
  const now = Date.now();
  const today = dayGMT3(now);
  // Parse YYYY-MM-DD and convert back to midnight timestamp
  const [year, month, day] = today.split("-");
  const dateStr = `${year}-${month}-${day}T00:00:00Z`;
  return new Date(dateStr).getTime() - GMT3_OFFSET_MS;
}

/**
 * Check if two timestamps are on the same day in GMT-3
 * @param ts1 - First timestamp in milliseconds
 * @param ts2 - Second timestamp in milliseconds
 * @returns True if both timestamps are on the same GMT-3 day
 */
export function isSameDayGMT3(ts1: number, ts2: number): boolean {
  return dayGMT3(ts1) === dayGMT3(ts2);
}

/**
 * Get time since midnight in GMT-3 (current day)
 * @param timeMs - Unix timestamp in milliseconds (default: now)
 * @returns Milliseconds since midnight GMT-3 today
 */
export function timeSinceMidnightGMT3(timeMs: number = Date.now()): number {
  const midnight = midnightGMT3Today();
  return timeMs - midnight;
}

/**
 * Format timestamp as ISO string in GMT-3
 * @param timeMs - Unix timestamp in milliseconds
 * @returns ISO string representation in GMT-3 (YYYY-MM-DD HH:mm:ss)
 */
export function formatTimeGMT3(timeMs: number): string {
  const date = new Date(timeMs + GMT3_OFFSET_MS);
  const iso = date.toISOString();
  // Convert to YYYY-MM-DD HH:mm:ss format
  return iso.slice(0, 19).replace("T", " ");
}

/**
 * Sleep for specified milliseconds
 * @param ms - Milliseconds to sleep
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Get milliseconds until next candle closes
 * Assumes 1-minute candles
 * @param timeMs - Current timestamp in milliseconds (default: now)
 * @returns Milliseconds until next minute boundary
 */
export function msUntilNextCandle(timeMs: number = Date.now()): number {
  const nextCandle = Math.ceil(timeMs / 60_000) * 60_000;
  return nextCandle - timeMs;
}
