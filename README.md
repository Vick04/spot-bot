# Bot7 — Multi-Timeframe BTC/USDT Data Collector

Descarga velas de Binance (1s, 1m, 15m, 1h) desde el 01/01/2025 hasta el 27/04/2026,
calcula indicadores y los persiste en PostgreSQL. Base para el motor de simulación.

## Estructura

```
Bot7/
├── prisma/
│   └── schema.prisma          # 4 modelos: Candle1s, Candle1m, Candle15m, Candle1h
├── src/
│   ├── config/
│   │   └── constants.ts       # Parámetros globales (fechas, indicadores, símbolo)
│   ├── db/
│   │   └── prismaClient.ts    # Singleton de PrismaClient
│   ├── fetch/
│   │   └── binanceFetcher.ts  # Paginación automática de klines de Binance
│   ├── indicators/
│   │   ├── movingAverages.ts  # SMA / EMA
│   │   ├── bollingerBands.ts  # Bollinger Bands (período 20, mult 1)
│   │   ├── trix.ts            # TRIX (triple EMA de largo 19)
│   │   └── superTrend.ts      # SuperTrend (ATR 10, factor 7)
│   ├── processors/
│   │   └── candleProcessor.ts # Combina klines + todos los indicadores
│   ├── writers/
│   │   └── candleWriter.ts    # Escribe en batch a la tabla correcta
│   ├── loaders/
│   │   └── dataLoader.ts      # Orquesta fetch→process→write; chequea si ya hay datos
│   └── index.ts               # Entry point
├── .env                       # DATABASE_URL
├── package.json
└── tsconfig.json
```

## Setup

### 1. Instalar dependencias

```bash
cd C:\Projects\Bot7
npm install
```

### 2. Configurar la base de datos

Editar `.env` con tu conexión PostgreSQL:

```
DATABASE_URL="postgresql://usuario:contraseña@localhost:5432/bot7"
```

Crear la base `bot7` si no existe:

```sql
CREATE DATABASE bot7;
```

### 3. Aplicar el schema

```bash
npx prisma db push
# o para migraciones con historial:
npx prisma migrate dev --name init
```

### 4. Ejecutar

```bash
# Desarrollo (ts-node)
npm run dev

# Producción
npm run build
npm start
```

## Comportamiento al arrancar

1. Para cada timeframe (1s → 1m → 15m → 1h):
   - Si la tabla tiene datos → **skip** (no re-descarga)
   - Si la tabla está vacía → fetch completo desde Binance, procesa indicadores, escribe en DB

2. Una vez listos todos los datos → el motor de simulación se conectará aquí.

## Indicadores calculados por vela

| Campo        | Descripción                                      |
|--------------|--------------------------------------------------|
| `ma20`       | EMA(20) del close                                |
| `ma99`       | EMA(99) del close                                |
| `bbUpper`    | Bollinger Band superior (SMA20 + 1×StdDev)       |
| `bbLower`    | Bollinger Band inferior (SMA20 − 1×StdDev)       |
| `trix`       | Valor de la triple EMA(19) (escala de precio)    |
| `superTrend` | Línea SuperTrend (ATR10, factor 7)               |
| `stDirection`| +1 alcista / -1 bajista                          |

## Zona horaria

Las fechas de inicio y fin se definen en GMT-3 en `constants.ts`.
Binance recibe timestamps UTC internamente; los `openTime` almacenados
son epoch UTC ms. Para mostrar en GMT-3: `openTime - 3*3600*1000`.

## Notas sobre 1s

Las velas de 1 segundo cubren ~16 meses → ~41.7M filas.
El fetch puede tomar varias horas; la escritura en batch de 500 registros
garantiza que no se sature la memoria. Es normal que tarde.
