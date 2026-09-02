import { Injectable, OnDestroy, signal } from '@angular/core';

const BAUD_RATE = 115200;

/** El firmware entra en FAULT si pasan más de 2000 ms sin recibir HBT. */
const HEARTBEAT_INTERVAL_MS = 400;

/**
 * RPM de giro del holograma. El POV no puede pasar de ~505 RPM: la tira
 * refresca ~303 veces por segundo y hacen falta POV_SECTORS=36 columnas por
 * vuelta. Más rápido se saltean sectores y la figura se degrada.
 */
const HOLOGRAM_RPM = 1500;

/** Evita reintentar la recuperación de FAULT a 10 Hz (frecuencia de TEL). */
const FAULT_RECOVERY_COOLDOWN_MS = 1000;

/** Telemetría emitida por el firmware a 10 Hz: `TEL state=... rpm_target=... ...` */
const TEL_PATTERN =
  /^TEL\s+state=(\S+)\s+rpm_target=([\d.]+)\s+rpm_real=([\d.]+)\s+desfase=([\d.-]+)\s+volt=([\d.]+)\s+duty=([\d.]+)\s+hall_dt=(\d+)\s+ramp_rate=([\d.]+)/;

/** Campos añadidos al final de TEL por el firmware POV (opcionales). */
const TEL_PATTERN_FIELD = /\bpattern=(\d+)/;
const TEL_SECTOR_FIELD = /\bpov_sector=(\d+)/;
const TEL_LEDCOUNT_FIELD = /\bled_count=(\d+)/;

export interface HologramTelemetry {
  state: string;
  rpmTarget: number;
  /** RPM medidas por el sensor Hall: la única fuente válida para el POV. */
  rpmReal: number;
  desfase: number;
  volt: number;
  duty: number;
  hallDtUs: number;
  rampRate: number;
  pattern: number | null;
  povSector: number | null;
  ledCount: number | null;
}

function parseTelemetry(line: string): HologramTelemetry | null {
  const trimmed = line.trim();
  const m = TEL_PATTERN.exec(trimmed);
  if (!m) return null;

  const optional = (re: RegExp): number | null => {
    const hit = re.exec(trimmed);
    return hit ? Number(hit[1]) : null;
  };

  return {
    state: m[1],
    rpmTarget: Number(m[2]),
    rpmReal: Number(m[3]),
    desfase: Number(m[4]),
    volt: Number(m[5]),
    duty: Number(m[6]),
    hallDtUs: Number(m[7]),
    rampRate: Number(m[8]),
    pattern: optional(TEL_PATTERN_FIELD),
    povSector: optional(TEL_SECTOR_FIELD),
    ledCount: optional(TEL_LEDCOUNT_FIELD),
  };
}

@Injectable({ providedIn: 'root' })
export class HologramSerialService implements OnDestroy {
  readonly isSupported = signal('serial' in navigator);
  readonly connected = signal(false);
  /** Última telemetría recibida (no se muestra en la vista, pero queda disponible). */
  readonly telemetry = signal<HologramTelemetry | null>(null);

  private port: SerialPort | null = null;
  private writer: WritableStreamDefaultWriter<Uint8Array> | null = null;
  private reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  private heartbeatId: ReturnType<typeof setInterval> | null = null;
  private rxBuffer = '';
  /** El POV necesita giro: la web arranca el motor y sostiene el heartbeat. */
  private motorShouldRun = false;
  private lastRecoveryAt = 0;

  async connect(): Promise<void> {
    if (!this.isSupported() || this.connected()) return;

    const port = await navigator.serial.requestPort();
    await port.open({ baudRate: BAUD_RATE });

    this.port = port;
    this.writer = port.writable?.getWriter() ?? null;
    this.connected.set(this.writer !== null);
    if (!this.connected()) return;

    this.startReadLoop();

    // El watchdog del firmware mide contra el último HBT recibido, que puede
    // ser de hace minutos. Hay que refrescarlo ANTES de arrancar el motor o
    // updateMotor() dispara FAULT en el primer ciclo.
    await this.sendCommand('HBT');
    this.heartbeatId = setInterval(() => this.sendCommand('HBT'), HEARTBEAT_INTERVAL_MS);

    // Si la sesión anterior murió sin STOP, la placa quedó en FAULT y START
    // sería rechazado. RESET fuera de FAULT solo responde un error inofensivo.
    await this.sendCommand('RESET');
    await this.sendCommand('LEDS ON');
    await this.sendCommand('PATTERN 0');

    this.motorShouldRun = true;
    await this.sendCommand(`START ${HOLOGRAM_RPM}`);
  }

  async sendCommand(command: string): Promise<void> {
    if (!this.writer) {
      console.warn('❌ Writer no disponible. Puerto desconectado?');
      return;
    }
    try {
      console.log('📤 Escribiendo en puerto:', command);
      await this.writer.write(new TextEncoder().encode(command + '\n'));
      console.log('✅ Comando enviado:', command);
    } catch (err) {
      console.error('❌ Error escribiendo:', err);
    }
  }

  /**
   * Drena el puerto continuamente: el firmware emite telemetría a 10 Hz y, si
   * nadie lee, el stream acumula backpressure.
   */
  private async startReadLoop(): Promise<void> {
    const readable = this.port?.readable;
    if (!readable) return;

    const reader = readable.getReader();
    this.reader = reader;
    const decoder = new TextDecoder();

    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        if (value) this.ingest(decoder.decode(value, { stream: true }));
      }
    } catch {
      // lectura cancelada o puerto perdido
    } finally {
      try {
        reader.releaseLock();
      } catch {
        // ignorar
      }
      if (this.reader === reader) this.reader = null;
    }
  }

  private ingest(chunk: string): void {
    this.rxBuffer += chunk;
    let idx: number;
    while ((idx = this.rxBuffer.indexOf('\n')) >= 0) {
      const line = this.rxBuffer.slice(0, idx).replace(/\r$/, '');
      this.rxBuffer = this.rxBuffer.slice(idx + 1);
      this.handleLine(line);
    }
    // Evita crecer sin límite si nunca llega un salto de línea.
    if (this.rxBuffer.length > 4096) this.rxBuffer = '';
  }

  private handleLine(line: string): void {
    const tel = parseTelemetry(line);
    if (!tel) {
      if (line.startsWith('OK') || line.startsWith('ERR')) {
        console.log('📨 Respuesta firmware:', line);
      }
      return;
    }
    this.telemetry.set(tel);
    console.log('📊 Patrón actual:', tel.pattern, 'Sector:', tel.povSector);
    if (tel.state === 'FAULT') this.recoverFromFault();
  }

  /**
   * El firmware queda bloqueado en FAULT hasta recibir RESET, y RESET deja el
   * motor detenido (rpmTarget = 0). Sin giro no hay pulsos de Hall y el POV se
   * apaga, así que hay que volver a arrancarlo.
   */
  private recoverFromFault(): void {
    const now = Date.now();
    if (now - this.lastRecoveryAt < FAULT_RECOVERY_COOLDOWN_MS) return;
    this.lastRecoveryAt = now;

    void (async () => {
      await this.sendCommand('HBT');
      await this.sendCommand('RESET');
      if (this.motorShouldRun) await this.sendCommand(`START ${HOLOGRAM_RPM}`);
    })();
  }

  async disconnect(): Promise<void> {
    if (this.heartbeatId !== null) {
      clearInterval(this.heartbeatId);
      this.heartbeatId = null;
    }

    // Deja el hardware en un estado seguro antes de soltar el puerto.
    this.motorShouldRun = false;
    await this.sendCommand('STOP');
    await this.sendCommand('LEDS OFF');

    try {
      await this.reader?.cancel();
    } catch {
      // ignorar
    }
    this.reader = null;

    try {
      this.writer?.releaseLock();
      await this.port?.close();
    } catch {
      // ignorar errores al cerrar
    }
    this.writer = null;
    this.port = null;
    this.rxBuffer = '';
    this.telemetry.set(null);
    this.connected.set(false);
  }

  ngOnDestroy(): void {
    this.disconnect();
  }
}
