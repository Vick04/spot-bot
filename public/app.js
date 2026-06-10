// ─────────────────────────────────────────────
// app.js - SPOT-BOT Top 30 Gainers Dashboard
// ─────────────────────────────────────────────

class GainersDashboard {
  constructor() {
    this.ws = null;
    this.lastUpdate = null;
    this.gainersManager = null; // Will reference backend manager data
    this.symbolStats = {
      totalAttempted: 0,
      activeSymbols: 0,
      discardedSymbols: 0,
      blacklistedSymbols: 0,
      failedSymbols: 0,
    };
    this.tradingState = {
      balance: 0,
      activeCandleObserver: null,
      completedOrders: [],
      stats: {
        totalTrades: 0,
        totalProfit: 0,
        totalProfitPercent: 0,
        winTrades: 0,
        lossTrades: 0,
        totalFees: 0,
        avgProfitPercent: 0,
      },
    };
    this.impulseRanking = [];

    this.connectWebSocket();
    this.setupConnectionStatus();
    this.setupImpulseRankingUpdates();
  }

  // ── Impulse Tracking Ranking Updates ────────────────────────────────
  setupImpulseRankingUpdates() {
    // Fetch impulse ranking every 5 seconds
    setInterval(() => {
      fetch('/api/impulse-ranking')
        .then(res => res.json())
        .then(data => {
          this.impulseRanking = data.ranking || [];
          this.renderImpulseRanking();
        })
        .catch(err => console.error('[Dashboard] Error fetching impulse ranking:', err));
    }, 5000);

    // Initial fetch
    fetch('/api/impulse-ranking')
      .then(res => res.json())
      .then(data => {
        this.impulseRanking = data.ranking || [];
        this.renderImpulseRanking();
      })
      .catch(err => console.error('[Dashboard] Error fetching impulse ranking:', err));
  }

  renderImpulseRanking() {
    const container = document.getElementById('impulseRanking');
    if (!container || this.impulseRanking.length === 0) {
      if (container) container.innerHTML = '<div class="no-data">No impulse tracking data available</div>';
      return;
    }

    const html = `
      <table class="impulse-table">
        <thead>
          <tr>
            <th style="text-align: center; width: 50px;">#</th>
            <th style="text-align: left;">Symbol</th>
            <th style="text-align: center; width: 80px;">Counter</th>
            <th style="text-align: right; width: 100px;">Price</th>
            <th style="text-align: right; width: 100px;">MA99</th>
            <th style="text-align: right; width: 100px;">Avg Time</th>
            <th style="text-align: center; width: 80px;">Floor</th>
            <th style="text-align: center; width: 80px;">Allowed</th>
          </tr>
        </thead>
        <tbody>
          ${this.impulseRanking.slice(0, 50).map((item, index) => `
            <tr style="background-color: ${index % 2 === 0 ? 'rgba(160, 174, 192, 0.05)' : 'transparent'};">
              <td style="text-align: center; font-weight: 600;">${index + 1}</td>
              <td style="text-align: left; font-weight: 600; color: var(--primary);">
                <a href="https://www.binance.com/es-AR/trade/${item.symbol.replace('USDT', '')}_USDT?type=spot"
                   target="_blank" style="color: var(--primary); text-decoration: none;">
                  ${item.symbol}
                </a>
              </td>
              <td style="text-align: center; font-weight: 700; color: ${item.counter > 0 ? 'var(--success)' : 'var(--text-secondary)'};">
                ${item.counter}
              </td>
              <td style="text-align: right; color: var(--primary); font-family: monospace;">
                $${item.price ? item.price.toFixed(8) : '—'}
              </td>
              <td style="text-align: right; color: var(--text-secondary); font-family: monospace;">
                $${item.ma99 ? item.ma99.toFixed(8) : '—'}
              </td>
              <td style="text-align: right; color: ${item.averageTime ? 'var(--success)' : 'var(--text-secondary)'}; font-family: monospace; font-weight: 600;">
                ${item.averageTime ? (item.averageTime / 1000).toFixed(2) + 's' : '—'}
              </td>
              <td style="text-align: center; color: var(--text-secondary); font-family: monospace; font-size: 12px;">
                ${item.floor ? item.floor.toFixed(6) : '—'}
              </td>
              <td style="text-align: center; color: ${item.allowed ? 'var(--success)' : 'var(--text-secondary)'}; font-weight: 600;">
                ${item.allowed ? '✓' : '—'}
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;

    container.innerHTML = html;
  }

  // ── WebSocket Connection ────────────────────────────────────────────
  connectWebSocket() {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}`;

    console.log(`[Dashboard] Connecting to WebSocket at ${wsUrl}`);

    this.ws = new WebSocket(wsUrl);

    this.ws.onopen = () => {
      console.log("[Dashboard] WebSocket connected");
      this.updateConnectionStatus(true);
    };

    this.ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        this.handleMessage(message);
      } catch (error) {
        console.error("[Dashboard] Message parse error:", error);
      }
    };

    this.ws.onerror = (error) => {
      console.error("[Dashboard] WebSocket error:", error);
      this.updateConnectionStatus(false);
    };

    this.ws.onclose = () => {
      console.log("[Dashboard] WebSocket disconnected");
      this.updateConnectionStatus(false);
      // Attempt reconnection after 3 seconds
      setTimeout(() => this.connectWebSocket(), 3000);
    };
  }

  // ── Message Handling ────────────────────────────────────────────────
  handleMessage(message) {
    switch (message.type) {
      case "welcome":
        if (message.status && message.status.symbolStats) {
          this.updateSymbolStats(message.status.symbolStats);
        }
        break;
      case "manager-status":
        if (message.status && message.status.symbolStats) {
          this.updateSymbolStats(message.status.symbolStats);
        }
        break;
      case "trading-status":
        this.updateTradingStatus(message.data);
        break;
      case "trading-order":
        this.updateTradingOrder(message);
        break;
      case "order-progress":
        this.updateOrderProgress(message.position, message.timestamp);
        break;
      case "order-closed":
        this.handleOrderClosed(message);
        break;
      default:
        console.log("[Dashboard] Unknown message type:", message.type);
    }
  }

  // ── UI Updates ──────────────────────────────────────────────────────
  updateSymbolStats(symbolStats) {
    this.symbolStats = symbolStats;
    console.log("[Dashboard] Symbol stats updated:", symbolStats);
    this.renderSymbolStats();
  }

  renderSymbolStats() {
    const { totalAttempted, activeSymbols, discardedSymbols, blacklistedSymbols, failedSymbols } = this.symbolStats;

    const successRate = totalAttempted > 0 ? ((activeSymbols / totalAttempted) * 100).toFixed(1) : 0;

    document.getElementById("statTotalAttempted").textContent = totalAttempted.toLocaleString();
    document.getElementById("statActiveSymbols").textContent = activeSymbols.toLocaleString();
    document.getElementById("statDiscardedSymbols").textContent = discardedSymbols.toLocaleString();
    document.getElementById("statBlacklistedSymbols").textContent = blacklistedSymbols.toLocaleString();
    document.getElementById("statFailedSymbols").textContent = failedSymbols.toLocaleString();
    document.getElementById("statSuccessRate").textContent = `${successRate}%`;
  }

  updateDebugInfo() {
    const debugElement = document.getElementById("debugInfo");
    if (!debugElement) return;

    const timestamp = this.lastUpdate ? new Date(this.lastUpdate).toLocaleTimeString() : "N/A";

    debugElement.innerHTML = `
      <p>Last Update: ${timestamp}</p>
      <p>WebSocket Status: ${this.ws ? (this.ws.readyState === WebSocket.OPEN ? "Connected" : "Connecting...") : "Disconnected"}</p>
    `;
  }

  updateConnectionStatus(connected) {
    const status = document.getElementById("connectionStatus");
    if (!status) return;

    const dot = status.querySelector(".status-dot");
    const text = status.querySelector(".status-text");

    if (connected) {
      dot.classList.remove("disconnected");
      dot.classList.add("connected");
      text.textContent = "Connected";
    } else {
      dot.classList.remove("connected");
      dot.classList.add("disconnected");
      text.textContent = "Disconnected";
    }
  }

  setupConnectionStatus() {
    // Initial status
    this.updateConnectionStatus(false);
  }

  // ── Trading Status Updates ─────────────────────────────────────────
  updateTradingStatus(data) {
    if (!data) return;
    this.tradingState = data;
    this.renderTradingStatus();
  }

  updateTradingOrder(message) {
    console.log("[Dashboard] Trading order:", message.action, message.data);
    // Refresh trading status
    this.renderTradingStatus();
  }

  renderTradingStatus() {
    const balance = document.getElementById("balance");
    const activePosition = document.getElementById("activePosition");
    const totalTrades = document.getElementById("totalTrades");
    const totalProfit = document.getElementById("totalProfit");
    const pnlPercent = document.getElementById("pnlPercent");

    if (balance) {
      balance.textContent = `$${this.tradingState.balance.toFixed(2)}`;
    }

    if (activePosition) {
      if (this.tradingState.activeCandleObserver) {
        activePosition.textContent = this.tradingState.activeCandleObserver.symbol;
      } else {
        activePosition.textContent = "None";
      }
    }

    if (totalTrades) {
      totalTrades.textContent = this.tradingState.stats.totalTrades;
    }

    if (totalProfit) {
      const profitClass = this.tradingState.stats.totalProfit >= 0 ? "positive" : "negative";
      totalProfit.innerHTML = `<span style="color: ${this.tradingState.stats.totalProfit >= 0 ? '#48bb78' : '#f56565'}">$${this.tradingState.stats.totalProfit.toFixed(2)}</span>`;
    }

    if (pnlPercent) {
      const percentValue = this.tradingState.stats.totalProfitPercent || 0;
      const percentSign = percentValue >= 0 ? "+" : "";
      pnlPercent.innerHTML = `<span style="color: ${percentValue >= 0 ? '#48bb78' : '#f56565'}">${percentSign}${percentValue.toFixed(2)}%</span>`;
    }

    // Render orders history
    this.renderOrdersHistory();
  }

  // ── Orders History Rendering ─────────────────────────────────────
  renderOrdersHistory() {
    const container = document.getElementById("ordersHistory");
    if (!container) return;

    const orders = this.tradingState.completedOrders || [];

    if (orders.length === 0) {
      container.innerHTML = '<div class="no-orders">No orders yet</div>';
      return;
    }

    // Group orders by pairs (BUY followed by SELL)
    let html = '<table class="orders-table"><thead><tr>';
    html += '<th>#</th>';
    html += '<th>Symbol</th>';
    html += '<th>Type</th>';
    html += '<th>Price</th>';
    html += '<th>Quantity</th>';
    html += '<th>Value/Profit</th>';
    html += '<th>Fee</th>';
    html += '<th>Time</th>';
    html += '</tr></thead><tbody>';

    // Display orders in reverse order (newest first)
    const reversedOrders = [...orders].reverse();

    reversedOrders.forEach((order, index) => {
      const orderNum = orders.length - index;
      const orderType = order.type === 'BUY' ? 'buy' : 'sell';
      const time = new Date(order.timestamp).toLocaleTimeString();

      let priceValue = '-';
      let quantityValue = order.quantity ? order.quantity.toFixed(8) : '-';
      let valueProfit = '-';
      let feeValue = '-';

      if (order.type === 'BUY') {
        priceValue = order.buyPrice ? `$${order.buyPrice.toFixed(8)}` : '-';
        valueProfit = order.investedUSDT ? `$${order.investedUSDT.toFixed(2)}` : '-';
        // Convert feeOnBuy (in BTC) to USDT equivalent: fee_btc * buy_price
        const feeOnBuyUSDT = order.feeOnBuy && order.buyPrice ? (order.feeOnBuy * order.buyPrice) : 0;
        feeValue = feeOnBuyUSDT > 0 ? `$${feeOnBuyUSDT.toFixed(2)}` : '-';
      } else { // SELL
        priceValue = order.sellPrice ? `$${order.sellPrice.toFixed(8)}` : '-';
        const profitColor = (order.profit >= 0) ? '#48bb78' : '#f56565';
        valueProfit = order.profit !== undefined
          ? `<span style="color: ${profitColor}; font-weight: 700;">${order.profit >= 0 ? '+' : ''}$${order.profit.toFixed(2)} (${order.profitPercent >= 0 ? '+' : ''}${order.profitPercent.toFixed(4)}%)</span>`
          : '-';
        feeValue = order.feeOnSell ? `$${order.feeOnSell.toFixed(2)}` : '-';
      }

      html += '<tr>';
      html += `<td style="color: var(--text-secondary); font-weight: 600;">${orderNum}</td>`;
      html += `<td class="order-symbol">${order.symbol}</td>`;
      html += `<td><span class="order-type ${orderType}">${order.type}</span></td>`;
      html += `<td class="order-price">${priceValue}</td>`;
      html += `<td>${quantityValue}</td>`;
      html += `<td class="order-profit">${valueProfit}</td>`;
      html += `<td>${feeValue}</td>`;
      html += `<td class="order-time">${time}</td>`;
      html += '</tr>';
    });

    html += '</tbody></table>';
    container.innerHTML = html;
  }

  // ── Order Progress Updates (Real-time) ─────────────────────────────
  updateOrderProgress(position, timestamp) {
    const section = document.getElementById("orderProgressSection");

    if (!position) {
      if (section) section.style.display = "none";
      return;
    }

    if (section) section.style.display = "block";

    // Update symbol and status - make symbol clickable
    const orderSymbolElement = document.getElementById("orderSymbol");
    if (orderSymbolElement) {
      const symbol = position.symbol || "-";
      const symbolWithoutUSDAT = symbol.replace('USDT', '');
      const binanceUrl = `https://www.binance.com/es-AR/trade/${symbolWithoutUSDAT}_USDT?type=spot`;
      orderSymbolElement.innerHTML = `<a href="${binanceUrl}" target="_blank" style="color: var(--primary); text-decoration: none; font-weight: 600; cursor: pointer;">${symbol}</a>`;
    }
    document.getElementById("orderStatus").textContent = "IN PROGRESS";

    // Update prices
    document.getElementById("orderBuyPrice").textContent =
      position.buyPrice ? `$${position.buyPrice.toFixed(8)}` : "-";

    document.getElementById("orderCurrentPrice").textContent =
      position.currentPrice ? `$${position.currentPrice.toFixed(8)}` : "-";

    document.getElementById("orderSellTarget").textContent =
      position.sellTarget ? `$${position.sellTarget.toFixed(8)}` : "-";

    document.getElementById("orderGapToTarget").textContent =
      position.priceGapToTarget ? `$${position.priceGapToTarget.toFixed(8)}` : "-";

    // Update progress bar
    const progressPercent = Math.min(Math.max(position.progressPercent || 0, 0), 100);
    const progressFill = document.getElementById("orderProgressFill");
    if (progressFill) {
      progressFill.style.width = progressPercent + "%";
    }

    document.getElementById("orderProgressPercent").textContent =
      progressPercent.toFixed(1) + "%";

    // Add SELL button if not already present
    let sellButton = document.getElementById("orderManualSellBtn");
    if (!sellButton && document.getElementById("orderProgressSection")) {
      const section = document.getElementById("orderProgressSection");
      if (section && !section.querySelector("#orderManualSellBtn")) {
        sellButton = document.createElement("button");
        sellButton.id = "orderManualSellBtn";
        sellButton.textContent = "💰 SELL NOW";
        sellButton.style.cssText = `
          padding: 10px 16px;
          margin-top: 12px;
          background-color: #f56565;
          color: white;
          border: none;
          border-radius: 6px;
          font-weight: 600;
          cursor: pointer;
          font-size: 13px;
          transition: background-color 0.2s;
          width: 100%;
        `;
        sellButton.onmouseover = () => sellButton.style.backgroundColor = '#e53e3e';
        sellButton.onmouseout = () => sellButton.style.backgroundColor = '#f56565';
        // Use arrow function to always get current position from tradingState
        sellButton.onclick = () => {
          if (this.tradingState.activeCandleObserver) {
            this.executeManualSell(this.tradingState.activeCandleObserver);
          } else {
            alert("❌ No active position to sell");
          }
        };

        // Insert button into Order in Progress section
        const lastChild = section.lastElementChild;
        if (lastChild) {
          section.insertBefore(sellButton, lastChild);
        } else {
          section.appendChild(sellButton);
        }
      }
    }

    // Update P&L info
    const pnlColor = position.pnlValue >= 0 ? '#48bb78' : '#f56565';

    document.getElementById("orderPnLValue").innerHTML =
      `<span style="color: ${pnlColor}">$${position.pnlValue.toFixed(2)}</span>`;

    document.getElementById("orderPnLPercent").innerHTML =
      `<span style="color: ${pnlColor}">${position.pnlPercent >= 0 ? '+' : ''}${position.pnlPercent.toFixed(4)}%</span>`;

    document.getElementById("orderQuantity").textContent =
      position.quantity ? position.quantity.toFixed(8) : "-";

    document.getElementById("orderTimeInTrade").textContent =
      position.timeInTrade ? position.timeInTrade + " min" : "-";
  }

  // ── Manual Sell Execution ──────────────────────────────────────────
  async executeManualSell(position) {
    if (!position) return;

    const symbol = position.symbol;
    const confirmed = confirm(`Are you sure you want to SELL ${symbol} at current market price?\n\nCurrent Price: $${position.currentPrice.toFixed(8)}\nQuantity: ${position.quantity.toFixed(8)}`);

    if (!confirmed) return;

    try {
      console.log(`[Dashboard] Executing manual SELL for ${symbol}...`);
      console.log("[Dashboard] Position data:", position);

      // Send manual sell request to server
      const response = await fetch("/api/sell-manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol: symbol,
          currentPrice: position.currentPrice,
          quantity: position.quantity,
        }),
      });

      const result = await response.json();
      console.log("[Dashboard] Server response:", result);

      if (!response.ok) {
        const errorMsg = result.error || `HTTP error! status: ${response.status}`;
        throw new Error(errorMsg);
      }

      console.log("[Dashboard] Manual SELL executed successfully:", result);

      // Show success message
      alert(`✅ SELL Order Executed!\n\nSymbol: ${symbol}\nSell Price: $${position.currentPrice.toFixed(8)}\nQuantity: ${position.quantity.toFixed(8)}\nProfit: ${result.orderInfo.profitPercent.toFixed(4)}%`);

      // Hide Order in Progress section
      const section = document.getElementById("orderProgressSection");
      if (section) section.style.display = "none";
    } catch (error) {
      console.error("[Dashboard] Manual SELL failed:", error);
      alert(`❌ Manual SELL failed:\n\n${error.message}`);
    }
  }

  // ── Order Closed Handler ───────────────────────────────────────────
  handleOrderClosed(message) {
    console.log("[Dashboard] Order closed event received:", message.order);

    // Update trading state with new balance and stats
    if (message.tradingState) {
      this.updateTradingStatus(message.tradingState);
    }

    // Hide order in progress section
    const section = document.getElementById("orderProgressSection");
    if (section) {
      section.style.display = "none";
    }

    // Clear position from tradingState
    this.tradingState.activeCandleObserver = null;

    console.log(`[Dashboard] ✅ Order closed - New Balance: $${this.tradingState.balance.toFixed(2)}`);
  }
}

// ── Initialize Dashboard ────────────────────────────────────────────
let dashboard;

document.addEventListener("DOMContentLoaded", () => {
  console.log("[Dashboard] Initializing...");
  dashboard = new GainersDashboard();
});
