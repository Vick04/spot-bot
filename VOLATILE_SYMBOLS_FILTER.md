# Filtrado de Símbolos Volátiles y "En Observación"

## ¿Qué es "En Observación"?

Binance marca tokens como **"En observación"** cuando:

1. **Listado Reciente**: El token fue listado hace menos de 30 días
2. **Volatilidad Extrema**: El token ha experimentado cambios de precio > 100% en 24 horas
3. **Bajo Volumen de Negociación**: Volumen insuficiente para liquidez adecuada
4. **Estado de Restricción**: Binance pone el símbolo en estado HALT, PAUSE o BREAK

Estos tokens tienen **riesgo muy alto de:**
- Manipulación de precios
- "Rug pulls" o abandono del proyecto
- Volatilidad impredecible
- Falta de liquidez

---

## Filtros Implementados en `binanceAPI.js`

### 1. **Filtro de Volatilidad Extrema**
```javascript
const changePercent = parseFloat(ticker.priceChangePercent || 0);
if (Math.abs(changePercent) > 100) {
  // Excluir: cambios > 100% o < -100%
}
```

**Por qué 100%?**
- Tokens con cambios extremos son candidatos para "En observación"
- Indica posible manipulación o falta de liquidez
- SPOT-BOT necesita movimientos predecibles para ganar

### 2. **Filtro de Estado de Símbolo**
```javascript
const info = symbolInfo.get(ticker.symbol);
if (info && info.status !== "TRADING") {
  // Excluir: HALT, PAUSE, BREAK, etc.
}
```

**Estados de Binance:**
- ✅ `TRADING` - Normal, negociación permitida
- ❌ `HALT` - Negociación pausada por Binance
- ❌ `PAUSE` - Símbolo pausado temporalmente
- ❌ `BREAK` - Intervalo de descanso
- ❌ `PRE_TRADING` - Próximo a listar

### 3. **Filtro de Volumen Mínimo**
```javascript
const vol = parseFloat(ticker.quoteVolume || 0);
if (vol < minVolume) {
  // Excluir: volumen < 10,000 USDT (por defecto)
}
```

**Por qué mínimo 10k?**
- Asegura liquidez suficiente para entrar/salir
- Tokens muy nuevos suelen tener volumen bajo

### 4. **Filtro de Órdenes Activas**
```javascript
const bidPrice = parseFloat(ticker.bidPrice || 0);
const askPrice = parseFloat(ticker.askPrice || 0);
if (bidPrice === 0 || askPrice === 0) {
  // Excluir: sin compradores/vendedores activos
}
```

**Significa:** El token está delisted o inactivo

---

## Cómo Funciona el Flujo

```
Obtener 24h ticker de Binance
         ↓
Obtener exchangeInfo (estado de símbolos)
         ↓
Filtrar por:
├─ Solo pares USDT
├─ Tiene bid/ask precio > 0
├─ Volumen ≥ 10,000 USDT
├─ |changePercent| ≤ 100%
└─ status === "TRADING"
         ↓
Guardar en symbols.json (cache diario)
```

---

## Capas Adicionales de Protección

### 1. **blacklist.json**
```json
{
  "blacklist": [
    "UUSDT",
    "USD1USDT",
    "STETHUSDT",
    ...
  ]
}
```
Manual: Añade símbolos específicos que quieras excluir.

### 2. **Parámetro Configurable**
```javascript
// Cambiar threshold de volatilidad si es necesario
getAvailableSymbols(minVolume = 10000, minListingAgeDays = 30)

// Ejemplo: Más conservador
getAvailableSymbols(50000, 60) // Volumen mínimo 50k, 60 días de edad
```

---

## Ejemplo de Símbolos Filtrados

### ✅ INCLUIDO
```
BTCUSDT - changePercent: +2.34% (normal)
ETHUSDT - changePercent: -1.20% (normal)
SOLUSDT - changePercent: +5.50% (normal)
```

### ❌ EXCLUIDO
```
SHITCOINUSDT - changePercent: +250% (volatilidad extrema)
NEWLISTUSDT - changePercent: -85% (pánico post-listado)
RESTRICTEDUSDT - status: HALT (bajo mantenimiento)
LOWVOLUMEUDT - quoteVolume: 2,000 USDT (muy bajo)
```

---

## Monitoreo

Cada vez que se inicia el bot, ve los logs:

```
[BinanceAPI] Fetching exchange info to filter recently listed symbols...
[BinanceAPI] Excluding SHITCOINUSDT - Extreme volatility: 250.50%
[BinanceAPI] Excluding RESTRICTEDUSDT - Status not TRADING: HALT
[BinanceAPI] Found 156 symbols with volume >= 10,000
```

---

## Ajustes Futuros

Si necesitas más control, puedes:

1. **Aumentar volatilidad máxima permitida**:
   ```javascript
   if (Math.abs(changePercent) > 150) // Más permisivo
   ```

2. **Añadir filtro de market cap**:
   ```javascript
   if (marketCap < 1000000) return false; // Mínimo 1M market cap
   ```

3. **Añadir filtro de edad de listado**:
   ```javascript
   const listingDaysAgo = (now - listingDate) / (24 * 60 * 60 * 1000);
   if (listingDaysAgo < 30) return false; // Mínimo 30 días
   ```

4. **Usar lista blanca en lugar de negra**:
   ```javascript
   const whitelistTokens = ["BTCUSDT", "ETHUSDT", "BNBUSDT"];
   if (!whitelistTokens.includes(ticker.symbol)) return false;
   ```

---

## Referencias

- [Binance Status Page](https://www.binance.com/en/support)
- [Binance API ExchangeInfo](https://binance-docs.github.io/apidocs/#exchange-information-user_data)
- [Símbolo bajo revisión](https://www.binance.com/en/support/announcement) (Anuncios de Binance)
