# 📋 OrderObserver Specification

**Última actualización:** 2026-05-22

---

## 📌 Visión General

El `OrderObserver` es un objeto que monitorea **un único símbolo** en tiempo real y:
- Calcula indicadores técnicos (MA20, MA99, Bollinger Bands)
- Evalúa condiciones de entrada DOWN y UP
- Mantiene el estado de la posición (WAITING, BOUGHT, SOLD)
- Determina cuándo vender (take profit)
- Expone variables visibles al `TradingManager`

---

## 1️⃣ VARIABLES CONFIGURABLES (Global - para TODOS los símbolos)

Se cargan desde `src/config/constants.ts` y se usan en todos los OrderObservers.

| Variable | Tipo | Valor | Significado |
|----------|------|-------|-------------|
| `TRADING_CONFIG.downCond2` | `number` | `0.970` | % bajo ma99 para activar DOWN (close < ma99 × 0.97) |
| `TRADING_CONFIG.upCond2` | `number` | `1.015` | % sobre ma99 para activar UP (close > ma99 × 1.015) |
| `TRADING_CONFIG.downSell` | `number` | `1.008` | Take profit DOWN: +0.8% |
| `TRADING_CONFIG.upSell` | `number` | `1.070` | Take profit UP: +7.0% |

**Configuración centralizada:**
```typescript
// src/config/constants.ts
export const TRADING_CONFIG = {
  downCond2: 0.970,   // Configurable
  upCond2: 1.015,     // Configurable
  downSell: 1.008,    // Configurable
  upSell: 1.070,      // Configurable
};
```

**Ventajas de config global única:**
- ✅ Consistencia entre todos los símbolos
- ✅ Fácil de ajustar sin recrear observers
- ✅ Evita inconsistencias por symbol
- ✅ Aplica cambios a todos instantáneamente

---

## 2️⃣ VARIABLES CALCULADAS (por cada vela cerrada)

Se reciben del `CryptoObserver` y se usan para evaluar condiciones cada minuto.

| Variable | Origen | Tipo | Período | Descripción |
|----------|--------|------|---------|-------------|
| `ma20` | CryptoObserver | `number` | 20 candles | Media móvil rápida → velocidad de cambio |
| `ma99` | CryptoObserver | `number` | 99 candles | Media móvil lenta → tendencia general |
| `bbUpper` | CryptoObserver | `number` | 20 período | Banda superior de Bollinger |
| `bbLower` | CryptoObserver | `number` | 20 período | Banda inferior de Bollinger |
| `close` | CryptoObserver | `number` | Vela actual | Precio de cierre |
| `volume` | CryptoObserver | `number` | Vela actual | Volumen de trading (datos disponibles) |
| `openTime` | CryptoObserver | `timestamp` | Vela actual | Timestamp de apertura |

---

## 3️⃣ VARIABLES DE ESTADO (del OrderObserver)

**Persisten mientras el OrderObserver exista** (es decir, mientras su símbolo esté en el top 10).

### Estado de Posición
| Variable | Tipo | Valores Posibles | Descripción | Persiste |
|----------|------|-----------------|-------------|----------|
| `symbol` | `string` | BTCUSDT, ETHUSDT, etc. | Símbolo asignado | ✅ Sí |
| `estado` | `string` | `WAITING`, `BOUGHT`, `SOLD` | Estado actual | ✅ Sí |
| `buyPrice` | `number` | 0.0 - ∞ | Precio de compra (0 si WAITING) | ✅ Sí |
| `buyStrategy` | `string` | `DOWN`, `UP`, `null` | Estrategia ejecutada | ✅ Sí |
| `buyTime` | `timestamp` \| `null` | ISO 8601 | Momento de compra | ✅ Sí |

### Datos Actuales
| Variable | Tipo | Valores | Descripción | Persiste |
|----------|------|--------|-------------|----------|
| `currentPrice` | `number` | 0.0 - ∞ | Último close recibido | ✅ Sí |
| `gainer1h` | `number` | -∞ - +∞ | % ganancia en última hora | ✅ Sí |
| `isPositionOpen` | `boolean` | `true` \| `false` | ¿Hay posición abierta? | ✅ Sí |

### Control de Estrategia UP (PERSISTENTE)
| Variable | Tipo | Rango | Descripción | Persiste |
|----------|------|-------|-------------|----------|
| `upStreak` | `number` | 0-1 | Contador de UPs consecutivos | **✅ PERSISTE ENTRE TRADES** |

**upStreak persiste mientras:**
- El OrderObserver existe (símbolo en top 10)
- Incluso después de cerrar posiciones
- **Solo se resetea a 0 cuando:**
  - Se ejecuta un trade DOWN
  - Se elimina el observer (sale del top 10)
  - Sesión termina (opcional)

---

## 4️⃣ CONDICIONES A EVALUAR (cada minuto)

### DOWN Strategy (Short Recovery)

**Condición 1 - Zona Débil:**
```
ma20 < ma99 AND bbLower < ma99 AND bbUpper < ma99
```
→ El precio está sobrevendido

**Condición 2 - Precio Deprimido:**
```
close < ma99 × downCond2
```
→ Activación de compra

**SELL - Take Profit:**
```
close >= buyPrice × downSell
```

---

### UP Strategy (Continuation Play)

**Condición 1 - Zona Fuerte (bloqueada si upStreak >= 1):**
```
ma20 > ma99 AND bbLower > ma99 AND bbUpper > ma99
```
→ El precio está sobrecalentado

**Condición 2 - Breakout:**
```
close > ma99 × upCond2
```
→ Breakout alcista confirmado

**SELL - Take Profit:**
```
close >= buyPrice × upSell
```

---

## 5️⃣ VARIABLES VISIBLES PARA EL MANAGER

El `TradingManager` consulta estas variables para tomar decisiones de trading.

| Variable | Tipo | Descripción | Usado Para |
|----------|------|-------------|-----------|
| `canBuyDOWN` | `boolean` | ¿Ambas condiciones DOWN se cumplen? | Determinar si ejecutar BUY DOWN |
| `canBuyUP` | `boolean` | ¿Cond1 y Cond2 UP cumplen Y upStreak < 1? | Determinar si ejecutar BUY UP |
| `shouldSell` | `boolean` | ¿Precio alcanzó target de ganancia? | Ejecutar SELL |
| `estado` | `string` | WAITING / BOUGHT / SOLD | Saber si hay posición abierta |
| `buyStrategy` | `string` | DOWN / UP / null | Identificar qué estrategia se usó |
| `pnlPercent` | `number` | `((currentPrice - buyPrice) / buyPrice) × 100` | Monitorear P&L de posición |
| `currentPrice` | `number` | Último close recibido | Información de precio actual |
| `gainer1h` | `number` | % cambio en última hora | Monitoreo de momentum |
| `timeInTrade` | `number` (segundos) | Tiempo desde buyTime hasta ahora | Limitar duración de trades |

---

## 6️⃣ MÉTODOS DEL OrderObserver

| Método | Parámetros | Retorna | Descripción |
|--------|-----------|---------|-------------|
| `constructor(symbol)` | `symbol: string` | `void` | Inicializa con símbolo y parámetros de config |
| `updateWithCandle(candle)` | `candle: CandleData` | `void` | Procesa nueva vela, actualiza indicadores |
| `evaluateConditions()` | — | `void` | Evalúa condiciones DOWN/UP, actualiza flags |
| `executeBuy(strategy)` | `strategy: 'DOWN' \| 'UP'` | `void` | Registra compra, cambia estado a BOUGHT |
| `executeSell()` | — | `{pnl: number, pnlPercent: number}` | Calcula P&L, cambia estado a SOLD |
| `reset()` | — | `void` | Prepara para próximo trade |
| `getState()` | — | `OrderObserverState` | Retorna todas las variables visibles |

---

## 7️⃣ ARQUITECTURA - Ciclo de Vida de OrderObservers

### Inicialización (T=0)
```
TradingManager obtiene top 10 de GainersManager
        ↓
Crea 10 OrderObservers (uno por cada símbolo top)
        ↓
Map: symbol → OrderObserver
{
  DODOUSDT: OrderObserver(upStreak=0),
  GENIUSUSDT: OrderObserver(upStreak=0),
  ... (8 más)
}
```

### Actualización Diaria (Cada minuto)
```
GainersManager calcula nuevo top 10
        ↓
¿Cambió la lista?
        │
        ├─ SÍ → Diferencias
        │       ├─ Símbolos que salieron: ELIMINAR Observer
        │       └─ Símbolos que entraron: CREAR nuevo Observer
        │
        └─ NO → Mantener observers actuales
        ↓
Para cada observer existente:
  1. updateWithCandle(candle)
  2. evaluateConditions()
  3. Check trade conditions (canBuyDOWN, canBuyUP, shouldSell)
```

### Ejemplo de Cambio de Top 10

**Minuto 0:**
```
Top 10: [DODOUSDT, GENIUSUSDT, CUSDT, ICPUSDT, ...]
Observers activos: 10
```

**Minuto 5 - GENIUSUSDT sale, ETHUSDT entra:**
```
Top 10: [DODOUSDT, ETHUSDT, CUSDT, ICPUSDT, ...]

Acciones:
1. Eliminar: orderObservers.delete('GENIUSUSDT')
   └─ Se pierden datos de GENIUSUSDT
   └─ Su upStreak se va

2. Crear: new OrderObserver('ETHUSDT')
   └─ upStreak = 0 (nuevo)
   └─ estado = WAITING
   └─ buyPrice = 0

Observers activos: 10 (se mantienen)
```

**Minuto 10 - GENIUSUSDT vuelve a entrar:**
```
Top 10: [GENIUSUSDT, DODOUSDT, ETHUSDT, CUSDT, ...]

Acciones:
1. Eliminar el symbol que salió
2. Crear: new OrderObserver('GENIUSUSDT')
   └─ upStreak = 0 (NUEVO - no recupera el anterior)
   └─ Es un observer completamente nuevo

Observers activos: 10
```

**Cada minuto (al recibir vela cerrada):**

1. **Actualizar observadores:**
   ```javascript
   for (const observer of orderObservers.values()) {
     observer.updateWithCandle(candle);
   }
   ```

2. **Evaluar condiciones:**
   ```javascript
   for (const observer of orderObservers.values()) {
     observer.evaluateConditions();
   }
   ```

3. **Consultar estado:**
   ```javascript
   for (const observer of orderObservers.values()) {
     const state = observer.getState();
     // Usar canBuyDOWN, canBuyUP, shouldSell, etc.
   }
   ```

4. **Ejecutar órdenes (según lógica del manager):**
   ```javascript
   // DOWN strategy: sin límite de trades consecutivos
   if (state.canBuyDOWN && !hasOpenPosition(symbol)) {
     observer.executeBuy('DOWN');
   }
   
   // UP strategy: máximo 1 consecutivo (upStreak control)
   if (state.canBuyUP && !hasOpenPosition(symbol) && upStreak < 1) {
     observer.executeBuy('UP');
     upStreak++;
   }
   
   // Take profit para cualquier estrategia
   if (state.shouldSell && hasOpenPosition(symbol)) {
     const { pnl, pnlPercent } = observer.executeSell();
     logTrade(symbol, state.buyStrategy, pnlPercent);
     if (state.buyStrategy === 'UP') upStreak = 0;
   }
   ```

---

## 8️⃣ ESTRUCTURA DE DATOS - OrderObserverState

```typescript
interface OrderObserverState {
  // Identidad
  symbol: string;
  
  // Estado actual
  estado: 'WAITING' | 'BOUGHT' | 'SOLD';
  
  // Datos de posición abierta
  buyPrice: number;           // 0 si WAITING
  buyStrategy: 'DOWN' | 'UP' | null;  // null si WAITING
  buyTime: string | null;     // ISO 8601 o null
  
  // Precio actual
  currentPrice: number;
  
  // Evaluación de condiciones
  canBuyDOWN: boolean;
  canBuyUP: boolean;
  shouldSell: boolean;
  
  // P&L y momentum
  pnlPercent: number;
  gainer1h: number;
  
  // Timing
  timeInTrade: number;        // segundos, 0 si no hay posición
}
```

---

## 9️⃣ FLUJO TEMPORAL - Un Trade Completo

```
T=0:00 WAITING
        └─→ canBuyDOWN = false, canBuyUP = false

T=3:45 Condiciones DOWN se cumplen
        └─→ canBuyDOWN = true
        └─→ Manager: observer.executeBuy('DOWN')
        └─→ buyPrice = 1000, estado = BOUGHT

T=3:46 Precio sube ligeramente
        └─→ currentPrice = 1001
        └─→ pnlPercent = +0.1%
        └─→ shouldSell = false (necesita 1000 × 1.009 = 1009)

T=3:47 Precio continúa subiendo
        └─→ currentPrice = 1009.5
        └─→ pnlPercent = +0.95%
        └─→ shouldSell = true (1009.5 >= 1009)
        └─→ Manager: observer.executeSell()
        └─→ estado = SOLD
        └─→ Log: "DODOUSDT DOWN +0.95%"

T=3:48 Reset para próximo trade
        └─→ observer.reset()
        └─→ estado = WAITING
        └─→ buyPrice = 0, buyStrategy = null
```

---

## 🔟 LIMITACIONES GLOBALES (Controladas por TradingManager)

```typescript
// Máximo 2 trades por día (por símbolo)
DAILY_MAX_TRADES_PER_SYMBOL = 2

// Máximo P&L del 10% por día (después se para)
DAILY_MAX_PNL_PCT = 10

// Máximo 1 trade UP consecutivo
UP_MAX_STREAK = 1

// Se resetean a medianoche GMT-3
GMT3_OFFSET_MS = -10,800,000
```

---

## Archivos a Crear/Modificar

| Archivo | Acción | Descripción |
|---------|--------|-------------|
| `src/core/OrderObserver.ts` | CREATE | Clase OrderObserver |
| `src/core/TradingManager.ts` | MODIFY | Integrar OrderObservers, agregar lógica de orders |
| `src/config/constants.ts` | MODIFY | Agregar SYMBOL_PARAMS si no existe |
| `src/types/index.ts` | MODIFY | Tipos para OrderObserverState, etc. |

---

**Estado:** Especificación lista para implementación
