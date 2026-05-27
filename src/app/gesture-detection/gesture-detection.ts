import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  signal,
  viewChild,
} from '@angular/core';
import { Subscription } from 'rxjs';
import { MediaPipeService } from './mediapipe.service';
import { LlmInterpreterService } from './llm-interpreter.service';
import { DEFAULT_VIDEO, GESTURE_CONFIG } from './gesture-config';
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
  cameraError = signal<string | null>(null);
  isLoading = signal(true);

  private subscription?: Subscription;

  constructor(
    private mediapipe: MediaPipeService,
    private llm: LlmInterpreterService,
  ) {}

  async ngAfterViewInit(): Promise<void> {
    const feedEl = this.cameraFeed();
    if (!feedEl) return;

    try {
      await this.mediapipe.initialize(feedEl.nativeElement);
      this.isLoading.set(false);

      this.subscription = this.mediapipe.results$.subscribe(async (results) => {
        const gestureId = await this.llm.interpret(results);
        if (gestureId === 'none') return;
        const gesture = GESTURE_CONFIG.find((g) => g.id === gestureId);
        if (gesture) {
          this.currentVideoSrc.set(gesture.video);
          this.isDefaultVideo.set(false);
        }
      });
    } catch {
      this.isLoading.set(false);
      this.cameraError.set('No se pudo acceder a la cámara. Verifica los permisos.');
    }
  }

  onGestureVideoEnded(): void {
    this.currentVideoSrc.set(DEFAULT_VIDEO);
    this.isDefaultVideo.set(true);
  }

  ngOnDestroy(): void {
    this.subscription?.unsubscribe();
    this.mediapipe.stop();
  }
}
