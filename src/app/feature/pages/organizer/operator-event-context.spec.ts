import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { OperatorEventContext } from './operator-event-context';
import { EventService } from '../../../data/services/event.service';
import { AuthService } from '../../../data/services/auth.service';
import type { Event } from '../../../data/models/event';

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

function setup(events: Event[], loadEvents = vi.fn().mockResolvedValue(undefined)) {
  TestBed.configureTestingModule({
    providers: [
      OperatorEventContext,
      { provide: EventService, useValue: { events: signal(events), loadEvents } },
      { provide: AuthService, useValue: { currentUser: () => ({ $id: 'op-1' }) } },
    ],
  });
  return TestBed.inject(OperatorEventContext);
}

describe('OperatorEventContext', () => {
  it('with no active Events, shows no switcher and has no active Event', () => {
    const ctx = setup([makeEvent({ status: 'paused' })]);

    expect(ctx.showSwitcher()).toBe(false);
    expect(ctx.activeEvent()).toBeNull();
  });

  it('with exactly one active Event, hides the switcher and resolves to that Event', () => {
    const ctx = setup([makeEvent({ id: 'e1' }), makeEvent({ id: 'e2', status: 'closed' })]);

    expect(ctx.showSwitcher()).toBe(false);
    expect(ctx.activeEvent()?.id).toBe('e1');
  });

  it('with 2+ active Events, shows the switcher and pre-selects nothing', () => {
    const ctx = setup([makeEvent({ id: 'e1' }), makeEvent({ id: 'e2' })]);

    expect(ctx.showSwitcher()).toBe(true);
    expect(ctx.activeEvent()).toBeNull();
  });

  it('ignores Events the operator is not assigned to', () => {
    const ctx = setup([
      makeEvent({ id: 'e1' }),
      makeEvent({ id: 'e2', assignedUserIds: ['op-2'] }),
    ]);

    expect(ctx.showSwitcher()).toBe(false);
    ctx.pick('e2');
    expect(ctx.activeEvent()).toBeNull();
  });

  it('an explicit pick wins and clears any pending prompt', () => {
    const ctx = setup([makeEvent({ id: 'e1' }), makeEvent({ id: 'e2' })]);
    ctx.requestPick();

    ctx.pick('e2');

    expect(ctx.activeEvent()?.id).toBe('e2');
    expect(ctx.pickPrompt()).toBeNull();
  });

  it('an unresolvable pick stays unresolved rather than falling back to the only active Event', async () => {
    const ctx = setup([makeEvent({ id: 'e1' })]);
    await ctx.load();

    ctx.pick('missing');

    expect(ctx.activeEvent()).toBeNull();
    expect(ctx.pickNotFound()).toBe(true);
  });

  it('requestPick sets the "Pick an Event first" prompt and bumps the focus request', () => {
    const ctx = setup([makeEvent({ id: 'e1' }), makeEvent({ id: 'e2' })]);

    ctx.requestPick();

    expect(ctx.pickPrompt()).toContain('Pick an Event first');
    expect(ctx.focusRequest()).toBe(1);
  });

  it('load() records a failure but still marks itself loaded', async () => {
    const ctx = setup([], vi.fn().mockRejectedValue(new Error('offline')));

    await ctx.load();

    expect(ctx.loaded()).toBe(true);
    expect(ctx.loadError()).toBe('Failed to load events');
  });
});
