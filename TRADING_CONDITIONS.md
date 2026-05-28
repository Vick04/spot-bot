# 📈 Condiciones de Trading - SPOT-BOT

Última actualización: 2026-05-22

---

## 📋 Resumen Ejecutivo

El bot implementa **2 estrategias independientes y simultáneas**:

1. **STRATEGY "DOWN"**: Compra en zonas de debilidad, sin límites de trades consecutivos
2. **STRATEGY "UP"**: Compra en zonas de fortaleza, máximo 1 trade consecutivo

Ambas estrategias se evalúan **SIMULTÁNEAMENTE** cada minuto. La que cumpla sus condiciones primero entra.

---

## 🔴 ESTRATEGIA "DOWN" (Short Recovery)

### BUY Conditions (Dos pasos)

**Condición 1 - Detección de Zona Débil:**
```
Cond1: ma20 < ma99 AND bbLower < ma99 AND bbUpper < ma99
```

**Interpretación:**
- `ma20 < ma99`: Media rápida (20 períodos) está por debajo de media lenta (99 períodos) → Tendencia bajista
- `bbLower < ma99`: Banda inferior de Bollinger < media lenta → Precio ha caído significativamente
- `bbUpper < ma99`: Banda superior de Bollinger < media lenta → Incluso el techo del rango está abajo

**Resultado:** El precio está en una **zona de sobrevendida** - condiciones de recuperación

---

**Condición 2 - Confirmación de Precio Deprimido:**
```
Cond2: close < ma99 * downCond2
```

**Parámetros por Symbol:**
| Symbol  | downCond2 | Significado |
|---------|-----------|-------------|
| BTCUSDT | 0.970     | close < ma99 × 0.97 (3% bajo ma99) |
| ETHUSDT | 0.964     | close < ma99 × 0.964 (3.6% bajo) |
| BNBUSDT | 0.966     | close < ma99 × 0.966 (3.4% bajo) |
| SOLUSDT | 0.970     | close < ma99 × 0.97 (3% bajo) |
| XRPUSDT | 0.964     | close < ma99 × 0.964 (3.6% bajo) |
| ADAUSDT | 0.953     | close < ma99 × 0.953 (4.7% bajo) |

**Default:** 0.980

**Interpretación:** El precio cierra por debajo de un % específico de la media lenta → **Activación de compra**

---

### SELL Condition (Take Profit)

```
close >= buyPrice × downSell
```

**Parámetros por Symbol:**
| Symbol  | downSell | Ganancia Esperada |
|---------|----------|-------------------|
| BTCUSDT | 1.009    | +0.9% |
| ETHUSDT | 1.007    | +0.7% |
| BNBUSDT | 1.007    | +0.7% |
| SOLUSDT | 1.008    | +0.8% |
| XRPUSDT | 1.006    | +0.6% |
| ADAUSDT | 1.005    | +0.5% |

**Default:** 1.008

**Lógica:** Es una estrategia de recuperación rápida → Ganancia baja (0.5-0.9%) pero con alta probabilidad

---

## 🟢 ESTRATEGIA "UP" (Continuation Play)

### BUY Conditions (Dos pasos)

**Condición 1 - Detección de Zona Fuerte:**
```
Cond1: ma20 > ma99 AND bbLower > ma99 AND bbUpper > ma99
```

**Interpretación:**
- `ma20 > ma99`: Media rápida > media lenta → Tendencia alcista fuerte
- `bbLower > ma99`: Banda inferior > media lenta → Precio ha subido significativamente
- `bbUpper > ma99`: Banda superior > media lenta → El rango completo está sobre la media

**Resultado:** El precio está en una **zona de sobrecalentamiento** - condiciones de continuación alcista

---

**Condición 2 - Confirmación de Breakout:**
```
Cond2: close > ma99 * upCond2
```

**Parámetros por Symbol:**
| Symbol  | upCond2 | Significado |
|---------|---------|-------------|
| BTCUSDT | 1.018   | close > ma99 × 1.018 (+1.8% sobre ma99) |
| ETHUSDT | 1.012   | close > ma99 × 1.012 (+1.2% sobre) |
| BNBUSDT | 1.014   | close > ma99 × 1.014 (+1.4% sobre) |
| SOLUSDT | 1.020   | close > ma99 × 1.020 (+2.0% sobre) |
| XRPUSDT | 1.030   | close > ma99 × 1.030 (+3.0% sobre) |
| ADAUSDT | 1.027   | close > ma99 × 1.027 (+2.7% sobre) |

**Default:** 1.012

**Interpretación:** El precio cierra por encima de un % específico de la media lenta → **Breakout alcista**

---

### SELL Condition (Take Profit)

```
close >= buyPrice × upSell
```

**Parámetros por Symbol:**
| Symbol  | upSell | Ganancia Esperada |
|---------|--------|-------------------|
| BTCUSDT | 1.010  | +1.0% |
| ETHUSDT | 1.009  | +0.9% |
| BNBUSDT | 1.008  | +0.8% |
| SOLUSDT | 1.008  | +0.8% |
| XRPUSDT | 1.007  | +0.7% |
| ADAUSDT | 1.006  | +0.6% |

**Default:** 1.010

**Lógica:** Estrategia de continuación → Ganancia media (0.6-1.0%) con probabilidad moderada-alta

---

## 🎯 Límite de Estrategia UP: "UP Streak"

```typescript
const UP_MAX_STREAK = 1;  // Máximo 1 trade UP consecutivo
```

### Reglas:

1. **Cond1 se bloquea cuando:** `upStreak >= UP_MAX_STREAK` (igual a 1)
   - Esto previene que entre 2 veces seguidas en UP
   - Solo se evalúa DOWN si upStreak = 1

2. **upStreak se incrementa:** Después de cada trade UP exitoso
   - Contador: 0 → 1 → 0 (al ejecutar DOWN)

3. **upStreak se resetea a 0:**
   - Cuando `bbLower < ma99` (precio sale de zona UP)
   - Cuando se ejecuta un trade DOWN
   - Cuando se cierra sesión

### Beneficio:
- ✅ Evita "FOMO" (entrar repetidamente en subidas)
- ✅ Obliga a alternar con DOWN strategy
- ✅ Reduce riesgo de drawdown acumulativo

---

## 📊 Comparativa de Estrategias

| Aspecto | DOWN | UP |
|---------|------|-----|
| **Zona de Precio** | Débil (sobrevendido) | Fuerte (sobrecalentado) |
| **Señal Cond1** | Todas las BB < ma99 | Todas las BB > ma99 |
| **Señal Cond2** | Precio muy bajo | Precio muy alto |
| **Ganancia Esperada** | 0.5% - 0.9% | 0.6% - 1.0% |
| **Probabilidad** | Alta | Moderada-Alta |
| **Límite** | Ninguno | 1 consecutivo (upStreak) |
| **Win Rate Teórico** | ~65-70% | ~60-65% |

---

## 🔄 Flujo de Ejecución por Minuto

```
┌─────────────────────────────────────────────────────────┐
│ Cada vela que cierra (cada minuto)                      │
└─────────────────────────────────────────────────────────┘
                         │
                         ▼
            ┌────────────────────────┐
            │ Calcular Indicadores   │
            │ - MA20, MA99           │
            │ - Bollinger Bands      │
            │ - Volume               │
            └────────────────────────┘
                         │
                         ▼
        ┌─────────────────────────────────┐
        │ Evaluar Condiciones en Orden:   │
        │ 1. DOWN strategy check          │
        │ 2. UP strategy check            │
        └─────────────────────────────────┘
                         │
         ┌───────────────┼───────────────┐
         │               │               │
         ▼               ▼               ▼
    ┌────────┐      ┌────────┐      ┌────────┐
    │ DOWN   │      │ UP     │      │ NONE   │
    │ MATCH  │      │ MATCH  │      │ (wait) │
    └────────┘      └────────┘      └────────┘
         │               │
         ▼               ▼
    ┌────────────────────────┐
    │ Si no hay trades abiertos│
    │ COMPRAR al precio actual│
    └────────────────────────┘
         │
         ▼
    ┌────────────────────────┐
    │ Monitorear cada minuto  │
    │ VENDER si:             │
    │ close >= buyPrice × mult│
    │ mult = downSell/upSell  │
    └────────────────────────┘
```

---

## 💾 Límites Globales

```typescript
// Máximo 2 trades por día
DAILY_MAX_TRADES = 2

// Máximo P&L del 10% por día (después se para)
DAILY_MAX_PNL_PCT = 10

// Se resetean a medianoche GMT-3
GMT3_OFFSET_MS = -10,800,000 ms
```

**Ejemplo:**
- Trade 1: DOWN, gana +0.8% → Total: +0.8%
- Trade 2: UP, gana +0.9% → Total: +1.7%
- Trade 3: DOWN, gana +0.8% → **BLOQUEADO** (DAILY_MAX_TRADES = 2)

---

## 🎛️ Indicadores Técnicos Usados

| Indicador | Período | Uso |
|-----------|---------|-----|
| MA (Fast) | 20 | Velocidad de cambio (Cond1) |
| MA (Slow) | 99 | Tendencia general (Cond1, Cond2) |
| Bollinger Bands | 20, mult=1 | Volatilidad / Extremos (Cond1) |
| Volumen | 20 | (Datos disponibles pero no usado actualmente) |

---

## ⚙️ Configuración por Symbol

Las siguientes líneas pueden editarse en `src/config/constants.ts`:

```typescript
export const SYMBOL_PARAMS: Record<string, SymbolParams> = {
  BTCUSDT: { downCond2: 0.97,  upCond2: 1.018, downSell: 1.009, upSell: 1.010 },
  ETHUSDT: { downCond2: 0.964, upCond2: 1.012, downSell: 1.007, upSell: 1.009 },
  BNBUSDT: { downCond2: 0.966, upCond2: 1.014, downSell: 1.007, upSell: 1.008 },
  SOLUSDT: { downCond2: 0.97,  upCond2: 1.020, downSell: 1.008, upSell: 1.008 },
  XRPUSDT: { downCond2: 0.964, upCond2: 1.030, downSell: 1.006, upSell: 1.007 },
  ADAUSDT: { downCond2: 0.953, upCond2: 1.027, downSell: 1.005, upSell: 1.006 },
};
```

**Para cambiar parámetros:**
1. Editar los valores en el objeto
2. Ejecutar `npm run simulate:multi` para validar con datos históricos
3. Hacer deploy cuando confirms estes satisfecho

---

## 📝 Archivos Fuente

- **Lógica de Condiciones:** `src/simulator/conditions.ts`
- **Parámetros:** `src/config/constants.ts`
- **Observer por Symbol:** `src/core/observer.ts`
- **Manager de Trading:** `src/core/manager.ts`
- **Ejecución:** `src/execution/executor.ts`

---

## 🚀 Notas Importantes

1. **Las estrategias compiten**: Cada minuto se evalúan ambas, pero solo entra una
2. **DOWN no tiene límite**: Puede entrar múltiples veces consecutivas
3. **UP tiene límite**: máximo 1 consecutivo antes de resetear
4. **Las ganancias son pequeñas**: 0.5-1.0% por trade → Objetivo es consistencia, no home runs
5. **El timing es crucial**: Cualquier millisegundo de retraso en cálculos afecta entry price
