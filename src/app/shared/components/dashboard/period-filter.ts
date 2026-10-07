import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  input,
  model,
  viewChildren,
} from '@angular/core';
import type { DashboardPeriod } from '../../../utils/dashboard-period.util';

export interface PeriodOption<T extends string = string> {
  value: T;
  label: string;
}

export const DEFAULT_PERIOD_OPTIONS: readonly PeriodOption<DashboardPeriod>[] = [
  { value: 'today', label: 'Today' },
  { value: '7d', label: '7 days' },
  { value: '30d', label: '30 days' },
  { value: '90d', label: '90 days' },
  { value: 'all', label: 'All time' },
];

const NEXT_KEYS = new Set(['ArrowRight', 'ArrowDown']);
const PREVIOUS_KEYS = new Set(['ArrowLeft', 'ArrowUp']);

/**
 * A segmented time-range control with WAI-ARIA radio-group semantics: one tab stop (the chosen
 * option), arrow keys move and select, Home/End jump to the ends. Bind with `[(value)]`.
 */
@Component({
  selector: 'app-period-filter',
  template: `
    <div class="segmented" role="radiogroup" [attr.aria-label]="label()">
      @for (option of options(); track option.value; let i = $index) {
        <button
          #segment
          type="button"
          role="radio"
          class="segment"
          [class.is-active]="option.value === value()"
          [attr.aria-checked]="option.value === value()"
          [tabIndex]="i === tabStopIndex() ? 0 : -1"
          (click)="select(option.value)"
          (keydown)="moveSelection($event, i)"
        >
          {{ option.label }}
        </button>
      }
    </div>
  `,
  styleUrl: './period-filter.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PeriodFilter<T extends string> {
  public readonly options = input.required<readonly PeriodOption<T>[]>();
  public readonly value = model.required<T>();
  public readonly label = input('Time range');

  private readonly segments = viewChildren<ElementRef<HTMLButtonElement>>('segment');

  protected readonly tabStopIndex = computed(() =>
    Math.max(
      0,
      this.options().findIndex((option) => option.value === this.value()),
    ),
  );

  protected select(value: T): void {
    if (value !== this.value()) this.value.set(value);
  }

  protected moveSelection(event: KeyboardEvent, index: number): void {
    const target = targetIndex(event.key, index, this.options().length);
    if (target === null) return;
    event.preventDefault();
    this.select(this.options()[target].value);
    this.segments()[target].nativeElement.focus();
  }
}

function targetIndex(key: string, index: number, count: number): number | null {
  if (NEXT_KEYS.has(key)) return (index + 1) % count;
  if (PREVIOUS_KEYS.has(key)) return (index - 1 + count) % count;
  if (key === 'Home') return 0;
  return key === 'End' ? count - 1 : null;
}
