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
  private start = 0;
  private readonly duration = 2400;

  ngOnInit() {
    this.start = performance.now();
  }

  ngOnDestroy() {
    cancelAnimationFrame(this.raf);
  }
}
