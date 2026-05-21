import { prisma } from "./src/db/prismaClient";

async function seedConfig() {
  console.log("Checking botConfig...");

  const existing = await prisma.botConfig.findMany();
  console.log("Current config:", existing);

  if (existing.length === 0) {
    console.log("\n🌱 Seeding botConfig...");
    const defaults = [
      { key: "UP_MAX_STREAK", value: "1" },
      { key: "DAILY_MAX_TRADES", value: "2" },
      { key: "DAILY_MAX_PNL_PCT", value: "12.5" },
      { key: "FEE_RATE", value: "0.00075" },
      { key: "INITIAL_BALANCE_USDT", value: "10000" },
    ];

    for (const cfg of defaults) {
      await prisma.botConfig.upsert({
        where: { key: cfg.key },
        update: { value: cfg.value },
        create: { key: cfg.key, value: cfg.value },
      });
      console.log(`✅ ${cfg.key} = ${cfg.value}`);
    }
  }

  const final = await prisma.botConfig.findMany();
  console.log("\n✅ Final config:", final);

  await prisma.$disconnect();
}

seedConfig().catch(e => {
  console.error("Error:", e);
  process.exit(1);
});
