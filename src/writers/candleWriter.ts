// ─────────────────────────────────────────────
// src/writers/candleWriter.ts
// Persists ProcessedCandle[] to the correct Prisma table
// Uses batched upserts to avoid memory pressure
// ─────────────────────────name───────────────────────

import { prisma }          from "../db/prismaClient";
import { ProcessedCandle } from "../processors/candleProcessor";
import { Timeframe }       from "../config/constants";

/** Batch size for createMany operations */
const BATCH_SIZE = 500;

type CandleDelegate = {
  createMany: (args: {
    data: ProcessedCandle[];
    skipDuplicates: boolean;
  }) => Promise<{ count: number }>;
};

/** Map timeframe to the correct Prisma model delegate */
function getDelegate(tf: Timeframe): CandleDelegate {
  switch (tf) {
    case "1s":  return prisma.candle1s  as unknown as CandleDelegate;
    case "1m":  return prisma.candle1m  as unknown as CandleDelegate;
    case "15m": return prisma.candle15m as unknown as CandleDelegate;
    case "1h":  return prisma.candle1h  as unknown as CandleDelegate;
  }
}

/**
 * Write processed candles to the DB in batches.
 * Uses skipDuplicates so it is safe to re-run.
 *
 * @returns Total rows inserted
 */
export async function writeCandles(
  tf: Timeframe,
  candles: ProcessedCandle[],
  onBatch?: (written: number, total: number) => void
): Promise<number> {
  const delegate = getDelegate(tf);
  let totalWritten = 0;

  for (let i = 0; i < candles.length; i += BATCH_SIZE) {
    const batch = candles.slice(i, i + BATCH_SIZE);
    const { count } = await delegate.createMany({
      data: batch,
      skipDuplicates: true,
    });
    totalWritten += count;
    onBatch?.(totalWritten, candles.length);
  }

  return totalWritten;
}
