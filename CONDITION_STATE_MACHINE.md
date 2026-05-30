# Sequential Condition State Machine for BUY UP Signals

## Overview

The SPOT-BOT uses a **stateful sequential condition system** for BUY UP signals. This ensures that buy signals only occur when specific conditions are met in a specific order and maintained correctly.

## State Machine Architecture

### Three Sequential Steps

```
Step 1: Piso              Step 2: Zona Fuerte        Step 3: Breakout Alcista
MA20 < MA99          →    MA20 > MA99           →    Price in range
(Initial State)           (Transition)                 (Final Signal)
   ↓                         ↓                           ↓
step1_pisoMet = true   step2_zonaFuerteMet = true   step3_breakoutMet = true
   ↓                         ↓                           ↓
States maintain their    States maintain their      States maintain their
true values once         true values once            true values once
activated                activated                   activated
```

### Logic Flow

1. **Step 1 (Piso)**: Initial condition
   - Check: `MA20 < MA99`
   - Once true, `step1_pisoMet` stays true
   - Allows transition to step 2

2. **Step 2 (Zona Fuerte)**: Transition condition
   - Check: `MA20 > MA99` AND `step1_pisoMet === true`
   - Once true, `step2_zonaFuerteMet` stays true
   - Allows transition to step 3

3. **Step 3 (Breakout Alcista)**: Final condition
   - Check: `Price > (MA99 × 1.002) AND Price < (MA99 × 1.010)` AND `step2_zonaFuerteMet === true`
   - Once true, `step3_breakoutMet` stays true
   - **Triggers BUY signal** (false → true transition)

### Reset Mechanism

All conditions reset to false when **DOWN signal occurs**:
- DOWN Condition: `MA20 < MA99 AND Price < (MA99 × 0.970)`
- When true: Reset all steps to false
- Allows new UP sequence to start

## Implementation Details

### CryptoObserver State Variables

```javascript
this._upConditionState = {
  step1_pisoMet: false,       // Piso: MA20 < MA99
  step2_zonaFuerteMet: false, // Zona Fuerte: MA20 > MA99 (after step1)
  step3_breakoutMet: false,   // Breakout Alcista: Price in range (after step2)
};
```

### Update Method: `_updateUpConditionState()`

Called on every new 1-minute candle to update the state machine.

**Logic**:
1. Check if DOWN condition is met → Reset all steps and exit
2. Check if Step 1 can be activated (not yet active AND MA20 < MA99)
3. Check if Step 2 can be activated (Step 1 active AND Step 2 not active AND MA20 > MA99)
4. Check if Step 3 can be activated (Step 2 active AND Step 3 not active AND price in range)

### Signal Detection: `canBuyUP` getter

```javascript
get canBuyUP() {
  return this._upConditionState.step3_breakoutMet;
}
```

Returns true only when Step 3 is complete.

## Integration with GainersManager

The GainersManager detects the `false → true` transition:

```javascript
// In _checkTradingSignals()
const previousConditions = this.previousConditions.get(symbol);
const currentConditions = {
  canBuyUP: observer.canBuyUP,
  canBuyDOWN: observer.canBuyDOWN,
};

// Detect transition
if (!previousConditions.canBuyUP && currentConditions.canBuyUP) {
  this._onBuyUpSignal(symbol, observer);
}
```

This ensures:
1. Signal only triggers on the first candle where Step 3 becomes true
2. No multiple signals while Step 3 remains true
3. Signal resets automatically when DOWN condition is met

## Example Scenario

```
Candle 1: MA20=100, MA99=110, Price=108
- canBuyDOWN = true (MA20 < MA99 ✓, price < 107 ✗) → false overall
- Reset all steps: step1=false, step2=false, step3=false
- canBuyUP = false

Candle 2: MA20=101, MA99=111, Price=109
- canBuyDOWN = false
- Step 1: MA20 < MA99 (101 < 111) ✓ → step1=true
- Step 2: step1=true BUT MA20 > MA99 ✗ → no change
- Step 3: step2=false → skip
- canBuyUP = false

Candle 3: MA20=105, MA99=103, Price=104
- canBuyDOWN = false
- Step 1: already true
- Step 2: step1=true AND MA20 > MA99 (105 > 103) ✓ → step2=true
- Step 3: step2=true AND price in [103.206, 104.03] ✓ → step3=true
- canBuyUP = false → TRUE ✓ SIGNAL TRIGGERED!

Candle 4: MA20=105, MA99=103, Price=104.5
- canBuyDOWN = false
- All steps already true
- canBuyUP = true (no new signal, transition already occurred)

Candle 5: MA20=95, MA99=105, Price=100
- canBuyDOWN = true (MA20 < MA99 ✓ AND price < 101.85 ✓) → TRUE
- Reset all steps: step1=false, step2=false, step3=false
- canBuyUP = false
- System ready for next UP sequence
```

## Condition Ranges

| Condition | Formula | Example (MA99=100) |
|-----------|---------|-------------------|
| Piso (Step 1) | MA20 < MA99 | MA20 < 100 |
| Zona Fuerte (Step 2) | MA20 > MA99 | MA20 > 100 |
| Breakout Alcista (Step 3) | 1.002 × MA99 < Price < 1.010 × MA99 | 100.2 < Price < 101.0 |
| Precio Deprimido (DOWN) | Price < 0.970 × MA99 | Price < 97.0 |

## Benefits of State Machine Approach

1. **Prevents False Signals**: Requires conditions to be met in order
2. **Clear Entry Sequence**: MA20 must first be below MA99, then cross above
3. **Defined Breakout Range**: Only specific price range triggers signal
4. **Automatic Reset**: DOWN signal clears all states for new opportunity
5. **Debugging**: All three steps visible in `getConditions()` for analysis

## Monitoring State Machine

Check current conditions:
```javascript
observer.getConditions()
// Returns:
// {
//   upCondition1_Piso: boolean,
//   upCondition2_ZonaFuerte: boolean,
//   upCondition3_BreakoutAlcista: boolean,
//   canBuyUP: boolean,
//   downCondition1_ZonaDebil: boolean,
//   downCondition2_PrecioDeprimido: boolean,
//   canBuyDOWN: boolean,
//   ... other indicators
// }
```

Check full state:
```javascript
observer._upConditionState
// Returns:
// {
//   step1_pisoMet: boolean,
//   step2_zonaFuerteMet: boolean,
//   step3_breakoutMet: boolean
// }
```
