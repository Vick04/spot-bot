# OrderObserver Lifecycle & States

**Documento Completo sobre Ciclo de Vida y Estados**

---

## 🎯 Estados del OrderObserver

### 1. **WAITING** - Estado Inicial (Sin Posición)

```
WAITING (No tiene posición abierta)
   ↓ cada candle
Evalúa condiciones:
   - canBuyDOWN: ¿Está sobrevendido? (oversold recovery)
   - canBuyUP: ¿Está sobrecomprado? (momentum continuation)
   ↓
Si ALGUNA condición = ✓ TRUE
   ↓
Transiciona a BOUGHT
```

**Características**:
- Sin posición abierta (`isPositionOpen = false`)
- `buyPrice = 0`
- `buyStrategy = null`
- `pnlPercent = 0` (no hay ganancia/pérdida)
- `timeInTrade = 0` (no hay tiempo acumulado)

**¿Qué hace WAITING?**:
- Monitorea cada vela cerrada (cada minuto)
- Recalcula indicadores técnicos (MA20, MA99, Bollinger Bands)
- Evalúa las 2 condiciones de compra continuamente
- Espera a que una condición sea verdadera

---

### 2. **BOUGHT** - Posición Abierta (En Operación)

```
BOUGHT (Tiene posición abierta)
   ↓ cada candle
Monitorea P&L (ganancia/pérdida actual)
   ↓
Evalúa: ¿Se alcanzó el target de ganancia?
   - DOWN: Espera +0.8% de ganancia
   - UP:   Espera +7.0% de ganancia
   ↓
Si shouldSell = ✓ TRUE
   ↓
Transiciona a SOLD
```

**Características**:
- Posición abierta (`isPositionOpen = true`)
- `buyPrice = precio_donde_compré`
- `buyStrategy = "DOWN" o "UP"`
- `pnlPercent = ganancia_actual_%`
- `timeInTrade = segundos_acumulados`
- `buyTime = timestamp_ISO` (cuándo compró)

**¿Qué hace BOUGHT?**:
- Monitorea cada vela cerrada
- Calcula P&L en tiempo real
- Detecta cuándo se alcanza take-profit
- Espera a `shouldSell = true` para cerrar

**Ejemplo Real**:
```
BTCUSDT BOUGHT @ 42500 (DOWN strategy)
- candle 1: Price 42520, PnL +0.05%
- candle 2: Price 42530, PnL +0.07%
- candle 3: Price 42530, PnL +0.07% → shouldSell = FALSE (need +0.8%)
- candle 4: Price 42840, PnL +0.80% → shouldSell = TRUE
- Ejecuta SELL automáticamente
```

---

### 3. **SOLD** - Posición Cerrada (Transición)

```
SOLD (Acaba de cerrarse la posición)
   ↓ instantáneamente
Reset automático
   ↓
Vuelve a WAITING
```

**Duración**: Instantáneo (solo 1 candle)

**Qué sucede**:
- Se ejecutó `executeSell()`
- Se calcula P&L final
- Se resetea upStreak (si fue UP)
- Automáticamente vuelve a WAITING para próximo trade

---

## 📊 Ciclo Completo (Timeline)

```
Timeline completa de un OrderObserver:

Tiempo    Estado    Acción                          Valores
─────────────────────────────────────────────────────────────
T0        WAITING   Created por TradingManager      upStreak=0
T0+1min   WAITING   Evalúa candle 1                canBuyDOWN=false
T0+2min   WAITING   Evalúa candle 2                canBuyDOWN=false
T0+3min   WAITING   Evalúa candle 3                canBuyDOWN=TRUE
                    ↓
          BOUGHT    Compra (DOWN strategy)          buyPrice=42500
          ↓         Price actual=42500              pnlPercent=0%
T0+4min   BOUGHT    Monitorea candle 4              Price=42510, PnL=+0.02%
T0+5min   BOUGHT    Monitorea candle 5              Price=42530, PnL=+0.07%
T0+6min   BOUGHT    Monitorea candle 6              Price=42540, PnL=+0.09%
          ↓         shouldSell aún=FALSE            Need +0.8%
T0+7min   BOUGHT    Monitorea candle 7              Price=42840, PnL=+0.80%
          ↓         shouldSell=TRUE!                Hits target!
          SOLD      Vende (SELL)                    sellPrice=42840
          ↓         Calcula PnL final               PnL=+0.80%
T0+8min   WAITING   Resetea para próximo trade      upStreak=0 (DOWN reseteó)
T0+9min   WAITING   Busca próxima señal             canBuyDOWN=false
```

---

## 🔄 Persistencia de Valores

### ¿Qué se mantiene mientras existe el Observer?

| Valor | Persiste | Resetea Cuando |
|-------|----------|-----------------|
| `upStreak` | ✅ SÍ | DOWN se ejecuta O symbol sale top10 |
| `currentPrice` | ✅ SÍ (cada candle) | Actualiza constantemente |
| `ma20, ma99` | ✅ SÍ (cada candle) | Actualiza constantemente |
| `bbUpper, bbLower` | ✅ SÍ (cada candle) | Actualiza constantemente |
| `gainer1h` | ✅ SÍ (cada candle) | Actualiza constantemente |
| `buyPrice` | ✅ SÍ mientras BOUGHT | Reset cuando SOLD |
| `buyStrategy` | ✅ SÍ mientras BOUGHT | Reset cuando SOLD |
| `buyTime` | ✅ SÍ mientras BOUGHT | Reset cuando SOLD |
| `pnlPercent` | ✅ SÍ mientras BOUGHT | Reset cuando SOLD |
| `timeInTrade` | ✅ SÍ mientras BOUGHT | Reset cuando SOLD |

### ¿Cuándo se DESTRUYE el Observer?

El observer se destruye cuando:
```
Symbol sale del top 10 gainers
   ↓
TradingManager detecta cambio
   ↓
Llama a observer.destroy()
   ↓
- Limpia upStreak = 0
- Limpia todos los valores
- Remover listeners
- Se crea un NUEVO observer si el símbolo vuelve a entrar
```

**IMPORTANTE**: Si un símbolo sale y vuelve a entrar:
- Se crea un observer NUEVO (no reutiliza el anterior)
- upStreak empieza en 0 nuevamente
- Todos los valores empiezan desde cero

---

## 🎬 Ejemplo Visual: 2 Operaciones Consecutivas

```
Escenario: Un OrderObserver executa DOWN, luego UP

ESTADO 1: WAITING
  Symbol: BTCUSDT
  Estado: WAITING
  upStreak: 0
  canBuyDOWN: FALSE
  canBuyUP: FALSE

ESTADO 2: WAITING → Condición DOWN activada
  Symbol: BTCUSDT
  Estado: WAITING
  upStreak: 0
  canBuyDOWN: TRUE ← ¡CONDICIÓN ACTIVA!
  canBuyUP: FALSE

ESTADO 3: WAITING → BOUGHT (DOWN)
  Symbol: BTCUSDT
  Estado: BOUGHT ← ¡COMPRÓ!
  buyStrategy: "DOWN"
  buyPrice: 42500
  upStreak: 0
  pnlPercent: 0%

ESTADO 4: BOUGHT → Monitorear
  Symbol: BTCUSDT
  Estado: BOUGHT
  buyStrategy: "DOWN"
  buyPrice: 42500
  currentPrice: 42820
  pnlPercent: +0.75% ← Acercándose al target (+0.8%)

ESTADO 5: BOUGHT → shouldSell = TRUE
  Symbol: BTCUSDT
  Estado: BOUGHT
  buyStrategy: "DOWN"
  currentPrice: 42840
  pnlPercent: +0.80% ← ¡ALCANZÓ EL TARGET!
  shouldSell: TRUE ← ¡VENDE AHORA!

ESTADO 6: BOUGHT → SOLD (DOWN)
  Symbol: BTCUSDT
  Estado: SOLD
  sellStrategy: "DOWN"
  pnlPercent: +0.80%
  sellPrice: 42840

ESTADO 7: SOLD → WAITING (Automático)
  Symbol: BTCUSDT
  Estado: WAITING ← ¡Reseteado automáticamente!
  upStreak: 0 ← DOWN reseteó upStreak
  buyPrice: 0
  pnlPercent: 0%

ESTADO 8: WAITING → Siguiente oportunidad
  Symbol: BTCUSDT
  Estado: WAITING
  upStreak: 0
  canBuyDOWN: FALSE
  canBuyUP: TRUE ← Nueva condición activada

ESTADO 9: WAITING → BOUGHT (UP)
  Symbol: BTCUSDT
  Estado: BOUGHT
  buyStrategy: "UP" ← Diferentes condiciones/target
  buyPrice: 42850
  upStreak: 0 → 1 ← INCREMENTA a 1

ESTADO 10: BOUGHT → Monitorear (UP target = +7.0%)
  Symbol: BTCUSDT
  Estado: BOUGHT
  buyStrategy: "UP"
  currentPrice: 43200
  pnlPercent: +0.82% ← Aún lejos del +7.0%

ESTADO 11: BOUGHT → shouldSell = TRUE
  Symbol: BTCUSDT
  Estado: BOUGHT
  buyStrategy: "UP"
  currentPrice: 45800
  pnlPercent: +7.01% ← ¡ALCANZÓ EL TARGET!

ESTADO 12: SOLD → WAITING
  Symbol: BTCUSDT
  Estado: WAITING ← Reseteado
  upStreak: 0 ← UP RESETEÓ upStreak a 0
  pnlPercent: 0%
```

---

## 📋 Dashboard: Qué ver

### Quick View (Fila del Observer)

```
BTCUSDT | BOUGHT | 42840 | +0.80% | ... | ✓ | - | - | +0.80% | 0 | 1m 23s
```

**Lectura rápida**:
- Symbol: BTCUSDT
- Estado: BOUGHT (posición abierta)
- Precio: 42840
- Gainer 1h: +0.80% (cambio en última hora)
- canBuyDOWN: ✓ (sí, pero no importa, ya BOUGHT)
- canBuyUP: - (no)
- shouldSell: - (no, aún)
- P&L: +0.80% (ganancia actual)
- Streak: 0 (sin tradingUp consecutivos)
- Tiempo: 1m 23s (tiempo en trade)

### Detailed View (Click en la fila)

Expande para mostrar:

```
📍 Posición:
  Buy Price: 42500.00000000
  Buy Strategy: DOWN
  Buy Time: 14:23:45
  Time in Trade: 1m 23s

📊 Indicadores:
  Close Price: 42840.00000000
  MA20: 42123.50000000
  MA99: 42000.12345678
  BB Upper: 42456.78901234
  BB Lower: 41999.87654321
  Gainer 1h: +0.80%

⚡ Condiciones:
  canBuyDOWN: ✗ FALSE
  canBuyUP: ✓ TRUE
  shouldSell: ✗ FALSE
  UP Streak: 0
  Position Open: ✓ YES
```

---

## 🔐 Garantías del Sistema

### Exactamente 10 Observers

```
GainersManager.getTop1hGainers(10)
        ↓ retorna exactamente 10 elementos
TradingManager.updateTopGainers(top10)
        ↓ sincroniza orderObservers.size con 10
Resultado: SIEMPRE 10 active observers
```

**Logs para verificar**:
```
[TradingManager] 📊 TOP 10 UPDATE: 10/10 active observers
[TradingManager] Symbols: BTCUSDT,ETHUSDT,BNBUSDT,SOLUSDT,ADAUSDT,DOGEUSDT,XRPUSDT,LINKUSDT,MATICUSDT,UNIUSDT
```

### Sincronización en Tiempo Real

```
Cada minuto:
  Binance WebSocket → Nuevo candle
  ↓
  GainersManager → Actualiza todos los 186 observers
  ↓
  TradingManager → Actualiza los 10 active observers
  ↓
  Dashboard → Recibe estado vía WebSocket
```

---

## ❓ Preguntas Frecuentes

**P: ¿Por qué un observer en WAITING no está "haciendo nada"?**
A: Está haciendo TODO:
- Recibiendo datos cada minuto
- Recalculando indicadores técnicos
- Evaluando 2 condiciones de compra
- Listo para activarse cuando sea

**P: ¿Se puede tener la misma estrategia (DOWN) dos veces consecutivas?**
A: SÍ. Ejemplo:
```
BOUGHT DOWN → SOLD → WAITING → BOUGHT DOWN again → SOLD
```

**P: ¿Se puede tener UP dos veces consecutivas?**
A: NO. upStreak limita a máximo 1:
```
BOUGHT UP → SOLD → WAITING → canBuyUP = FALSE (upStreak=1)
           ↓ Espera a que DOWN se ejecute o el símbolo salga del top 10
BOUGHT DOWN → SOLD → WAITING → canBuyUP = TRUE again (upStreak=0)
```

**P: ¿Qué pasa si BTCUSDT sale del top 10 mientras tiene BOUGHT?**
A: El observer se destruye inmediatamente:
- Se pierde la posición abierta (no se vende automáticamente)
- Se crea un nuevo observer si BTCUSDT vuelve a entrar
- Ese nuevo observer empieza desde WAITING

**P: ¿Los 10 observadores son siempre los mismos?**
A: NO. Los 10 observadores son dinámicos:
- Cada ~10 minutos se recalcula el top 10
- Los símbolos que salen se destruyen
- Los símbolos que entran se crean
- Los que permanecen mantienen sus valores

**P: ¿Cuánto tiempo tarda un trade (WAITING → BOUGHT → SOLD)?**
A: Variable:
- Mínimo: ~2 minutos (DOWN rápido al +0.8%)
- Típico: 5-15 minutos
- Máximo: Indefinido (si nunca alcanza take-profit)

---

## 🎯 Monitoreo via Dashboard

El dashboard actualizado muestra:

1. **Stats Panel**: Resumen instantáneo de conteos
2. **Observer Cards**: Cada uno de los 10 con:
   - Resumen en la tarjeta (symbol, estado, precio, signals)
   - Click para expandir y ver detalles completos
3. **Event Log**: Historial de eventos en tiempo real

**Cómo leer**:
- Verde = BOUGHT o TRUE
- Gris = WAITING o FALSE
- Rosa = SOLD

---

**Status**: ✅ COMPLETO  
**Versión**: 2.0 (Con ciclo de vida completo)  
**Última Actualización**: 2026-05-26
