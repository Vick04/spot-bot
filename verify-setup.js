#!/usr/bin/env node
// Comprehensive setup verification script
require("dotenv/config");
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

async function section(title) {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`  ${title}`);
  console.log(`${"=".repeat(60)}\n`);
}

async function main() {
  try {
    await section("1. DATABASE CONNECTION");
    console.log(`DATABASE_URL: ${process.env.DATABASE_URL}`);

    // Test connection
    const result = await prisma.$queryRaw`SELECT 1 as connected`;
    console.log("✅ PostgreSQL connection: OK");

    await section("2. TABLE EXISTENCE");

    // Get all tables
    const tables = await prisma.$queryRaw`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name
    `;

    const tableNames = tables.map(t => t.table_name);
    console.log(`Found ${tableNames.length} tables:`);
    tableNames.forEach(name => console.log(`  • ${name}`));

    const hasBotConfig = tableNames.includes("bot_config");
    const hasWatchlist = tableNames.includes("watchlist");
    const hasLiveSession = tableNames.includes("live_session");

    console.log(`\nRequired tables:`);
    console.log(`  ${hasBotConfig ? "✅" : "❌"} bot_config`);
    console.log(`  ${hasWatchlist ? "✅" : "❌"} watchlist`);
    console.log(`  ${hasLiveSession ? "✅" : "❌"} live_session`);

    if (!hasBotConfig || !hasWatchlist || !hasLiveSession) {
      console.log("\n⚠️  MISSING TABLES!");
      console.log("Run: npx prisma db push");
      process.exit(1);
    }

    await section("3. BOT_CONFIG TABLE CONTENTS");

    const config = await prisma.botConfig.findMany();
    console.log(`Found ${config.length} config entries:`);
    if (config.length === 0) {
      console.log("  (empty)");
    } else {
      config.forEach(c => console.log(`  ${c.key} = "${c.value}"`));
    }

    await section("4. WATCHLIST TABLE CONTENTS");

    const watchlist = await prisma.watchlist.findMany();
    console.log(`Found ${watchlist.length} symbols:`);
    if (watchlist.length === 0) {
      console.log("  (empty)");
      console.log("\n⚠️  WATCHLIST IS EMPTY!");
      console.log("Run: node seed-watchlist.js");
    } else {
      watchlist.forEach(w => console.log(`  • ${w.symbol}: active=${w.active}`));
    }

    await section("5. TEST UPSERT & READ");

    console.log("Testing config upsert...");
    const testKey = "TEST_KEY";
    const testVal = `test_${Date.now()}`;

    await prisma.botConfig.upsert({
      where: { key: testKey },
      update: { value: testVal },
      create: { key: testKey, value: testVal },
    });
    console.log(`  ✓ Upserted ${testKey} = ${testVal}`);

    const read = await prisma.botConfig.findUnique({
      where: { key: testKey },
    });

    if (read && read.value === testVal) {
      console.log(`  ✓ Read back successfully: ${read.value}`);
    } else {
      console.log(`  ❌ Read mismatch!`);
      process.exit(1);
    }

    await prisma.botConfig.delete({ where: { key: testKey } });
    console.log(`  ✓ Cleaned up test record`);

    await section("6. INITIALIZE DEFAULT CONFIG");

    const defaults = {
      UP_MAX_STREAK: "1",
      DAILY_MAX_TRADES: "2",
      DAILY_MAX_PNL_PCT: "5",
      FEE_RATE: "0.001",
      INITIAL_BALANCE_USDT: "100",
    };

    for (const [key, val] of Object.entries(defaults)) {
      await prisma.botConfig.upsert({
        where: { key },
        update: { value: val },
        create: { key, value: val },
      });
      console.log(`  ✓ ${key} = ${val}`);
    }

    // Verify
    const final = await prisma.botConfig.findMany();
    console.log(`\n  Final config in database:`);
    final.forEach(c => console.log(`    ${c.key} = "${c.value}"`));

    await section("7. SUMMARY");
    console.log("✅ Database setup verified!");
    console.log("\nNow you can:");
    console.log("  npm run live:multi       (in Terminal 1)");
    console.log("  npm run api:multi        (in Terminal 2)");
    console.log("  npm run --prefix client dev  (in Terminal 3)");

  } catch (error) {
    console.error("\n❌ ERROR:", error.message);
    if (error.code === "ECONNREFUSED") {
      console.error("\nPostgreSQL is not running!");
      console.error("Start PostgreSQL:");
      console.error("  macOS: brew services start postgresql");
      console.error("  Linux: sudo systemctl start postgresql");
      console.error("  Windows: Check Services > PostgreSQL");
    } else if (error.code === "3D000") {
      console.error("\nDatabase 'spotbot' does not exist!");
      console.error("Create it: createdb spotbot");
    }
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
