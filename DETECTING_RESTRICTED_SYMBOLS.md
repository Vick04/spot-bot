# Detectando Símbolos en Observación desde la API de Binance

## Campos Disponibles en `/api/v3/exchangeInfo`

Binance proporciona información sobre restricciones de trading en la respuesta de `exchangeInfo`. Cada símbolo tiene estos campos clave:

### 1. **Status del Símbolo**
```json
{
  "symbol": "BTCUSDT",
  "status": "TRADING"
}
```

**Valores posibles:**
- ✅ `TRADING` - Normal, sin restricciones
- ⏸️ `BREAK` - Descanso programado (muy raro)
- 🚫 `HALT` - Pausado por Binance
- ⏹️ `PAUSE` - Pausado temporalmente
- 📍 `PRE_TRADING` - Por listar próximamente
- ❌ `POST_TRADING` - Trading finalizado

### 2. **Restricciones de Órdenes**
```json
{
  "icebergAllowed": true,      // Permite órdenes iceberg
  "ocoAllowed": true,           // One-Cancels-Other permitido
  "isSpotTradingAllowed": true, // Trading spot habilitado
}
```

**Lo que significan las restricciones:**
- `"icebergAllowed": false` → No puedes usar órdenes iceberg
- `"ocoAllowed": false` → Sin órdenes condicionales
- `"isSpotTradingAllowed": false` → ⚠️ **RIESGO ALTO** - Trading spot deshabilitado

### 3. **Campo `restrictions` (Nuevo en 2024)**
```json
{
  "restrictions": [
    {
      "type": "MARKET_LOT_SIZE",
      "restrictions": ["SELL"]  // Restricción solo en ventas
    },
    {
      "type": "PRICE_FILTER",
      "restrictions": ["BUY"]   // Restricción solo en compras
    }
  ]
}
```

**Tipos comunes:**
- `MARKET_LOT_SIZE` - Restricción en cantidad
- `PRICE_FILTER` - Restricción en rango de precio
- `PERCENT_PRICE_BY_SIDE` - Restricción por lado (compra/venta)
- `SELL_SIDE_MAX_NUM_ORDERS` - Máximo de órdenes de venta

---

## Indicadores de "En Observación"

Un símbolo está **"En observación"** si cumple UNO O MÁS de estos criterios:

### 🔴 Críticos (Evitar completamente)
```javascript
// 1. Status no es TRADING
if (symbol.status !== "TRADING") {
  console.log("❌ EVITAR - Status:", symbol.status);
  return false;
}

// 2. Trading spot deshabilitado
if (!symbol.isSpotTradingAllowed) {
  console.log("❌ EVITAR - Spot trading deshabilitado");
  return false;
}

// 3. Tiene restricciones críticas
if (symbol.restrictions && symbol.restrictions.length > 0) {
  console.log("⚠️ PRECAUCIÓN - Restricciones encontradas:", symbol.restrictions);
  // Decidir si evitar o permitir según el tipo
}
```

### 🟡 Advertencias (Alto Riesgo)
```javascript
// 1. Volatilidad extrema en 24h
if (Math.abs(priceChangePercent) > 100) {
  console.log("⚠️ ALTO RIESGO - Volatilidad extrema: " + priceChangePercent + "%");
}

// 2. Órdenes iceberg o OCO no permitidas
if (!symbol.icebergAllowed || !symbol.ocoAllowed) {
  console.log("⚠️ LIMITACIÓN - Órdenes restringidas");
}

// 3. Edad de listado < 30 días (estimado por volatilidad)
if (priceChangePercent24h > 50) {
  console.log("⚠️ RECIENTE - Probablemente listado recientemente");
}
```

---

## Implementación en `binanceAPI.js`

### Función Mejorada para Detectar Símbolos Restringidos

```javascript
async function getSymbolRestrictions(symbol) {
  try {
    const response = await binanceClient.get("/api/v3/exchangeInfo");
    const symbolInfo = response.data.symbols.find(s => s.symbol === symbol);
    
    if (!symbolInfo) return null;

    return {
      symbol: symbol,
      status: symbolInfo.status,
      isSpotTradingAllowed: symbolInfo.isSpotTradingAllowed,
      icebergAllowed: symbolInfo.icebergAllowed,
      ocoAllowed: symbolInfo.ocoAllowed,
      restrictions: symbolInfo.restrictions || [],
      riskLevel: calculateRiskLevel(symbolInfo),
    };
  } catch (error) {
    console.error("Error fetching symbol restrictions:", error);
    return null;
  }
}

function calculateRiskLevel(symbolInfo) {
  let risk = "LOW";

  // Status check
  if (symbolInfo.status !== "TRADING") {
    return "CRITICAL";
  }

  // Spot trading check
  if (!symbolInfo.isSpotTradingAllowed) {
    return "CRITICAL";
  }

  // Restrictions check
  if (symbolInfo.restrictions && symbolInfo.restrictions.length > 0) {
    risk = "HIGH";
  }

  // Order restrictions
  if (!symbolInfo.icebergAllowed || !symbolInfo.ocoAllowed) {
    if (risk === "LOW") risk = "MEDIUM";
  }

  return risk;
}
```

---

## Combinación: Detectar desde Múltiples Fuentes

Para la máxima precisión, combina información de varios endpoints:

```javascript
async function isSymbolUnderReview(symbol) {
  const exchangeInfo = await getSymbolRestrictions(symbol);
  const ticker24h = await fetch24hTicker();
  const symbolTicker = ticker24h.find(t => t.symbol === symbol);

  // Criterios combinados
  const checks = {
    statusNotTrading: exchangeInfo.status !== "TRADING",
    spotTradingDisabled: !exchangeInfo.isSpotTradingAllowed,
    hasRestrictions: exchangeInfo.restrictions.length > 0,
    extremeVolatility: Math.abs(symbolTicker.priceChangePercent) > 100,
    orderRestrictionsHigh: !exchangeInfo.icebergAllowed && !exchangeInfo.ocoAllowed,
  };

  const riskCount = Object.values(checks).filter(v => v).length;

  if (checks.statusNotTrading || checks.spotTradingDisabled) {
    return { underReview: true, severity: "CRITICAL", checks };
  }

  if (riskCount >= 2) {
    return { underReview: true, severity: "HIGH", checks };
  }

  if (riskCount >= 1) {
    return { underReview: false, severity: "MEDIUM", checks };
  }

  return { underReview: false, severity: "LOW", checks };
}
```

---

## Campos en `/api/v3/ticker/24hr`

También puedes obtener indicadores de riesgo desde el ticker:

```json
{
  "symbol": "SHITCOINUSDT",
  "priceChangePercent": "150.25",      // 150% cambio = PELIGRO
  "bidPrice": "0.0001234",
  "askPrice": "0.0001235",
  "bidQty": "100000",                  // Cantidad en bid
  "askQty": "50000",                   // Cantidad en ask
  "volume": "50000000",                // Volumen bajo = PELIGRO
  "quoteAssetVolume": "5000"           // < $10k = MUY PELIGROSO
}
```

**Indicadores en el ticker:**
- `quoteAssetVolume < $10,000` → Muy bajo, probablemente nuevo
- `priceChangePercent > 100%` → Volatilidad extrema
- `priceChangePercent < -50%` → Crash post-listado
- `bidQty` o `askQty` muy bajos → Poca liquidez

---

## Resumen de Detección

| Indicador | Campo | Umbral | Acción |
|-----------|-------|--------|--------|
| Status no TRADING | `status` | != "TRADING" | 🚫 BLOQUEAR |
| Spot trading off | `isSpotTradingAllowed` | false | 🚫 BLOQUEAR |
| Volatilidad extrema | `priceChangePercent` | > 100% | 🚫 BLOQUEAR |
| Volatilidad alta | `priceChangePercent` | 50-100% | ⚠️ ADVERTIR |
| Volumen bajo | `quoteAssetVolume` | < 10k USDT | ⚠️ ADVERTIR |
| Con restricciones | `restrictions` | len > 0 | ⚠️ ADVERTIR |
| Sin iceberg/OCO | `icebergAllowed` | false | ⚠️ ADVERTIR |

---

## Nota Importante

Binance **NO proporciona una fecha de listado exacta** en la API pública. La forma más confiable de detectar "tokens nuevos" es:

1. **Volatilidad extrema** (> 100%) - Generalmente indica listado reciente
2. **Volumen muy bajo** (< $10k)
3. **Estado no TRADING** - Símbolo bajo restricción

Los tokens "en observación" suelen tener una combinación de estas características.
