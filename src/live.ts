// ─────────────────────────────────────────────
// src/live.ts
// Entry point for the live trading engine.
// Run with: npm run live
// ─────────────────────────────────────────────

import "dotenv/config";
// DEPRECATED: Use src/entries/live.ts instead
// import { runLiveEngine } from "./live/liveEngine";

// Prevent uncaught errors from crashing the process
process.on("uncaughtException", (err: any) => {
  console.error("[Fatal] Uncaught exception:", err.message);
  // Don't exit — let the WS reconnect logic handle recovery
});

process.on("unhandledRejection", (reason: any) => {
  console.error("[Fatal] Unhandled rejection:", reason);
  // Don't exit — log and continue
});

console.warn("[Deprecated] This entry point is deprecated. Use: npm run live:api or npm run live");
// runLiveEngine().catch((err) => {
//   console.error("[Fatal] Engine startup failed:", err);
//   process.exit(1);
// });
