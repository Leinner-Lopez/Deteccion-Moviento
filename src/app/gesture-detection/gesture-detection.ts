import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  Signal,
  signal,
  viewChild,
} from '@angular/core';
import { Subscription } from 'rxjs';
import { GestureRecognizerService } from './gesture-recognizer.service';
import { HologramSerialService } from './hologram-serial.service';
import { DEFAULT_HOLOGRAM_COMMAND, DEFAULT_VIDEO, GESTURE_CONFIG } from './gesture-config';
import { VideoPlayerComponent } from './video-player/video-player';

@Component({
  selector: 'app-gesture-detection',
  imports: [VideoPlayerComponent],
  templateUrl: './gesture-detection.html',
  styleUrl: './gesture-detection.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GestureDetectionComponent implements AfterViewInit, OnDestroy {
  cameraFeed = viewChild<ElementRef<HTMLVideoElement>>('cameraFeed');

  currentVideoSrc = signal(DEFAULT_VIDEO);
  isDefaultVideo = signal(true);
  detectedGesture = signal<string>('—');
  cameraError = signal<string | null>(null);
  isLoading = signal(true);

  hologramSupported: Signal<boolean>;
  hologramConnected: Signal<boolean>;
  hologramMotorRunning = signal(false);
  hologramRPM = signal(0);
  hologramPattern = signal<number | null>(null);

  private subscriptions: Subscription[] = [];
  private monitorInterval?: ReturnType<typeof setInterval>;
  /** Último gesto comandado: evita reenviar el mismo comando a 6-7 Hz. */
  private lastCommandedGesture: string | null = null;

  constructor(
    private gestureRecognizer: GestureRecognizerService,
    private hologramSerial: HologramSerialService,
  ) {
    this.hologramSupported = this.hologramSerial.isSupported;
    this.hologramConnected = this.hologramSerial.connected;
  }

  connectHologram(): void {
    this.hologramSerial.connect();
    // Monitorea la telemetría para mostrar estado del motor
    if (this.monitorInterval) clearInterval(this.monitorInterval);
    this.monitorInterval = setInterval(() => {
      const tel = this.hologramSerial.telemetry();
      if (tel) {
        this.hologramMotorRunning.set(tel.state === 'RUNNING');
        this.hologramRPM.set(Math.round(tel.rpmReal));
        this.hologramPattern.set(tel.pattern);
      }
    }, 100);
  }

  async ngAfterViewInit(): Promise<void> {
    const feedEl = this.cameraFeed();
    if (!feedEl) return;

    try {
      await this.gestureRecognizer.initialize(feedEl.nativeElement);
      this.isLoading.set(false);

      const sub = this.gestureRecognizer.gesture$.subscribe((gestureId) => {
        if (gestureId === 'none') return;
        this.detectedGesture.set(gestureId);

        const gesture = GESTURE_CONFIG.find((g) => g.id === gestureId);
        if (!gesture) return;

        this.currentVideoSrc.set(gesture.video);
        this.isDefaultVideo.set(false);

        if (this.lastCommandedGesture !== gesture.id) {
          this.lastCommandedGesture = gesture.id;
          console.log('🎯 Enviando comando:', gesture.hologramCommand);
          this.hologramSerial.sendCommand(gesture.hologramCommand);
        }
      });
      this.subscriptions.push(sub);
    } catch {
      this.isLoading.set(false);
      this.cameraError.set('No se pudo acceder a la cámara. Verifica los permisos.');
    }
  }

  onGestureVideoEnded(): void {
    this.currentVideoSrc.set(DEFAULT_VIDEO);
    this.isDefaultVideo.set(true);
    this.lastCommandedGesture = null;
    this.hologramSerial.sendCommand(DEFAULT_HOLOGRAM_COMMAND);
  }

  ngOnDestroy(): void {
    this.subscriptions.forEach(sub => sub.unsubscribe());
    if (this.monitorInterval) clearInterval(this.monitorInterval);
    this.gestureRecognizer.stop();
  }
}
