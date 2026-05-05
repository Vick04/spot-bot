// ─────────────────────────────────────────────
// src/db/prismaClient.ts
// Singleton PrismaClient instance
// ─────────────────────────────────────────────

import { PrismaClient } from "@prisma/client";

// Singleton pattern: reuse across hot reloads in dev
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma: PrismaClient =
  globalForPrisma.prisma ?? new PrismaClient({ log: ["warn", "error"] });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
