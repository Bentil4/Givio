import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * Full-screen branded loading overlay. Purely presentational — visible exactly
 * while `active()` is true, nothing more. No internal timers or animation-driven
 * completion event: the caller ties it directly to real request/operation state,
 * so it can never get "stuck" or be cut off mid-animation by a navigation.
 */
@Component({
  selector: 'app-preloader',
  imports: [],
  templateUrl: './preloader.html',
  styleUrl: './preloader.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Preloader {
  public active = input.required<boolean>();
}
