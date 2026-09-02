# 🎬 Cómo Agregar Animaciones a los LEDs

## Resumen de Cambios

He creado **4 animaciones dinámicas** para sincronizar con la rotación del motor a 1500 RPM:

| Patrón | Animación | Efecto |
|--------|-----------|--------|
| **0 - RAINBOW** | Respiración + Arcoíris deslizante | Brillo pulsante + colores dinámicos |
| **1 - RINGS** | Pulsación de anillos | Cian que parpadea suavemente |
| **2 - SPOKES** | Aspas rotantes | Las aspas giran visualmente |
| **3 - SPIRAL** | Espiral vibrant | Colores que cambian dinámicamente |

## 📝 Instrucciones para el Arduino IDE

### Opción 1: Reemplazar SOLO loop1() (RECOMENDADO)

1. Abre el archivo `Codigo pi pico.txt` en Arduino IDE
2. Busca la sección `// ============ SETUP1 Y LOOP1 (CORE 1 - LEDs) ============`
3. **ANTES de** `void loop1()`, **COPIA estas funciones nuevas:**

```cpp
// Animación de pulsación para anillos
void animateRingsPulse(uint16_t sector, uint16_t n, uint32_t animationPhase) {
    // [Ver Codigo_pi_pico_ANIMADO.txt líneas 18-35]
}

// Animación de rotación para aspas
void spokeRotating(uint16_t sector, uint16_t n, uint32_t animationPhase) {
    // [Ver Codigo_pi_pico_ANIMADO.txt líneas 37-50]
}

// Animación mejorada para espiral
void spiralVibrant(uint16_t sector, uint16_t n, uint32_t animationPhase) {
    // [Ver Codigo_pi_pico_ANIMADO.txt líneas 52-69]
}

// Rainbow mejorado
void rainbowAdvanced(uint16_t sector, uint16_t n, uint32_t animationPhase) {
    // [Ver Codigo_pi_pico_ANIMADO.txt líneas 71-83]
}
```

4. **REEMPLAZA la función** `void loop1()` con esta:

```cpp
uint32_t animationPhaseCounter = 0;

void loop1() {
    if (g_ledCountDirty) {
        g_ledCountDirty = false;
        strip.clear();
        strip.show();
    }

    if (!g_ledsEnabled) {
        strip.clear();
        strip.show();
        delay(50);
        return;
    }

    uint8_t pattern = g_ledPattern;
    uint16_t n = g_ledCount;

    // Incrementar fase de animación (0-255 cíclico)
    animationPhaseCounter = (animationPhaseCounter + 2) % 256;

    if (pattern == PATTERN_SOLID) {
        strip.fill(strip.Color(g_ledR, g_ledG, g_ledB), 0, n);
        strip.show();
        delay(20);
        return;
    }

    uint16_t sector = povCurrentSector();
    g_povSector = sector;

    // Renderizar con animación según el patrón
    switch (pattern) {
        case PATTERN_RINGS:
            animateRingsPulse(sector, n, animationPhaseCounter);
            break;
        case PATTERN_SPOKES:
            spokeRotating(sector, n, animationPhaseCounter);
            break;
        case PATTERN_SPIRAL:
            spiralVibrant(sector, n, animationPhaseCounter);
            break;
        case PATTERN_RAINBOW:
        default:
            rainbowAdvanced(sector, n, animationPhaseCounter);
            break;
    }

    strip.show();
}
```

5. **Compila y carga en el Pico**

### Opción 2: Usar archivo completo

Si quieres usar el archivo generado directamente, primero NECESITAS agregar:

```cpp
#include <math.h>  // Para sin() y cos()
```

Al principio del archivo, después de los #include existentes.

---

## 🔄 Sincronización con RPM Real

Las animaciones **ya están sincronizadas** con la rotación real porque:

1. **`sector = povCurrentSector()`** - Lee la posición REAL del motor desde Hall
2. **`animationPhaseCounter`** - Se incrementa independientemente para efectos temporales
3. **La tira gira a 1500 RPM** - Los patrones siguen ese ritmo exacto

---

## 🧪 Pruebas

Después de cargar:

1. Conecta el holograma
2. Haz gestos y verifica:
   - **Open_Palm (PATTERN 1)**: Anillos cian que PULSEAN
   - **Thumb_Down (PATTERN 2)**: Aspas ROTAN visualmente
   - **Pointing_Up (PATTERN 3)**: Espiral con colores VIBRANT
   - **Sin gesto (PATTERN 0)**: Arcoíris con efecto BREATHING

---

## ⚠️ Limitaciones Actuales

- No hay `#include <math.h>` en el firmware v3.0 (necesitas agregarlo)
- Si no compila, comenta las líneas con `sin()` y `cos()` y usa efectos más simples

---

## 💡 Posibles Mejoras Futuras

- Agregar más patrones (checkerboard, onda, fuego)
- Sincronizar animación con comandos LEDSPEED
- Efectos de transición entre patrones
- Multi-color por patrón
