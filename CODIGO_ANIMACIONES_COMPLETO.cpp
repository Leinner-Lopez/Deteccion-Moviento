// ============================================================================
// REEMPLAZAR ESTAS SECCIONES EN "Codigo pi pico.txt"
// ============================================================================

// 1. AGREGAR ESTE #include AL INICIO (después de #include <Adafruit_NeoPixel.h>)
// ============================================================================

#include <math.h>

// 2. REEMPLAZAR LA SECCIÓN DE CORE 1 (SETUP1 Y LOOP1)
// ============================================================================
// Busca: "// ============ SETUP1 Y LOOP1 (CORE 1 - LEDs) ============"
// Y reemplaza TODO desde ahí hasta el final del archivo por esto:

// ============================================================================
// GLOBAL: Contador de fase para animaciones
uint32_t animationPhaseCounter = 0;

// ============ ANIMACIONES POV ============

// Función auxiliar: mapea un float [-1, 1] a uint8_t [0, 255]
uint8_t sineToUint8(float sineValue) {
    // sineValue está entre -1.0 y 1.0
    // Convertir a 0-255
    uint8_t result = (uint8_t)((sineValue + 1.0f) * 127.5f);
    return result;
}

// ANIMACIÓN 1: Anillos con pulsación (PATTERN 1)
void animateRingsPulse(uint16_t sector, uint16_t n, uint32_t animationPhase) {
    // Pulsación: los anillos se hacen más brillantes y oscuros
    float phase = (float)animationPhase * 3.14159265f / 255.0f;  // 0 a PI
    float sineValue = sin(phase);  // -1 a 1
    uint8_t brightness = sineToUint8(sineValue);
    brightness = map(brightness, 0, 255, 80, 200);  // Rango: 80-200

    if (sector == 0) {
        strip.fill(strip.Color(255, 255, 255), 0, n);
        return;
    }

    for (uint16_t i = 0; i < n; i++) {
        bool on = ((((uint32_t)i * 8) / n) % 2) == 0;
        if (on) {
            uint8_t g = (uint8_t)((200 * brightness) / 255);
            uint8_t b = (uint8_t)((255 * brightness) / 255);
            strip.setPixelColor(i, strip.Color(0, g, b));
        } else {
            strip.setPixelColor(i, 0);
        }
    }
}

// ANIMACIÓN 2: Aspas rotantes (PATTERN 2)
void spokeRotating(uint16_t sector, uint16_t n, uint32_t animationPhase) {
    // Las aspas rotan suavemente en el espacio
    uint16_t armPeriod = POV_SECTORS / 6;
    if (armPeriod == 0) armPeriod = 1;

    // Offset de rotación basado en fase de animación
    uint16_t rotationOffset = (animationPhase * POV_SECTORS) / 256;
    uint16_t rotatedSector = (sector + rotationOffset) % POV_SECTORS;

    bool arm = (rotatedSector % armPeriod) < (armPeriod / 2 + 1);

    if (arm) {
        // Rojo vibrante
        strip.fill(strip.Color(255, 40, 0), 0, n);
    } else {
        // Negro (apagado)
        strip.fill(strip.Color(0, 0, 0), 0, n);
    }
}

// ANIMACIÓN 3: Espiral vibrant (PATTERN 3)
void spiralVibrant(uint16_t sector, uint16_t n, uint32_t animationPhase) {
    // Espiral violeta con colores que varían dinámicamente
    uint8_t colorShift = (uint8_t)animationPhase;

    for (uint16_t i = 0; i < n; i++) {
        uint16_t phase = (uint16_t)((sector * 3 + ((uint32_t)i * POV_SECTORS) / n) % POV_SECTORS);
        bool on = phase < (POV_SECTORS / 4);

        if (on) {
            // Espiral con cambio de color dinámico
            float sine1 = sin((float)(phase + colorShift) * 3.14159265f / 128.0f);
            float cos1 = cos((float)(phase + colorShift) * 3.14159265f / 128.0f);

            uint8_t r = 140 + (int8_t)(sine1 * 30);
            uint8_t b = 255 + (int8_t)(cos1 * 50);
            r = constrain(r, 0, 255);
            b = constrain(b, 0, 255);
            strip.setPixelColor(i, strip.Color(r, 0, b));
        } else {
            strip.setPixelColor(i, 0);
        }
    }
}

// ANIMACIÓN 4: Rainbow con efectos avanzados (PATTERN 0)
void rainbowAdvanced(uint16_t sector, uint16_t n, uint32_t animationPhase) {
    static uint16_t drift = 0;
    drift += (uint16_t)(g_ledSpeed >> 2);

    uint16_t base = (uint16_t)(((uint32_t)sector * 65535UL) / POV_SECTORS) + drift;
    for (uint16_t i = 0; i < n; i++) {
        uint16_t hue = base + (uint16_t)(((uint32_t)i * 8192UL) / n);
        strip.setPixelColor(i, strip.gamma32(strip.ColorHSV(hue)));
    }
}

// ============ SETUP1 (Core 1) ============
void setup1() {
    strip.begin();
    strip.show();
    strip.setBrightness(LED_BRIGHTNESS_MAX);
}

// ============ LOOP1 (Core 1) - CON ANIMACIONES ============
void loop1() {
    // Limpiar si cambió el count de LEDs
    if (g_ledCountDirty) {
        g_ledCountDirty = false;
        strip.clear();
        strip.show();
    }

    // Si LEDs deshabilitados, apagar
    if (!g_ledsEnabled) {
        strip.clear();
        strip.show();
        delay(50);
        return;
    }

    uint8_t pattern = g_ledPattern;
    uint16_t n = g_ledCount;

    // Incrementar fase de animación (0-255 cíclico) - velocidad: +2 por ciclo
    animationPhaseCounter = (animationPhaseCounter + 2) % 256;

    // Modo color sólido (sin POV)
    if (pattern == PATTERN_SOLID) {
        strip.fill(strip.Color(g_ledR, g_ledG, g_ledB), 0, n);
        strip.show();
        delay(20);
        return;
    }

    // Modo POV: sincronizar con rotación real
    uint16_t sector = povCurrentSector();
    g_povSector = sector;

    // Renderizar patrón con animación
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

    // Enviar a tira LED
    strip.show();
}

// ============================================================================
// FIN DE LAS SECCIONES A REEMPLAZAR
// ============================================================================
