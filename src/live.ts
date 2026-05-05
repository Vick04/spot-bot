// ─────────────────────────────────────────────
// src/live.ts
// Entry point for the live trading engine.
// Run with: npm run live
// ─────────────────────────────────────────────

import "dotenv/config";
import { runLiveEngine } from "./live/liveEngine";

// Prevent uncaught errors from crashing the process
process.on("uncaughtException", (err) => {
  console.error("[Fatal] Uncaught exception:", err.message);
  // Don't exit — let the WS reconnect logic handle recovery
});

process.on("unhandledRejection", (reason) => {
  console.error("[Fatal] Unhandled rejection:", reason);
  // Don't exit — log and continue
});

runLiveEngine().catch((err) => {
  console.error("[Fatal] Engine startup failed:", err);
  process.exit(1);
});
