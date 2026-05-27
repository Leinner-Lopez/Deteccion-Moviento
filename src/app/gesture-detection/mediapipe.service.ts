import { Injectable, OnDestroy } from '@angular/core';
import { Subject } from 'rxjs';

export interface PoseLandmark {
  x: number;
  y: number;
  z: number;
  visibility: number;
}

export interface HandLandmark {
  x: number;
  y: number;
  z: number;
}

export interface MediaPipeResults {
  poseLandmarks?: PoseLandmark[];
  leftHandLandmarks?: HandLandmark[];
  rightHandLandmarks?: HandLandmark[];
}

@Injectable({ providedIn: 'root' })
export class MediaPipeService implements OnDestroy {
  private pose: any = null;
  private hands: any = null;
  private stream: MediaStream | null = null;
  private videoElement: HTMLVideoElement | null = null;
  private rafId: number | null = null;
  private running = false;
  private lastProcessTime = 0;
  private readonly FRAME_INTERVAL_MS = 150;

  private latestPose: PoseLandmark[] | undefined;
  private latestHands: { left?: HandLandmark[]; right?: HandLandmark[] } = {};

  readonly results$ = new Subject<MediaPipeResults>();

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

    const { Pose } = await import('@mediapipe/pose');
    this.pose = new Pose({
      locateFile: (file: string) => `assets/mediapipe/pose/${file}`,
    });
    this.pose.setOptions({
      modelComplexity: 1,
      smoothLandmarks: true,
      enableSegmentation: false,
      minDetectionConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });
    this.pose.onResults((results: any) => {
      this.latestPose = results.poseLandmarks?.map((lm: any) => ({
        x: lm.x,
        y: lm.y,
        z: lm.z,
        visibility: lm.visibility ?? 1,
      }));
    });

    const { Hands } = await import('@mediapipe/hands');
    this.hands = new Hands({
      locateFile: (file: string) => `assets/mediapipe/hands/${file}`,
    });
    this.hands.setOptions({
      maxNumHands: 2,
      modelComplexity: 1,
      minDetectionConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });
    this.hands.onResults((results: any) => {
      this.latestHands = {};
      results.multiHandLandmarks?.forEach((landmarks: any[], i: number) => {
        const label = results.multiHandedness?.[i]?.label;
        const pts = landmarks.map((lm: any) => ({ x: lm.x, y: lm.y, z: lm.z }));
        if (label === 'Left') this.latestHands.left = pts;
        else this.latestHands.right = pts;
      });
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
    this.sendFrame();
  };

  private async sendFrame(): Promise<void> {
    if (!this.videoElement) return;
    try {
      await Promise.all([
        this.pose?.send({ image: this.videoElement }),
        this.hands?.send({ image: this.videoElement }),
      ]);
      this.results$.next({
        poseLandmarks: this.latestPose,
        leftHandLandmarks: this.latestHands.left,
        rightHandLandmarks: this.latestHands.right,
      });
    } catch {
      // Ignorar errores de frame
    }
  }

  stop(): void {
    this.running = false;
    if (this.rafId !== null) cancelAnimationFrame(this.rafId);
    this.rafId = null;
    this.pose?.close();
    this.hands?.close();
    this.stream?.getTracks().forEach((t) => t.stop());
  }

  ngOnDestroy(): void {
    this.stop();
  }
}
