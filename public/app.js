// ─────────────────────────────────────────────
// app.js - SPOT-BOT Top 10 Gainers Dashboard
// ─────────────────────────────────────────────

class GainersDashboard {
  constructor() {
    this.ws = null;
    this.topGainers = [];
    this.lastUpdate = null;

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
      default:
        console.log("[Dashboard] Unknown message type:", message.type);
    }
  }

  // ── UI Updates ──────────────────────────────────────────────────────
  updateGainers(gainers, timestamp) {
    this.topGainers = gainers;
    this.lastUpdate = timestamp;
    this.renderGainers();
    this.updateDebugInfo();
  }

  renderGainers() {
    const gainersElement = document.getElementById("gainers");
    if (!gainersElement) return;

    // Ensure maximum 10 items
    const topTen = this.topGainers.slice(0, 10);

    if (topTen.length === 0) {
      gainersElement.innerHTML = '<div class="no-data">No gainers data available</div>';
      return;
    }

    gainersElement.innerHTML = topTen
      .map((gainer, index) => {
        const percentClass = gainer.gainer1h > 0 ? "positive" : gainer.gainer1h < 0 ? "negative" : "neutral";
        const changeSign = gainer.gainer1h > 0 ? "+" : "";

        // Indicators from observer
        const ma20 = gainer.ma20 || 0;
        const ma99 = gainer.ma99 || 0;
        const bbUpper = gainer.bbUpper || 0;
        const bbLower = gainer.bbLower || 0;

        // Conditions from observer
        const conditions = gainer.conditions || {};

        // UP Conditions: Zona Fuerte (MA20 > MA99) + Breakout Alcista (price > MA99 × 1.015)
        const upZonaFuerte = conditions.upCondition1_ZonaFuerte ? "✓" : "✗";
        const upBreakout = conditions.upCondition2_BreakoutAlcista ? "✓" : "✗";
        const canBuyUP = conditions.canBuyUP ? "✅" : "—";

        // DOWN Conditions: Zona Débil (MA20 < MA99) + Precio Deprimido (price < MA99 × 0.970)
        const downZonaDebil = conditions.downCondition1_ZonaDebil ? "✓" : "✗";
        const downDeprimido = conditions.downCondition2_PrecioDeprimido ? "✓" : "✗";
        const canBuyDOWN = conditions.canBuyDOWN ? "✅" : "—";

        return `
          <div class="gainer-card">
            <div class="gainer-rank">#${index + 1}</div>
            <div class="gainer-symbol">
              <span>${gainer.symbol}</span>
              <span class="gainer-change ${percentClass}">${changeSign}${gainer.gainer1h.toFixed(2)}%</span>
            </div>
            <div class="gainer-price">Price: $${gainer.price.toFixed(8)}</div>
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
                <span class="detail-label">Zona Fuerte:</span>
                <span class="detail-value">${upZonaFuerte}</span>
              </div>
              <div class="detail-row" style="font-size: 11px; color: var(--text-secondary); margin-left: 12px;">
                <span class="detail-label">Breakout:</span>
                <span class="detail-value">${upBreakout}</span>
              </div>
              <div class="detail-row">
                <span class="detail-label">BUY DOWN:</span>
                <span class="detail-value">${canBuyDOWN}</span>
              </div>
              <div class="detail-row" style="font-size: 11px; color: var(--text-secondary); margin-left: 12px;">
                <span class="detail-label">Zona Débil:</span>
                <span class="detail-value">${downZonaDebil}</span>
              </div>
              <div class="detail-row" style="font-size: 11px; color: var(--text-secondary); margin-left: 12px;">
                <span class="detail-label">Deprimido:</span>
                <span class="detail-value">${downDeprimido}</span>
              </div>
            </div>
          </div>
        `;
      })
      .join("");
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
}

// ── Initialize Dashboard ────────────────────────────────────────────
let dashboard;

document.addEventListener("DOMContentLoaded", () => {
  console.log("[Dashboard] Initializing...");
  dashboard = new GainersDashboard();
});
