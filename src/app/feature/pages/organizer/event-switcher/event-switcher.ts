import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  effect,
  inject,
  output,
  viewChild,
} from '@angular/core';
import { OperatorEventContext } from '../operator-event-context';

/**
 * UX-DR6's event-switcher. A native <select> rather than the shared Select: this one has to
 * take programmatic focus and carry an aria-describedby explanation, neither of which the
 * shared control exposes.
 */
@Component({
  selector: 'app-event-switcher',
  templateUrl: './event-switcher.html',
  styleUrl: './event-switcher.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EventSwitcher {
  private readonly ctx = inject(OperatorEventContext);

  public readonly picked = output<string>();

  private readonly select = viewChild.required<ElementRef<HTMLSelectElement>>('select');

  public readonly selectId = 'operator-event-switcher';
  public readonly promptId = 'operator-event-switcher-prompt';

  public readonly activeEvent = this.ctx.activeEvent;
  public readonly prompt = this.ctx.pickPrompt;

  /** A pick that isn't currently active (e.g. a paused Event opened by link) stays listed so
   *  the switcher never claims a different Event than the page is showing. */
  public readonly options = computed(() => {
    const active = this.ctx.activeEvents();
    const current = this.ctx.activeEvent();
    return current && !active.some((e) => e.id === current.id) ? [...active, current] : active;
  });

  constructor() {
    effect(() => {
      if (this.ctx.focusRequest() > 0) {
        this.select().nativeElement.focus();
      }
    });
  }

  public onChange(value: string): void {
    this.picked.emit(value);
  }
}
