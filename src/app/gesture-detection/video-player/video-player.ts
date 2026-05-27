import { ChangeDetectionStrategy, Component, effect, ElementRef, input, output, viewChild } from '@angular/core';

@Component({
  selector: 'app-video-player',
  templateUrl: './video-player.html',
  styleUrl: './video-player.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VideoPlayerComponent {
  src = input.required<string>();
  loop = input(false);
  ended = output<void>();

  videoEl = viewChild<ElementRef<HTMLVideoElement>>('videoEl');

  constructor() {
    effect(() => {
      const el = this.videoEl();
      if (!el) return;
      const video = el.nativeElement;
      const src = this.src();
      video.loop = this.loop();
      video.src = src;
      video.load();
      video.play().catch(() => {});
    });
  }

  onEnded(): void {
    this.ended.emit();
  }
}
