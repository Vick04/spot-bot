// Seed watchlist
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

async function main() {
  // Clear existing
  await prisma.watchlist.deleteMany({});

  // Add symbols
  const symbols = [
    { symbol: "BTCUSDT", downCond2: 0.97, upCond2: 1.018, downSell: 1.009, upSell: 1.010 },
    { symbol: "ETHUSDT", downCond2: 0.964, upCond2: 1.012, downSell: 1.007, upSell: 1.009 },
    { symbol: "BNBUSDT", downCond2: 0.966, upCond2: 1.014, downSell: 1.007, upSell: 1.008 },
  ];

  for (const { symbol, downCond2, upCond2, downSell, upSell } of symbols) {
    await prisma.watchlist.create({
      data: {
        symbol,
        params: { downCond2, upCond2, downSell, upSell },
        active: true,
      },
    });
    console.log(`✓ ${symbol}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
