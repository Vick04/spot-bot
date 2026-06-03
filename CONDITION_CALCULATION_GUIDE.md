# Guía de Cálculo de Condiciones - SPOT-BOT v1.2.0

## 📊 Fuentes de Datos

```
┌─────────────────────────────────────────┐
│         Binance WebSocket (1m)          │
│  Candles: {open, high, low, close}      │
│  Updates: Every 1 minute                │
└──────────┬──────────────────────────────┘
           │
           ▼
┌─────────────────────────────────────────┐
│      CryptoObserver (per symbol)        │
│  Buffer: Last 99 candles (FIFO queue)   │
│  Updated: Cada nuevo candle (1m)        │
└──────────┬──────────────────────────────┘
           │
           ▼
┌─────────────────────────────────────────┐
│   GainersManager (agregador)            │
│  Gets conditions from all observers     │
│  Selecciona Top 30 símbolos             │
└─────────────────────────────────────────┘
```

---

## 🔢 Cálculo de Valores Base

### 1. **currentPrice** (Precio Actual)
```javascript
Fuente: CryptoObserver._updateSelectionState()
Valor: buffer[buffer.length - 1].close
Descripción: Close del candle más reciente (última vela 1m)
Actualización: Cada minuto
```

### 2. **gainer5m** (Ganancia 5 minutos)
```javascript
Fuente: CryptoObserver._calculateGainerForTimeframe(5)
Fórmula: ((close_now - close_5m_ago) / close_5m_ago) × 100
Donde:
  - close_now = buffer[buffer.length - 1].close
  - close_5m_ago = buffer[buffer.length - 5].close
Actualización: Cada minuto
```

### 3. **ma20** (Moving Average 20 velas)
```javascript
Fuente: CryptoObserver.ma20 (getter)
Fórmula: SUM(buffer[-20:].close) / 20
Calcula: Promedio de los últimos 20 closes
Requisito: buffer.length >= 20
Valor si insuficiente: 0
Actualización: Cada minuto (nueva vela)
```

### 4. **ma99** (Moving Average 99 velas)
```javascript
Fuente: CryptoObserver.ma99 (getter)
Fórmula: SUM(buffer[-99:].close) / 99
Calcula: Promedio de los últimos 99 closes
Requisito: buffer.length >= 99 (CRÍTICO)
Valor si insuficiente: 0
Actualización: Cada minuto (nueva vela)
```

### 5. **bbUpper** (Bollinger Band Upper)
```javascript
Fuente: CryptoObserver.bbUpper (getter)
Fórmula: 
  - MA20 = promedio últimas 20 velas
  - StdDev = desviación estándar últimas 20 velas
  - bbUpper = MA20 + (2 × StdDev)
Período: 20 velas
Desviación: 2 sigmas
Requisito: buffer.length >= 20
Valor si insuficiente: 0
Actualización: Cada minuto
```

### 6. **bbLower** (Bollinger Band Lower)
```javascript
Fuente: CryptoObserver.bbLower (getter)
Fórmula: bbLower = MA20 - (2 × StdDev)
Resto igual a bbUpper
```

---

## 🎯 Cálculo de Condiciones Secuenciales

### **Step 1: INITIALIZED** ✓
```
Condición: observer._initialized === true
Fuente: Valor booleano en CryptoObserver constructor
Trigger: Al completar CryptoObserver.initialize()
Dependencia: NINGUNA (primer paso)
Reset: Nunca (permanente)

Código:
if (!step1_initialized && this._initialized) {
  step1_initialized = true;
}
```

### **Step 2: BUFFER FULL** ✓
```
Condición: buffer.length === bufferSize (99)
Fuente: CryptoObserver.buffer array
Trigger: Después de acumular 99 candles
Dependencia: Requiere Step 1 = true
Reset: Nunca (permanente una vez lleno)

Código:
if (step1_initialized && !step2_bufferFull && 
    buffer.length === 99) {
  step2_bufferFull = true;
}
```

### **Step 3: PISO** (BBUpper < MA99)
```
Valores usados:
  - bbUpper: CryptoObserver.bbUpper (getter)
  - ma99: CryptoObserver.ma99 (getter)

Condición: bbUpper < ma99
Trigger: Cuando Bollinger Band superior cruza por debajo de MA99
Dependencia: Requiere Step 2 = true
Reset: Cuando Price < MA99 (condición 7)

Explicación:
  BBUpper < MA99 indica que la volatilidad (bands) está 
  comprimida y debajo del promedio largo plazo (trend alcista débil)

Código:
if (step2_bufferFull && !step3_pisoMet &&
    ma99 > 0 && bbUpper < ma99) {
  step3_pisoMet = true;
}
```

### **Step 4: SUBIDA** (gainer5m > 1.0%)
```
Valores usados:
  - gainer5m: CryptoObserver._gainer5m

Condición: gainer5m > 1.0
Trigger: Cuando el precio ha subido más de 1% en últimos 5m
Dependencia: Requiere Step 3 = true
Reset: Cuando Price < MA99 (condición 7)

Explicación:
  Ganancia de 5 minutos indica momentum reciente al alza

Código:
if (step3_pisoMet && !step4_subidaMet &&
    this._gainer5m > 1.0) {
  step4_subidaMet = true;
}
```

### **Step 5: COMPRA** (BBUpper < Price)
```
Valores usados:
  - bbUpper: CryptoObserver.bbUpper (getter)
  - currentPrice: buffer[buffer.length - 1].close

Condición: bbUpper < currentPrice
Trigger: Cuando precio supera la banda superior de Bollinger
Dependencia: Requiere Step 4 = true
Reset: Cuando Price < MA99 (condición 7)

Explicación:
  Precio por encima de BBUpper indica breakout de volatilidad
  (confirmación técnica de movimiento al alza)

Código:
if (step4_subidaMet && !step5_canBuy &&
    price > 0 && bbUpper < price) {
  step5_canBuy = true;
}
```

### **Step 6: INVALIDACIÓN** (Price > MA99 × 1.015)
```
Valores usados:
  - currentPrice: buffer[buffer.length - 1].close
  - ma99: CryptoObserver.ma99 (getter)

Condición: currentPrice > (ma99 × 1.015)
Trigger: Cuando precio supera MA99 más de 1.5%
Dependencia: INDEPENDIENTE (se evalúa siempre)
Reset: Nunca (permanente hasta reset total)

Explicación:
  Si precio se aleja demasiado del promedio largo plazo (>1.5%),
  la señal se invalida (demasiado rally, ya pasó el punto óptimo)

Código:
if (!step6_priceExceeded && ma99 > 0 &&
    price > (ma99 * 1.015)) {
  step6_priceExceeded = true;
}
```

### **Step 7: RESET** (Price < MA99)
```
Condición: currentPrice < ma99
Trigger: Cuando precio cae por debajo de MA99
Dependencia: Supercede todos los otros pasos
Reset: Resetea Step 1-6 completamente

Explicación:
  Si precio cae por debajo del promedio largo plazo,
  la tendencia cambió, resetear estado

Código:
if (ma99 > 0 && price < ma99) {
  step1_initialized = false;
  step2_bufferFull = false;
  step3_pisoMet = false;
  step4_subidaMet = false;
  step5_canBuy = false;
  step6_priceExceeded = false;
  return; // Sale de la función
}
```

---

## 🤖 Selección de Símbolo por el Manager

### Algoritmo en `GainersManager.getTop1hGainers(limit=30)`

```javascript
// Paso 1: Obtener todos los observers listos (buffer completo)
const allObservers = observers
  .filter(obs => obs.isReady)  // buffer.length === 99

// Paso 2: Mapear cada observer a su estado actual
const withConditions = allObservers.map((observer) => {
  const conditions = observer.getConditions();
  return {
    symbol: observer.symbol,
    price: observer.currentPrice,
    gainer5m: observer.gainer5m,
    // ... todos los valores e indicadores ...
    step3_pisoMet: conditions.step3_pisoMet,
    step4_subidaMet: conditions.step4_subidaMet,
    step5_canBuy: conditions.step5_canBuy,
    step6_priceExceeded: conditions.step6_priceExceeded,
    // Calcular highest step actual
    highestStep: conditions.step5_canBuy ? 5 
               : conditions.step4_subidaMet ? 4 
               : conditions.step3_pisoMet ? 3 
               : 0,
  };
});

// Paso 3: Filtrar solo símbolos válidos (no invalidados)
const valid = withConditions.filter((obs) => !obs.step6_priceExceeded);

// Paso 4: Fallback - mostrar el step más alto disponible
for (let step = 5; step >= 1; step--) {
  const atStep = valid.filter((obs) => {
    if (step === 5) return obs.step5_canBuy;
    if (step === 4) return obs.step4_subidaMet && !obs.step5_canBuy;
    if (step === 3) return obs.step3_pisoMet && !obs.step4_subidaMet;
    if (step === 2) return obs.step2_bufferFull && !obs.step3_pisoMet;
    if (step === 1) return obs.step1_initialized && !obs.step2_bufferFull;
  });

  if (atStep.length > 0) {
    // Paso 5: Ordenar por gainer5m descendente y retornar top 30
    return atStep
      .sort((a, b) => b.gainer5m - a.gainer5m)
      .slice(0, limit);
  }
}

return []; // Si no hay ninguno
```

### **Flujo de Selección:**

```
¿Hay símbolo en Step 5?
  SÍ → Muestra símbolos de Step 5 (máximo progreso)
  NO ↓
¿Hay símbolo en Step 4?
  SÍ → Muestra símbolos de Step 4
  NO ↓
¿Hay símbolo en Step 3?
  SÍ → Muestra símbolos de Step 3
  NO ↓
¿Hay símbolo en Step 2?
  SÍ → Muestra símbolos de Step 2
  NO ↓
¿Hay símbolo en Step 1?
  SÍ → Muestra símbolos de Step 1
  NO ↓
    → Vacío (ningún símbolo)
```

### **Ordenamiento Final:**

Dentro del Step seleccionado:
```
Ordenado por: gainer5m DESC (mayor ganancia 5m primero)
Top: 30 símbolos máximo
```

---

## 📈 Tabla Resumen: Valores → Condiciones

| Step | Nombre | Condición | Valor 1 | Valor 2 | Cálculo | Dependencia |
|------|--------|-----------|---------|---------|---------|-------------|
| 1 | INIT | `_initialized == true` | Booleano | — | Directo | Ninguna |
| 2 | BUFFER | `buffer.length == 99` | Buffer | — | Directo | Step 1 |
| 3 | PISO | `bbUpper < ma99` | Bollinger (20p, 2σ) | MA99 | Comparación | Step 2 |
| 4 | SUBIDA | `gainer5m > 1.0` | Cambio % 5m | — | % cambio | Step 3 |
| 5 | COMPRA | `bbUpper < price` | Bollinger (20p, 2σ) | Close | Comparación | Step 4 |
| 6 | INVAL | `price > ma99×1.015` | Close | MA99 | Multiplicación | Independiente |
| 7 | RESET | `price < ma99` | Close | MA99 | Comparación | Siempre |

---

## 🔄 Actualización de Valores

```
Cada minuto (nuevo candle):
  1. Buffer recibe nuevo candle → shift si necesario
  2. Recalcula: gainer5m, gainer15m, gainer30m, gainer1h
  3. Recalcula: ma20, ma99 (si buffer completo)
  4. Recalcula: bbUpper, bbLower
  5. Evalúa: Todos los steps (1-7)
  6. Manager obtiene estado → Elige Top 30
  7. Envía a cliente: Símbolos + indicadores + condiciones
```

---

## ✅ Verificación de Consistencia

El cliente recibe ahora TODOS los valores necesarios:
- ✅ `price` - para verificar Step 5, Step 6, Step 7
- ✅ `gainer5m` - para verificar Step 4
- ✅ `ma99` - para verificar Step 3, Step 6, Step 7
- ✅ `bbUpper` - para verificar Step 3, Step 5
- ✅ `bbLower` - para referencia
- ✅ `ma20` - para referencia

**Cálculo en cliente:**
```javascript
// Todos estos deben coincidir con servidor
priceVsBBUpper = gainer.price > gainer.bbUpper  // Step 5
priceLessMa99 = gainer.price < gainer.ma99       // Step 7 (reset)
bbUpperLessMa99 = gainer.bbUpper < gainer.ma99  // Step 3
```
