import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { EventSwitcher } from './event-switcher';
import { OperatorEventContext } from '../operator-event-context';
import { EventService } from '../../../../data/services/event.service';
import { AuthService } from '../../../../data/services/auth.service';
import type { Event } from '../../../../data/models/event';

const makeEvent = (overrides: Partial<Event> = {}): Event => ({
  id: 'e1',
  name: 'Ama & Kojo',
  type: 'wedding',
  date: '2026-06-01',
  hostName: 'The Mensah Family',
  status: 'active',
  assignedUserIds: ['op-1'],
  createdBy: 'admin-1',
  nextReceiptSeq: 0,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  ...overrides,
});

async function setup(events: Event[]) {
  await TestBed.configureTestingModule({
    imports: [EventSwitcher],
    providers: [
      OperatorEventContext,
      { provide: EventService, useValue: { events: signal(events), loadEvents: vi.fn() } },
      { provide: AuthService, useValue: { currentUser: () => ({ $id: 'op-1' }) } },
    ],
  }).compileComponents();

  const fixture = TestBed.createComponent(EventSwitcher);
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  const select = el.querySelector('select')!;
  return { fixture, el, select, ctx: TestBed.inject(OperatorEventContext) };
}

const twoEvents = [
  makeEvent({ id: 'e1', name: 'Ama & Kojo' }),
  makeEvent({ id: 'e2', name: 'Asante Funeral' }),
];

describe('EventSwitcher', () => {
  it('is a labelled native select listing the active Events, with nothing pre-selected', async () => {
    const { el, select } = await setup(twoEvents);

    expect(el.querySelector(`label[for="${select.id}"]`)?.textContent).toContain('Recording for');
    const options = Array.from(select.options).map((o) => o.textContent?.trim());
    expect(options).toEqual(['Pick an Event…', 'Ama & Kojo', 'Asante Funeral']);
    expect(select.value).toBe('');
  });

  it('emits the chosen Event id', async () => {
    const { fixture, select } = await setup(twoEvents);
    const picked: string[] = [];
    fixture.componentInstance.picked.subscribe((id) => picked.push(id));

    select.value = 'e2';
    select.dispatchEvent(new globalThis.Event('change'));

    expect(picked).toEqual(['e2']);
  });

  it('reflects the active Event with the indicator dot', async () => {
    const { fixture, el, select, ctx } = await setup(twoEvents);

    ctx.pick('e2');
    fixture.detectChanges();

    expect(select.value).toBe('e2');
    expect(el.querySelector('.switcher-dot')).not.toBeNull();
  });

  it('on a pick request, takes focus and explains why via aria-describedby', async () => {
    const { fixture, el, select, ctx } = await setup(twoEvents);

    ctx.requestPick();
    fixture.detectChanges();

    expect(document.activeElement).toBe(select);
    const describedBy = select.getAttribute('aria-describedby');
    expect(describedBy).toBeTruthy();
    expect(el.querySelector(`#${describedBy}`)?.textContent).toContain('Pick an Event first');
    expect(select.getAttribute('aria-invalid')).toBe('true');
  });
});
