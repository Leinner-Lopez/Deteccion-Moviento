import { Injectable, OnDestroy } from '@angular/core';
import { Subject } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class GestureRecognizerService implements OnDestroy {
  private recognizer: any = null;
  private stream: MediaStream | null = null;
  private videoElement: HTMLVideoElement | null = null;
  private rafId: number | null = null;
  private running = false;
  private lastProcessTime = 0;
  private readonly FRAME_INTERVAL_MS = 150;

  readonly gesture$ = new Subject<string>();

  async initialize(videoElement: HTMLVideoElement): Promise<void> {
    this.videoElement = videoElement;

    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
      audio: false,
    });
    this.stream = stream;
    videoElement.srcObject = stream;
    await new Promise<void>((resolve) => {
      videoElement.onloadeddata = () => resolve();
    });
    videoElement.play();

    const { GestureRecognizer, FilesetResolver } = await import('@mediapipe/tasks-vision');
    const vision = await FilesetResolver.forVisionTasks(
      'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm',
    );
    this.recognizer = await GestureRecognizer.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath:
          'https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task',
      },
      runningMode: 'VIDEO',
      numHands: 2,
    });

    this.running = true;
    this.processLoop();
  }

  private processLoop = (): void => {
    if (!this.running) return;
    this.rafId = requestAnimationFrame(this.processLoop);

    const now = performance.now();
    if (now - this.lastProcessTime < this.FRAME_INTERVAL_MS) return;
    if (!this.videoElement || this.videoElement.readyState < 2) return;

    this.lastProcessTime = now;
    this.processFrame(now);
  };

  private processFrame(timestamp: number): void {
    if (!this.videoElement || !this.recognizer) return;
    try {
      const result = this.recognizer.recognizeForVideo(this.videoElement, timestamp);
      for (const handGestures of result.gestures ?? []) {
        const top = handGestures[0];
        if (top && top.categoryName !== 'None') {
          this.gesture$.next(top.categoryName);
          return;
        }
      }
      this.gesture$.next('none');
    } catch {
      // ignore frame errors
    }
  }

  stop(): void {
    this.running = false;
    if (this.rafId !== null) cancelAnimationFrame(this.rafId);
    this.rafId = null;
    this.recognizer?.close();
    this.stream?.getTracks().forEach((t) => t.stop());
  }

  ngOnDestroy(): void {
    this.stop();
  }
}
