import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  OnInit,
  output,
  signal,
} from '@angular/core';

@Component({
  selector: 'app-preloader',
  imports: [],
  templateUrl: './preloader.html',
  styleUrl: './preloader.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Preloader implements OnInit, OnDestroy {
  public done = output<void>();
  public progress = signal(0);
  public exiting = signal(false);

  private raf = 0;
  private exitTimer = 0;
  private start = 0;

  /** Active fill duration. Kept short — this covers a real login round-trip, not a splash screen. */
  private readonly duration = 1100;
  /** Must match the `.preloader.exit` opacity transition in preloader.scss. */
  private readonly exitTransitionMs = 450;

  private readonly prefersReducedMotion =
    typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

  ngOnInit() {
    if (this.prefersReducedMotion) {
      // Skip the animation entirely rather than force motion on someone who's opted out.
      this.progress.set(100);
      this.finish();
      return;
    }
    this.start = performance.now();
    this.raf = requestAnimationFrame(this.tick);
  }

  ngOnDestroy() {
    cancelAnimationFrame(this.raf);
    clearTimeout(this.exitTimer);
  }

  private readonly tick = (now: number) => {
    const ratio = Math.min((now - this.start) / this.duration, 1);
    const eased = 1 - Math.pow(1 - ratio, 3); // ease-out cubic: quick start, gentle settle
    this.progress.set(Math.round(eased * 100));

    if (ratio < 1) {
      this.raf = requestAnimationFrame(this.tick);
    } else {
      this.finish();
    }
  };

  private finish(): void {
    this.exiting.set(true);
    this.exitTimer = setTimeout(() => this.done.emit(), this.exitTransitionMs) as unknown as number;
  }
}
