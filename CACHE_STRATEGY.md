# Cache Strategy - symbols.json

**Date**: 2026-05-22  
**Purpose**: Evitar rate limit (418) en reiniciadores frecuentes durante testing

---

## Problema Original

```
Cada inicio del bot:
  ├─ GET /api/v3/ticker/24hr
  ├─ Recibe: 418 (rate limit)
  ├─ Espera: 325 segundos (5+ minutos)
  └─ Frustración en testing
```

---

## Solución: Caché Inteligente por Día

```
Primer inicio (Día 1):
  ├─ Intenta GET /api/v3/ticker/24hr
  ├─ Recibe: 418 → Espera 325s
  ├─ Obtiene lista
  └─ Guarda en: symbols.json ✅

Reinicios (Día 1, después):
  ├─ Lee symbols.json
  ├─ Verifica: ¿Es de hoy?
  ├─ SÍ → Usa caché (instantáneo) ✅
  └─ Sin esperar

Siguiente día (Día 2):
  ├─ Lee symbols.json
  ├─ Verifica: ¿Es de hoy?
  ├─ NO → Descarga nuevo (espera 325s)
  ├─ Guarda en: symbols.json (actualizado)
  └─ Listo para el día 2
```

---

## Flujo Técnico

### 1. Verificar Caché
```javascript
isCacheValid()
├─ ¿Existe symbols.json?
└─ ¿Fue modificado HOY?
   ├─ SÍ → retorna true
   └─ NO → retorna false
```

### 2. Cargar desde Caché (si válido)
```javascript
loadSymbolsFromCache()
├─ Lee symbols.json
├─ Verifica isCacheValid()
├─ Si válido → retorna array de símbolos
└─ Si no → retorna null
```

### 3. Descargar de Binance (si caché inválido)
```javascript
getAvailableSymbols()
├─ Verifica caché primero
├─ Si válido → retorna caché (listo)
├─ Si no → Hace API call
│  ├─ GET /api/v3/ticker/24hr
│  ├─ Filtra: USDT + volumen > $1M
│  └─ Retorna: ~450 símbolos
└─ Guarda en symbols.json (caché updated)
```

### 4. Fallback (si API falla)
```javascript
Si API falla Y caché existe:
├─ Usa caché viejo (fallback)
└─ Log: "API failed, using stale cache"
```

---

## Formato de symbols.json

```json
{
  "symbols": [
    "BTCUSDT",
    "ETHUSDT",
    "BNBUSDT",
    ...
  ],
  "timestamp": "2026-05-22T00:00:00.000Z",
  "count": 450
}
```

---

## Escenarios de Testing

### Escenario 1: Primer Inicio (Día 1, 00:00)
```
Tiempo: 00:00
Estado: Sin symbols.json
Acción:
  ├─ isCacheValid() → false (no existe)
  ├─ Intenta API
  ├─ Recibe: 418 rate limit
  ├─ Espera: 325 segundos
  ├─ Reintenta
  ├─ ✅ Obtiene símbolos
  └─ Guarda en symbols.json

Tiempo total: ~5 minutos 30 segundos
Estado: symbols.json creado con timestamp 2026-05-22T00:00:00Z
```

### Escenario 2: Reinicio mismo día (Día 1, 00:30)
```
Tiempo: 00:30
Estado: symbols.json existe, timestamp es hoy
Acción:
  ├─ isCacheValid() → true
  ├─ loadSymbolsFromCache() → ✅ Carga 450 símbolos
  └─ Continúa boot

Tiempo total: < 1 segundo
Log: "[BinanceAPI] Loaded 450 symbols from cache"
```

### Escenario 3: 3ero Reinicio (Día 1, 14:30)
```
Tiempo: 14:30
Estado: symbols.json existe, timestamp es hoy
Acción:
  ├─ isCacheValid() → true
  ├─ loadSymbolsFromCache() → ✅ Carga 450 símbolos
  └─ Continúa boot

Tiempo total: < 1 segundo
Log: "[BinanceAPI] Loaded 450 symbols from cache"
```

### Escenario 4: Nuevo día (Día 2, 00:00)
```
Tiempo: 00:00
Estado: symbols.json existe, timestamp es 2026-05-21 (ayer)
Acción:
  ├─ isCacheValid() → false (es otro día)
  ├─ Intenta API
  ├─ Recibe: 418 rate limit
  ├─ Espera: 325 segundos
  ├─ Reintenta
  ├─ ✅ Obtiene símbolos actualizados
  └─ Guarda en symbols.json (actualizado a 2026-05-22)

Tiempo total: ~5 minutos 30 segundos
Estado: symbols.json actualizado
```

### Escenario 5: API Falla (pero caché existe)
```
Tiempo: 00:00 (Día 2, caché es Día 1)
Problema: Conexión a Binance falla
Acción:
  ├─ isCacheValid() → false (otro día)
  ├─ Intenta API
  ├─ API falla (no es 418, es error real)
  ├─ Catch: loadSymbolsFromCache() como fallback
  ├─ ✅ Carga símbolos de ayer (stale)
  └─ Bot continúa

Tiempo total: ~10 segundos
Log: "[BinanceAPI] API failed, using stale cache as fallback"
Nota: Bot opera con símbolos de ayer (minor risk)
```

---

## Beneficios para Testing

| Aspecto | Antes | Después |
|---------|-------|---------|
| Primer inicio | 5+ min | 5+ min (1 vez) |
| Reinicios | 5+ min cada uno | < 1 segundo cada uno |
| Múltiples tests | 5min × N | 5min + (< 1sec × N) |
| 10 reinicios | 50 minutos | 5 min 30 sec |

**Ahorro en testing**: ~45 minutos para 10 reinicios

---

## Gestión Manual

### Limpiar caché (forzar descarga)
```bash
# Eliminar archivo
rm symbols.json

# Siguiente inicio: fuerza descarga de Binance
```

### Ver qué hay en caché
```bash
cat symbols.json | jq '.'
```

### Verificar edad del caché
```bash
# Linux/Mac
stat symbols.json | grep Modify

# Windows PowerShell
ls -l symbols.json
```

---

## Configuración

No hay variables de entorno. El caché funciona automáticamente:
- ✅ Guarda automáticamente
- ✅ Valida automáticamente por día
- ✅ Fallback automático si API falla
- ✅ Sin configuración necesaria

---

## Logs Esperados

### Día 1, Primer Inicio
```
[BinanceAPI] Cache invalid/missing, fetching from Binance...
[BinanceAPI] Retry attempt 1/3 after 1000ms (Status: 418)
[BinanceAPI] Retry attempt 2/3 after 2000ms (Status: 418)
[BinanceAPI] Found 450 symbols with volume >= $1,000,000
[BinanceAPI] Cached 450 symbols to symbols.json
[GainersManager] Initializing 500 symbols...
```

### Día 1, Segundo Inicio (mismo día)
```
[BinanceAPI] Loaded 450 symbols from cache (2026-05-22T00:00:00.000Z)
[GainersManager] Initializing 500 symbols...
```

### Día 2, Primer Inicio (nuevo día)
```
[BinanceAPI] Cache invalid/missing, fetching from Binance...
[BinanceAPI] Retry attempt 1/3 after 1000ms (Status: 418)
[BinanceAPI] Retry attempt 2/3 after 2000ms (Status: 418)
[BinanceAPI] Found 450 symbols with volume >= $1,000,000
[BinanceAPI] Cached 450 symbols to symbols.json
[GainersManager] Initializing 500 symbols...
```

---

## Seguridad y Consideraciones

### ¿Qué pasa si símbolos cambian durante el día?
- Bajo riesgo: Nuevos símbolos no se detectan hasta mañana
- Símbolos delisted: Se detectan al siguiente día
- **Aceptable**: Los cambios son raros durante el día

### ¿Qué pasa si se resetea Binance?
- Caché se usa durante 24h
- Al día siguiente, se refresca automáticamente
- **Aceptable**: Binance no cambia drasticamente

### ¿Qué pasa si API siempre falla?
- Fallback a caché del día anterior
- Bot sigue funcionando con símbolos ligeramente viejos
- **Aceptable**: Fallback de última opción

---

**Status**: ✅ Implementado y Listo
