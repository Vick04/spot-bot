// ─────────────────────────────────────────────
// app.js - SPOT-BOT Top 30 Gainers Dashboard
// ─────────────────────────────────────────────

class GainersDashboard {
  constructor() {
    this.ws = null;
    this.topGainers = [];
    this.lastUpdate = null;
    this.gainersManager = null; // Will reference backend manager data
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

    this.connectWebSocket();
    this.setupConnectionStatus();
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
      case "gainers-update":
        this.updateGainers(message.gainers, message.timestamp);
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
  updateGainers(gainers, timestamp) {
    this.topGainers = gainers;
    this.lastUpdate = timestamp;

    // Capture buffer data from each gainer
    gainers.forEach(gainer => {
      if (gainer.bufferData && gainer.bufferData.length > 0) {
        this.bufferData[gainer.symbol] = gainer.bufferData;
      }
    });

    console.log(`[Dashboard] Stored buffer data for ${Object.keys(this.bufferData).length} symbols`);

    this.renderGainers();
    this.updateDebugInfo();
  }

  renderGainers() {
    const gainersElement = document.getElementById("gainers");
    if (!gainersElement) return;

    // Ensure maximum 30 items
    const topThirty = this.topGainers.slice(0, 30);

    if (topThirty.length === 0) {
      gainersElement.innerHTML = '<div class="no-data">No gainers data available</div>';
      return;
    }

    gainersElement.innerHTML = topThirty
      .map((gainer, index) => {
        const percentClass = gainer.gainer1h > 0 ? "positive" : gainer.gainer1h < 0 ? "negative" : "neutral";
        const changeSign = gainer.gainer1h > 0 ? "+" : "";

        // Multi-timeframe gainers
        const gainer5m = gainer.gainer5m || 0;
        const gainer15m = gainer.gainer15m || 0;
        const gainer30m = gainer.gainer30m || 0;

        // Indicators from observer
        const ma20 = gainer.ma20 || 0;
        const ma99 = gainer.ma99 || 0;
        const bbUpper = gainer.bbUpper || 0;
        const bbLower = gainer.bbLower || 0;

        // Conditions from observer
        const conditions = gainer.conditions || {};

        // UP Conditions
        const upPiso = conditions.upCondition1_Piso ? "✓" : "✗";
        const upZonaFuerte = conditions.upCondition2_ZonaFuerte ? "✓" : "✗";
        const upBreakout = conditions.upCondition3_BreakoutAlcista ? "✓" : "✗";
        const upPriceExceeded = conditions.upCondition4_PriceExceeded ? "✗" : "✓";
        const canBuyUP = conditions.canBuyUP ? "✅" : "—";

        return `
          <div class="gainer-card" data-symbol="${gainer.symbol}">
            <div class="gainer-rank">#${index + 1}</div>
            <div class="gainer-symbol">
              <span>${gainer.symbol}</span>
              <span class="gainer-change ${percentClass}">${changeSign}${gainer.gainer1h.toFixed(2)}%</span>
            </div>
            <div class="gainer-price">Price: $${gainer.price.toFixed(8)}</div>

            <!-- UP Conditions Progress -->
            <div style="margin-bottom: 8px; padding: 8px; background-color: rgba(66, 153, 225, 0.05); border-radius: 6px;">
              <div style="font-size: 10px; color: var(--text-secondary); font-weight: 600; margin-bottom: 6px; text-transform: uppercase;">BUY UP Sequence:</div>
              <div style="display: flex; gap: 4px; align-items: center;">
                <div style="flex: 1; height: 20px; background-color: ${conditions.upCondition1_Piso ? 'rgba(72, 187, 120, 0.4)' : 'rgba(160, 174, 192, 0.1)'}; border-radius: 4px; display: flex; align-items: center; justify-content: center; font-size: 9px; font-weight: 600; color: ${conditions.upCondition1_Piso ? 'var(--success)' : 'var(--text-secondary)'};"><span>①</span></div>
                <div style="width: 16px; height: 2px; background-color: ${conditions.upCondition1_Piso ? 'rgba(72, 187, 120, 0.4)' : 'rgba(160, 174, 192, 0.1)'};"></div>
                <div style="flex: 1; height: 20px; background-color: ${conditions.upCondition2_ZonaFuerte ? 'rgba(72, 187, 120, 0.4)' : 'rgba(160, 174, 192, 0.1)'}; border-radius: 4px; display: flex; align-items: center; justify-content: center; font-size: 9px; font-weight: 600; color: ${conditions.upCondition2_ZonaFuerte ? 'var(--success)' : 'var(--text-secondary)'};"><span>②</span></div>
                <div style="width: 16px; height: 2px; background-color: ${conditions.upCondition2_ZonaFuerte && conditions.upCondition3_BreakoutAlcista ? 'rgba(72, 187, 120, 0.4)' : 'rgba(160, 174, 192, 0.1)'};"></div>
                <div style="flex: 1; height: 20px; background-color: ${conditions.upCondition3_BreakoutAlcista ? 'rgba(72, 187, 120, 0.4)' : 'rgba(160, 174, 192, 0.1)'}; border-radius: 4px; display: flex; align-items: center; justify-content: center; font-size: 9px; font-weight: 600; color: ${conditions.upCondition3_BreakoutAlcista ? 'var(--success)' : 'var(--text-secondary)'};"><span>③</span></div>
              </div>
            </div>

            <div class="gainer-details">
              <div class="detail-row">
                <span class="detail-label">Indicators:</span>
                <span class="detail-value"></span>
              </div>
              <div class="detail-row">
                <span class="detail-label">MA20:</span>
                <span class="detail-value">${ma20 > 0 ? ma20.toFixed(8) : "—"}</span>
              </div>
              <div class="detail-row">
                <span class="detail-label">MA99:</span>
                <span class="detail-value">${ma99 > 0 ? ma99.toFixed(8) : "—"}</span>
              </div>
              <div class="detail-row">
                <span class="detail-label">BB Range:</span>
                <span class="detail-value">${bbUpper > 0 ? bbLower.toFixed(8) + "—" + bbUpper.toFixed(8) : "—"}</span>
              </div>
              <div class="detail-row">
                <span class="detail-label">BUY UP:</span>
                <span class="detail-value">${canBuyUP}</span>
              </div>
              <div class="detail-row" style="font-size: 11px; color: var(--text-secondary); margin-left: 12px;">
                <span class="detail-label">① Piso (MA20 &lt; MA99):</span>
                <span class="detail-value condition-step ${conditions.upCondition1_Piso ? 'step-met' : 'step-pending'}">${upPiso}</span>
              </div>
              <div class="detail-row" style="font-size: 11px; color: var(--text-secondary); margin-left: 12px;">
                <span class="detail-label">② Zona Fuerte (MA20 &gt; MA99):</span>
                <span class="detail-value condition-step ${conditions.upCondition2_ZonaFuerte ? 'step-met' : 'step-pending'}">${upZonaFuerte}</span>
              </div>
              <div class="detail-row" style="font-size: 11px; color: var(--text-secondary); margin-left: 12px;">
                <span class="detail-label">③ Breakout (Price ±1%):</span>
                <span class="detail-value condition-step ${conditions.upCondition3_BreakoutAlcista ? 'step-met' : 'step-pending'}">${upBreakout}</span>
              </div>
              <div class="detail-row" style="font-size: 11px; color: var(--text-secondary); margin-left: 12px;">
                <span class="detail-label">④ Price OK (Price ≤ MA99 × 1.015):</span>
                <span class="detail-value condition-step ${!conditions.upCondition4_PriceExceeded ? 'step-met' : 'step-pending'}" style="background-color: ${!conditions.upCondition4_PriceExceeded ? 'rgba(72, 187, 120, 0.2)' : 'rgba(245, 101, 101, 0.2)'}; color: ${!conditions.upCondition4_PriceExceeded ? 'var(--success)' : 'var(--danger)'};">${upPriceExceeded}</span>
              </div>
            </div>
          </div>
        `;
      })
      .join("");

    // Agregar event listeners para mostrar gráficos en hover
    this.attachChartListeners(topThirty);
  }

  /**
   * Attach hover listeners to gainer cards for chart tooltips
   */
  attachChartListeners(gainers) {
    const gainersElement = document.getElementById("gainers");
    if (!gainersElement) return;

    const cards = gainersElement.querySelectorAll(".gainer-card");

    cards.forEach((card, index) => {
      const symbol = card.dataset.symbol;
      const gainer = gainers.find(g => g.symbol === symbol);

      if (!gainer) return;

      card.addEventListener("mouseenter", () => {
        this.showChartTooltip(symbol, gainer, card);
      });

      card.addEventListener("mouseleave", () => {
        this.hideChartTooltip();
      });
    });
  }

  updateDebugInfo() {
    const debugElement = document.getElementById("debugInfo");
    if (!debugElement) return;

    const timestamp = this.lastUpdate ? new Date(this.lastUpdate).toLocaleTimeString() : "N/A";
    const count = this.topGainers.length;

    debugElement.innerHTML = `
      <p>Last Update: ${timestamp}</p>
      <p>Gainers Count: ${count}</p>
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

  // ── Chart Tooltip Management ────────────────────────────────────
  currentChart = null;
  currentChartContainer = null;

  /**
   * Show chart tooltip on hover
   * @param {string} symbol - Trading pair symbol
   * @param {Object} gainer - Gainer data with all info
   * @param {HTMLElement} element - The gainer card element
   */
  showChartTooltip(symbol, gainer, element) {
    // Destroy previous chart if exists
    if (this.currentChart) {
      this.currentChart.remove();
      this.currentChart = null;
    }

    // Create tooltip container
    const tooltip = document.createElement("div");
    tooltip.id = "chartTooltip";
    tooltip.style.cssText = `
      position: fixed;
      background: linear-gradient(135deg, rgba(26, 26, 26, 0.98), rgba(45, 45, 45, 0.98));
      border: 1px solid rgba(66, 153, 225, 0.3);
      border-radius: 12px;
      padding: 16px;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
      z-index: 10000;
      width: 380px;
      backdrop-filter: blur(10px);
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    `;

    // Get position for tooltip (above or below the element)
    const rect = element.getBoundingClientRect();
    const tooltipHeight = 280;
    let top = rect.top - tooltipHeight - 10;

    if (top < 10) {
      top = rect.bottom + 10; // Show below if not enough space
    }

    tooltip.style.top = `${top}px`;
    tooltip.style.left = `${Math.max(10, rect.left - 50)}px`;

    // Chart container
    const chartContainer = document.createElement("div");
    chartContainer.style.cssText = `
      width: 100%;
      height: 180px;
      margin-bottom: 12px;
      border-radius: 8px;
      overflow: hidden;
      background: rgba(0, 0, 0, 0.2);
    `;

    // Info container
    const infoContainer = document.createElement("div");
    infoContainer.style.cssText = `
      font-size: 12px;
      color: var(--text-secondary);
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px;
      padding: 0 8px;
    `;

    // Symbol header
    const header = document.createElement("div");
    header.style.cssText = `
      font-size: 14px;
      font-weight: 600;
      color: var(--text-primary);
      margin-bottom: 8px;
      padding: 0 8px;
    `;
    header.textContent = `${symbol} - Últimos 60 minutos`;

    // Tooltip content
    tooltip.appendChild(header);
    tooltip.appendChild(chartContainer);

    // Info rows
    const priceRow = document.createElement("div");
    priceRow.textContent = `Price: $${gainer.price.toFixed(8)}`;
    priceRow.style.cssText = `color: var(--primary); font-weight: 600; grid-column: 1 / -1;`;

    infoContainer.appendChild(priceRow);

    // Stats
    const stats = [
      [`1h: ${gainer.gainer1h > 0 ? '+' : ''}${gainer.gainer1h.toFixed(2)}%`, gainer.gainer1h > 0 ? 'var(--success)' : 'var(--danger)'],
      [`5m: ${gainer.gainer5m > 0 ? '+' : ''}${gainer.gainer5m.toFixed(2)}%`, gainer.gainer5m > 0 ? 'var(--success)' : 'var(--danger)'],
      [`15m: ${gainer.gainer15m > 0 ? '+' : ''}${gainer.gainer15m.toFixed(2)}%`, gainer.gainer15m > 0 ? 'var(--success)' : 'var(--danger)'],
      [`30m: ${gainer.gainer30m > 0 ? '+' : ''}${gainer.gainer30m.toFixed(2)}%`, gainer.gainer30m > 0 ? 'var(--success)' : 'var(--danger)'],
    ];

    stats.forEach(([text, color]) => {
      const row = document.createElement("div");
      row.textContent = text;
      row.style.color = color;
      row.style.fontWeight = '600';
      infoContainer.appendChild(row);
    });

    tooltip.appendChild(infoContainer);
    document.body.appendChild(tooltip);

    // Create chart with TradingView (wait for library to load if needed)
    this.waitForLightweightCharts(() => {
      if (window.LightweightCharts) {
        this.createChart(symbol, chartContainer, gainer);
      } else {
        console.error(`[Dashboard] LightweightCharts failed to load after waiting`);
        chartContainer.innerHTML = '<div style="color: red; padding: 20px; text-align: center;">Chart library failed to load</div>';
      }
    });

    this.currentChartContainer = tooltip;
  }

  // Storage para datos de buffer
  bufferData = {};

  /**
   * Calculate Simple Moving Average
   * @param {Array} prices - Array of prices
   * @param {number} period - MA period (20, 99, etc)
   * @returns {Array} Array of MA values (with nulls for insufficient data)
   */
  calculateSMA(prices, period) {
    const sma = [];
    for (let i = 0; i < prices.length; i++) {
      if (i < period - 1) {
        sma.push(null);
      } else {
        const slice = prices.slice(i - period + 1, i + 1);
        const sum = slice.reduce((a, b) => a + b, 0);
        sma.push(sum / period);
      }
    }
    return sma;
  }

  /**
   * Calculate Bollinger Bands
   * @param {Array} prices - Array of prices
   * @param {number} period - SMA period
   * @param {number} multiplier - Standard deviation multiplier (default 2)
   * @returns {Object} { sma, upper, lower }
   */
  calculateBollingerBands(prices, period, multiplier = 2) {
    const sma = this.calculateSMA(prices, period);
    const upper = [];
    const lower = [];

    for (let i = 0; i < prices.length; i++) {
      if (i < period - 1) {
        upper.push(null);
        lower.push(null);
      } else {
        const slice = prices.slice(i - period + 1, i + 1);
        const mean = sma[i];
        const variance = slice.reduce((sum, price) => sum + Math.pow(price - mean, 2), 0) / period;
        const stdDev = Math.sqrt(variance);
        upper.push(mean + stdDev * multiplier);
        lower.push(mean - stdDev * multiplier);
      }
    }

    return { sma, upper, lower };
  }

  /**
   * Wait for LightweightCharts library to load
   * @param {Function} callback - Called when library is ready or timeout
   */
  waitForLightweightCharts(callback) {
    if (window.LightweightCharts) {
      console.log("[Dashboard] LightweightCharts already loaded");
      callback();
      return;
    }

    console.warn("[Dashboard] LightweightCharts not loaded, waiting...");
    let attempts = 0;
    const maxAttempts = 40; // 4 seconds max
    const checkInterval = setInterval(() => {
      attempts++;

      if (window.LightweightCharts) {
        console.log("[Dashboard] ✅ LightweightCharts loaded successfully");
        clearInterval(checkInterval);
        callback();
        return;
      }

      if (attempts >= maxAttempts) {
        console.error("[Dashboard] ⏱️ Timeout waiting for LightweightCharts");
        clearInterval(checkInterval);
        callback(); // Call anyway, let createChart handle the error
        return;
      }
    }, 100);
  }

  /**
   * Create TradingView Lightweight Chart with candlesticks and indicator lines
   */
  createChart(symbol, container, gainer = null) {
    try {
      if (!container || !container.clientWidth || !container.clientHeight) {
        console.warn(`[Dashboard] Chart container invalid for ${symbol}`);
        return;
      }

      // Verificar que LightweightCharts esté disponible
      if (!window.LightweightCharts) {
        console.warn(`[Dashboard] LightweightCharts not loaded yet for ${symbol}`);
        return;
      }

      // Get stored buffer data
      const candleData = this.bufferData[symbol];
      if (!candleData || candleData.length === 0) {
        console.warn(`[Dashboard] No candle data for ${symbol}. Available symbols:`, Object.keys(this.bufferData));
        return;
      }

      console.log(`[Dashboard] Creating chart for ${symbol} with ${candleData.length} candles`);

      // Crear chart usando window.LightweightCharts
      const chart = window.LightweightCharts.createChart(container, {
        layout: {
          background: { color: 'transparent' },
          textColor: '#9ca3af',
        },
        width: container.clientWidth,
        height: container.clientHeight,
        timeScale: {
          timeVisible: true,
          secondsVisible: false,
        },
        rightPriceScale: {
          visible: true,
          ticksVisible: true,
        },
        localization: {
          timeFormatter: (businessDayOrTimestamp) => {
            const date = new Date(businessDayOrTimestamp * 1000);
            return `${date.getHours()}:${String(date.getMinutes()).padStart(2, '0')}`;
          },
        },
      });

      // Candlestick series
      const candleSeries = chart.addCandlestickSeries({
        upColor: '#48bb78',
        downColor: '#f56565',
        borderVisible: false,
        wickUpColor: '#48bb78',
        wickDownColor: '#f56565',
        borderUpColor: '#48bb78',
        borderDownColor: '#f56565',
      });

      // Set candle data
      candleSeries.setData(candleData);

      // Add indicator lines if we have enough candles
      if (candleData && candleData.length > 0) {
        // Extract close prices from candles
        const closePrices = candleData.map(c => c.close);

        // Calculate MA20 (Yellow)
        const ma20Values = this.calculateSMA(closePrices, 20);
        const ma20Data = candleData
          .map((candle, i) => ma20Values[i] !== null ? { time: candle.time, value: ma20Values[i] } : null)
          .filter(d => d !== null);

        if (ma20Data.length > 0) {
          const ma20Series = chart.addLineSeries({
            color: '#FFD700', // Amarillo
            lineWidth: 1,
          });
          ma20Series.setData(ma20Data);
        }

        // Calculate MA99 (Blanco, más grueso)
        const ma99Values = this.calculateSMA(closePrices, 99);
        const ma99Data = candleData
          .map((candle, i) => ma99Values[i] !== null ? { time: candle.time, value: ma99Values[i] } : null)
          .filter(d => d !== null);

        if (ma99Data.length > 0) {
          const ma99Series = chart.addLineSeries({
            color: '#FFFFFF', // Blanco
            lineWidth: 2, // Más grueso
          });
          ma99Series.setData(ma99Data);
        }

        // Calculate Bollinger Bands (20, 2 std devs)
        const bb = this.calculateBollingerBands(closePrices, 20, 2);

        // Bollinger Upper (Rosa)
        const bbUpperData = candleData
          .map((candle, i) => bb.upper[i] !== null ? { time: candle.time, value: bb.upper[i] } : null)
          .filter(d => d !== null);

        if (bbUpperData.length > 0) {
          const bbUpperSeries = chart.addLineSeries({
            color: '#FF69B4', // Rosa
            lineWidth: 1,
          });
          bbUpperSeries.setData(bbUpperData);
        }

        // Bollinger Lower (Rojo suave)
        const bbLowerData = candleData
          .map((candle, i) => bb.lower[i] !== null ? { time: candle.time, value: bb.lower[i] } : null)
          .filter(d => d !== null);

        if (bbLowerData.length > 0) {
          const bbLowerSeries = chart.addLineSeries({
            color: '#CD5C5C', // Rojo suave (Indian Red)
            lineWidth: 1,
          });
          bbLowerSeries.setData(bbLowerData);
        }

        console.log(`[Dashboard] Added indicators - MA20: ${ma20Data.length} points, MA99: ${ma99Data.length} points, BB: ${bbUpperData.length} points`);
      }

      // Auto scale
      chart.timeScale().fitContent();

      // Store reference
      this.currentChart = chart;

      console.log(`[Dashboard] ✅ Chart created for ${symbol}`);
    } catch (error) {
      console.error(`[Dashboard] Error creating chart for ${symbol}:`, error);
    }
  }

  /**
   * Hide chart tooltip
   */
  hideChartTooltip() {
    if (this.currentChartContainer) {
      this.currentChartContainer.remove();
      this.currentChartContainer = null;
    }
    if (this.currentChart) {
      this.currentChart.remove();
      this.currentChart = null;
    }
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
      const binanceUrl = `https://www.binance.com/es-AR/trade/${symbol}_USDT?type=spot`;
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
