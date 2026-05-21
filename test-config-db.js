// Test database connectivity and config upsert
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

async function main() {
  console.log("\n=== DATABASE DIAGNOSTIC ===\n");

  try {
    // Test 1: List all tables
    console.log("1. Listing all tables in database...");
    const tables = await prisma.$queryRaw`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name
    `;
    console.log("   Tables found:", tables.map(t => t.table_name));

    // Test 2: Check bot_config table
    const botConfigExists = tables.some(t => t.table_name === "bot_config");
    console.log(`\n2. bot_config table exists: ${botConfigExists}`);

    if (botConfigExists) {
      // Test 3: Read current config
      console.log("\n3. Current bot_config contents:");
      const current = await prisma.botConfig.findMany();
      console.log("   ", JSON.stringify(current, null, 2));

      // Test 4: Attempt upsert with test data
      console.log("\n4. Testing upsert operation...");
      const testKey = "TEST_CONFIG_KEY";
      const testValue = `test_value_${Date.now()}`;

      console.log(`   Upserting ${testKey} = ${testValue}`);
      const result = await prisma.botConfig.upsert({
        where: { key: testKey },
        update: { value: testValue },
        create: { key: testKey, value: testValue },
      });
      console.log("   Upsert result:", result);

      // Test 5: Verify write
      console.log("\n5. Verifying write...");
      const verify = await prisma.botConfig.findUnique({
        where: { key: testKey },
      });
      console.log("   Read back from DB:", verify);

      if (verify && verify.value === testValue) {
        console.log("   ✅ Upsert works correctly!");
      } else {
        console.log("   ❌ Upsert failed or data mismatch!");
      }

      // Test 6: Update the value again
      console.log("\n6. Testing update (second upsert)...");
      const newValue = `updated_${Date.now()}`;
      console.log(`   Upserting ${testKey} = ${newValue}`);
      const result2 = await prisma.botConfig.upsert({
        where: { key: testKey },
        update: { value: newValue },
        create: { key: testKey, value: newValue },
      });
      console.log("   Upsert result:", result2);

      const verify2 = await prisma.botConfig.findUnique({
        where: { key: testKey },
      });
      console.log("   Read back from DB:", verify2);

      // Test 7: Clean up test data
      console.log("\n7. Cleaning up test data...");
      await prisma.botConfig.delete({ where: { key: testKey } });
      console.log("   ✓ Test record deleted");

      console.log("\n=== ALL TESTS COMPLETE ===\n");
    } else {
      console.log("   ❌ bot_config table NOT found!");
      console.log("   Fix: Run 'npx prisma db push' to create the table");
    }
  } catch (error) {
    console.error("\n❌ Error:", error.message);
    console.error("\nFull error:", error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
