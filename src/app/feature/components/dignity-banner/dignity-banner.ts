import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  afterNextRender,
  booleanAttribute,
  inject,
  input,
} from '@angular/core';
import { A11yModule } from '@angular/cdk/a11y';
import { MatIconModule } from '@angular/material/icon';

let nextId = 0;

/**
 * Family-facing, calm (info-blue, never red/amber) message patterned after ConnectionBanner.
 *
 * The `modal` variant is for questions that must be answered before the page can continue
 * (the personal-device prompt): it has no dismiss control at all — a dismiss that did nothing
 * would be worse than none — and traps focus, landing on the first projected action (or the
 * one marked `cdkFocusInitial`) as soon as it renders.
 */
@Component({
  selector: 'app-dignity-banner',
  imports: [A11yModule, MatIconModule],
  templateUrl: './dignity-banner.html',
  styleUrl: './dignity-banner.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DignityBanner {
  public readonly heading = input.required<string>();
  public readonly detail = input('');
  public readonly icon = input('info');
  public readonly modal = input(false, { transform: booleanAttribute });

  protected readonly headingId = `dignity-heading-${nextId}`;
  protected readonly detailId = `dignity-detail-${nextId++}`;

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  constructor() {
    // Explicit rather than cdkTrapFocusAutoCapture: the CDK's own capture skips any control its
    // visibility heuristics can't measure yet, silently leaving focus on <body>.
    afterNextRender(() => {
      if (!this.modal()) return;
      const root = this.host.nativeElement;
      const target =
        root.querySelector<HTMLElement>('[cdkFocusInitial]') ??
        root.querySelector<HTMLElement>('button, [href], input, select, textarea');
      target?.focus();
    });
  }
}
