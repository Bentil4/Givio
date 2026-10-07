import { TestBed } from '@angular/core/testing';
import type { DashboardPeriod } from '../../../utils/dashboard-period.util';
import { DEFAULT_PERIOD_OPTIONS, PeriodFilter } from './period-filter';

describe('PeriodFilter', () => {
  async function render(value: DashboardPeriod = '7d') {
    const fixture = TestBed.createComponent(PeriodFilter<DashboardPeriod>);
    fixture.componentRef.setInput('options', DEFAULT_PERIOD_OPTIONS);
    fixture.componentRef.setInput('value', value);
    const emitted: DashboardPeriod[] = [];
    fixture.componentInstance.value.subscribe((period) => emitted.push(period));
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    return { fixture, el, emitted, radios: () => Array.from(el.querySelectorAll('button')) };
  }

  function press(button: HTMLButtonElement, key: string): void {
    button.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
  }

  it('is a labelled radio group with the default options', async () => {
    const { el, radios } = await render();

    expect(el.querySelector('[role="radiogroup"]')?.getAttribute('aria-label')).toBe('Time range');
    expect(radios().map((r) => r.textContent?.trim())).toEqual([
      'Today',
      '7 days',
      '30 days',
      '90 days',
      'All time',
    ]);
    expect(radios().every((r) => r.getAttribute('role') === 'radio')).toBe(true);
  });

  it('checks the chosen option and makes it the only tab stop', async () => {
    const { radios } = await render('30d');

    expect(radios().map((r) => r.getAttribute('aria-checked'))).toEqual([
      'false',
      'false',
      'true',
      'false',
      'false',
    ]);
    expect(radios().map((r) => r.tabIndex)).toEqual([-1, -1, 0, -1, -1]);
  });

  it('emits the clicked option', async () => {
    const { fixture, radios, emitted } = await render();

    radios()[3].click();
    await fixture.whenStable();

    expect(emitted).toEqual(['90d']);
    expect(radios()[3].getAttribute('aria-checked')).toBe('true');
  });

  it('does not re-emit the option already chosen', async () => {
    const { radios, emitted } = await render('7d');

    radios()[1].click();

    expect(emitted).toEqual([]);
  });

  it('moves selection and focus with the arrow keys, wrapping at the ends', async () => {
    const { fixture, radios, emitted } = await render('today');

    press(radios()[0], 'ArrowRight');
    await fixture.whenStable();
    expect(document.activeElement).toBe(radios()[1]);

    press(radios()[1], 'ArrowUp');
    press(radios()[0], 'ArrowLeft');
    await fixture.whenStable();

    expect(emitted).toEqual(['7d', 'today', 'all']);
    expect(document.activeElement).toBe(radios()[4]);
    expect(radios()[4].tabIndex).toBe(0);
  });

  it('jumps to the first and last options with Home and End', async () => {
    const { radios, emitted } = await render('30d');

    press(radios()[2], 'End');
    press(radios()[4], 'Home');

    expect(emitted).toEqual(['all', 'today']);
  });

  it('ignores other keys', async () => {
    const { radios, emitted } = await render();

    press(radios()[1], 'a');

    expect(emitted).toEqual([]);
  });
});
