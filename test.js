// ─────────────────────────────────────────────
// test.js
// Automated testing for TradingManager & OrderObservers
// ─────────────────────────────────────────────

const http = require("http");

const API_BASE = "http://localhost:4445";

// Colors for console output
const colors = {
  reset: "\x1b[0m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  cyan: "\x1b[36m",
};

let testsPassed = 0;
let testsFailed = 0;

/**
 * Helper function to make HTTP requests
 */
function makeRequest(path) {
  return new Promise((resolve, reject) => {
    const url = new URL(API_BASE + path);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method: "GET",
    };

    const req = http.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => {
        data += chunk;
      });
      res.on("end", () => {
        try {
          resolve({
            status: res.statusCode,
            data: JSON.parse(data),
          });
        } catch (e) {
          resolve({
            status: res.statusCode,
            data: data,
          });
        }
      });
    });

    req.on("error", reject);
    req.end();
  });
}

/**
 * Assert helper
 */
function assert(condition, message) {
  if (condition) {
    console.log(`  ${colors.green}✓${colors.reset} ${message}`);
    testsPassed++;
  } else {
    console.log(`  ${colors.red}✗${colors.reset} ${message}`);
    testsFailed++;
  }
}

/**
 * Test 1: Server is running
 */
async function testServerHealth() {
  console.log(`\n${colors.blue}Test 1: Server Health${colors.reset}`);
  try {
    const response = await makeRequest("/api/health");
    assert(response.status === 200, "Server responds on /api/health");
    assert(response.data.status === "ok", "Server status is 'ok'");
  } catch (error) {
    console.log(`  ${colors.red}✗ Cannot connect to server${colors.reset}`);
    console.log(`    Make sure the bot is running: npm start`);
    process.exit(1);
  }
}

/**
 * Test 2: GainersManager is initialized
 */
async function testGainersManager() {
  console.log(`\n${colors.blue}Test 2: GainersManager${colors.reset}`);
  try {
    const response = await makeRequest("/api/status");
    assert(response.status === 200, "GainersManager status endpoint works");
    assert(response.data.initialized === true, "GainersManager is initialized");
    assert(response.data.totalSymbols > 0, `GainersManager tracking ${response.data.totalSymbols} symbols`);
    assert(
      response.data.readyCount > 0,
      `${response.data.readyCount}/${response.data.totalSymbols} observers ready`
    );
  } catch (error) {
    console.log(`  ${colors.red}✗ Error: ${error.message}${colors.reset}`);
  }
}

/**
 * Test 3: TradingManager exists and has 10 observers
 */
async function testTradingManager() {
  console.log(`\n${colors.blue}Test 3: TradingManager${colors.reset}`);
  try {
    const response = await makeRequest("/api/trading/status");
    assert(response.status === 200, "TradingManager status endpoint works");
    assert(response.data.activeObservers === 10, `TradingManager has exactly 10 observers`);
    assert(Object.keys(response.data.observers).length === 10, `All 10 observers in state`);
  } catch (error) {
    console.log(`  ${colors.red}✗ Error: ${error.message}${colors.reset}`);
  }
}

/**
 * Test 4: OrderObservers have data
 */
async function testOrderObservers() {
  console.log(`\n${colors.blue}Test 4: OrderObservers Data${colors.reset}`);
  try {
    const response = await makeRequest("/api/trading/observers");
    const observers = response.data.observers;

    assert(observers.length === 10, "10 observers returned");

    if (observers.length > 0) {
      const first = observers[0];

      assert(first.symbol, `Observer has symbol: ${first.symbol}`);
      assert(["WAITING", "BOUGHT", "SOLD"].includes(first.estado), `Observer estado is valid: ${first.estado}`);
      assert(first.currentPrice > 0, `Observer has currentPrice: ${first.currentPrice.toFixed(8)}`);
      assert(first.gainer1h !== undefined, `Observer has gainer1h: ${first.gainer1h.toFixed(2)}%`);
    }
  } catch (error) {
    console.log(`  ${colors.red}✗ Error: ${error.message}${colors.reset}`);
  }
}

/**
 * Test 5: Technical Indicators
 */
async function testTechnicalIndicators() {
  console.log(`\n${colors.blue}Test 5: Technical Indicators${colors.reset}`);
  try {
    const response = await makeRequest("/api/trading/observers");
    const observers = response.data.observers;

    if (observers.length > 0) {
      const first = observers[0];

      assert(first.ma20 > 0, `MA20 calculated: ${first.ma20.toFixed(8)}`);
      assert(first.ma99 > 0, `MA99 calculated: ${first.ma99.toFixed(8)}`);
      assert(first.bbUpper > 0, `Bollinger Upper calculated: ${first.bbUpper.toFixed(8)}`);
      assert(first.bbLower > 0, `Bollinger Lower calculated: ${first.bbLower.toFixed(8)}`);
      assert(
        first.bbLower < first.bbUpper,
        `Bollinger bands valid: Lower < Upper`
      );
    }
  } catch (error) {
    console.log(`  ${colors.red}✗ Error: ${error.message}${colors.reset}`);
  }
}

/**
 * Test 6: Trading Conditions
 */
async function testTradingConditions() {
  console.log(`\n${colors.blue}Test 6: Trading Conditions${colors.reset}`);
  try {
    const response = await makeRequest("/api/trading/observers");
    const observers = response.data.observers;

    assert(
      observers.some((o) => typeof o.canBuyDOWN === "boolean"),
      "Observers evaluate canBuyDOWN condition"
    );
    assert(
      observers.some((o) => typeof o.canBuyUP === "boolean"),
      "Observers evaluate canBuyUP condition"
    );
    assert(
      observers.some((o) => typeof o.shouldSell === "boolean"),
      "Observers evaluate shouldSell condition"
    );

    const withSignals = observers.filter((o) => o.canBuyDOWN || o.canBuyUP);
    if (withSignals.length > 0) {
      console.log(
        `  ${colors.cyan}ℹ${colors.reset} ${withSignals.length} observers have active buy signals`
      );
    }
  } catch (error) {
    console.log(`  ${colors.red}✗ Error: ${error.message}${colors.reset}`);
  }
}

/**
 * Test 7: State Consistency
 */
async function testStateConsistency() {
  console.log(`\n${colors.blue}Test 7: State Consistency${colors.reset}`);
  try {
    const response = await makeRequest("/api/trading/observers");
    const observers = response.data.observers;

    observers.forEach((obs) => {
      // If estado is WAITING, no position should be open
      if (obs.estado === "WAITING") {
        assert(
          !obs.isPositionOpen,
          `${obs.symbol}: WAITING → no position open`
        );
        assert(obs.buyPrice === 0, `${obs.symbol}: buyPrice is 0`);
        assert(obs.buyStrategy === null, `${obs.symbol}: buyStrategy is null`);
      }

      // If estado is BOUGHT, position should be open
      if (obs.estado === "BOUGHT") {
        assert(obs.isPositionOpen, `${obs.symbol}: BOUGHT → position open`);
        assert(obs.buyPrice > 0, `${obs.symbol}: buyPrice > 0`);
        assert(
          ["DOWN", "UP"].includes(obs.buyStrategy),
          `${obs.symbol}: buyStrategy is valid`
        );
      }

      // upStreak should be 0 or 1
      assert(
        [0, 1].includes(obs.upStreak),
        `${obs.symbol}: upStreak is 0 or 1 (${obs.upStreak})`
      );
    });
  } catch (error) {
    console.log(`  ${colors.red}✗ Error: ${error.message}${colors.reset}`);
  }
}

/**
 * Test 8: Daily Limits
 */
async function testDailyLimits() {
  console.log(`\n${colors.blue}Test 8: Daily Limits${colors.reset}`);
  try {
    const response = await makeRequest("/api/trading/status");

    const dailyTrades = response.data.dailyTrades || {};
    const dailyPnL = response.data.dailyPnL || {};

    assert(typeof dailyTrades === "object", "Daily trades tracking exists");
    assert(typeof dailyPnL === "object", "Daily PnL tracking exists");

    // Check that no symbol exceeds daily limit (2 trades)
    const exceededTrades = Object.entries(dailyTrades).filter(([sym, count]) => count > 2);
    assert(
      exceededTrades.length === 0,
      `No symbol exceeds 2 daily trades limit`
    );

    // Check that no symbol exceeds daily P&L limit (10%)
    const exceededPnL = Object.entries(dailyPnL).filter(([sym, pnl]) => pnl > 10);
    assert(exceededPnL.length === 0, `No symbol exceeds 10% daily P&L limit`);

    const totalTrades = Object.values(dailyTrades).reduce((a, b) => a + b, 0);
    console.log(`  ${colors.cyan}ℹ${colors.reset} Total trades today: ${totalTrades}`);
  } catch (error) {
    console.log(`  ${colors.red}✗ Error: ${error.message}${colors.reset}`);
  }
}

/**
 * Test 9: P&L Calculations
 */
async function testPnLCalculations() {
  console.log(`\n${colors.blue}Test 9: P&L Calculations${colors.reset}`);
  try {
    const response = await makeRequest("/api/trading/observers");
    const observers = response.data.observers;

    observers.forEach((obs) => {
      if (obs.estado === "BOUGHT" && obs.buyPrice > 0) {
        // Verify P&L calculation
        const expectedPnL = ((obs.currentPrice - obs.buyPrice) / obs.buyPrice) * 100;
        const diff = Math.abs(expectedPnL - obs.pnlPercent);

        assert(
          diff < 0.01,
          `${obs.symbol}: P&L calculation correct (${obs.pnlPercent.toFixed(2)}%)`
        );
      }
    });
  } catch (error) {
    console.log(`  ${colors.red}✗ Error: ${error.message}${colors.reset}`);
  }
}

/**
 * Test 10: Buffer Size
 */
async function testBufferSize() {
  console.log(`\n${colors.blue}Test 10: Buffer Management${colors.reset}`);
  try {
    const statusResp = await makeRequest("/api/status");
    const readyCount = statusResp.data.readyCount;

    if (readyCount >= 10) {
      assert(true, `All 10 observers have full buffers (ready for trading)`);
    } else {
      console.log(
        `  ${colors.yellow}⚠${colors.reset} Only ${readyCount}/10 observers ready (still initializing)`
      );
    }
  } catch (error) {
    console.log(`  ${colors.red}✗ Error: ${error.message}${colors.reset}`);
  }
}

/**
 * Main test runner
 */
async function runTests() {
  console.log(`\n${colors.cyan}╔════════════════════════════════════════╗${colors.reset}`);
  console.log(`${colors.cyan}║  SPOT-BOT - TradingManager Test Suite  ║${colors.reset}`);
  console.log(`${colors.cyan}╚════════════════════════════════════════╝${colors.reset}`);

  await testServerHealth();
  await testGainersManager();
  await testTradingManager();
  await testOrderObservers();
  await testTechnicalIndicators();
  await testTradingConditions();
  await testStateConsistency();
  await testDailyLimits();
  await testPnLCalculations();
  await testBufferSize();

  // Summary
  console.log(`\n${colors.cyan}╔════════════════════════════════════════╗${colors.reset}`);
  console.log(`${colors.cyan}║  Test Results                          ║${colors.reset}`);
  console.log(`${colors.cyan}╚════════════════════════════════════════╝${colors.reset}`);

  const total = testsPassed + testsFailed;
  const percentage = total > 0 ? ((testsPassed / total) * 100).toFixed(1) : 0;

  console.log(`  ${colors.green}Passed: ${testsPassed}${colors.reset}`);
  console.log(`  ${colors.red}Failed: ${testsFailed}${colors.reset}`);
  console.log(`  ${colors.blue}Total:  ${total}${colors.reset}`);
  console.log(`  ${colors.cyan}Success Rate: ${percentage}%${colors.reset}`);

  if (testsFailed === 0) {
    console.log(`\n${colors.green}✓ All tests passed!${colors.reset}\n`);
    process.exit(0);
  } else {
    console.log(`\n${colors.red}✗ Some tests failed${colors.reset}\n`);
    process.exit(1);
  }
}

// Run tests
runTests().catch((error) => {
  console.error(`${colors.red}Fatal error: ${error.message}${colors.reset}`);
  process.exit(1);
});
