// Test what multiLiveManager loads as config
require("dotenv/config");

const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function main() {
  console.log("\n=== MANAGER CONFIG DIAGNOSTIC ===\n");

  try {
    // Read raw config from database
    console.log("1. Raw config from database:");
    const dbConfig = await prisma.botConfig.findMany();
    console.log("   ", JSON.stringify(dbConfig, null, 2));

    // Show what the constants define as defaults
    console.log("\n2. Default config values (from code):");
    console.log(`   UP_MAX_STREAK: 1`);
    console.log(`   DAILY_MAX_TRADES: 2`);
    console.log(`   DAILY_MAX_PNL_PCT: 5`);
    console.log(`   FEE_RATE: 0.001`);
    console.log(`   INITIAL_BALANCE_USDT: 100`);

    // Simulate what multiLiveManager._loadConfig() would do
    console.log("\n3. Simulating multiLiveManager._loadConfig():");
    const DEFAULT_CONFIG = {
      UP_MAX_STREAK: 1,
      DAILY_MAX_TRADES: 2,
      DAILY_MAX_PNL_PCT: 5,
      FEE_RATE: 0.001,
      INITIAL_BALANCE_USDT: 100,
    };

    const config = { ...DEFAULT_CONFIG };
    for (const row of dbConfig) {
      if (row.key in config) {
        const parsed = parseFloat(row.value);
        config[row.key] = isNaN(parsed) ? row.value : parsed;
        console.log(`   ${row.key}: ${row.value} → ${config[row.key]}`);
      }
    }

    console.log("\n   Final config object:", config);

    // Test upsert
    console.log("\n4. Testing upsert of actual config values:");
    const testUpdate = {
      UP_MAX_STREAK: "2",
      DAILY_MAX_TRADES: "5",
    };

    for (const [key, val] of Object.entries(testUpdate)) {
      const result = await prisma.botConfig.upsert({
        where: { key },
        update: { value: val },
        create: { key, value: val },
      });
      console.log(`   ✓ ${key} = ${val} (${result.value})`);
    }

    // Read back
    console.log("\n5. Reading back after upsert:");
    const after = await prisma.botConfig.findMany();
    console.log("   ", JSON.stringify(after, null, 2));

    // Restore original values
    console.log("\n6. Restoring to defaults...");
    for (const [key, val] of Object.entries(DEFAULT_CONFIG)) {
      await prisma.botConfig.upsert({
        where: { key },
        update: { value: String(val) },
        create: { key, value: String(val) },
      });
    }
    console.log("   ✓ Restored");

    console.log("\n=== DIAGNOSTIC COMPLETE ===\n");
  } catch (error) {
    console.error("\n❌ Error:", error.message);
  } finally {
    await prisma.$disconnect();
  }
}

main();
