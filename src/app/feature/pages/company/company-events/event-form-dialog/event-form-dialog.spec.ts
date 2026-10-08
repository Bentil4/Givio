import { ComponentFixture, TestBed } from '@angular/core/testing';
import { OrganizerEventDataService } from '../../../../../data/services/organizer-event-data.service';
import type { Event } from '../../../../../data/models/event';
import { EventFormDialog } from './event-form-dialog';

const EXISTING: Event = {
  id: 'e1',
  name: 'Odoi Funeral',
  type: 'funeral',
  date: '2026-11-02T00:00:00.000+00:00',
  hostName: 'The Odoi Family',
  description: 'Celebration of life',
  notes: 'Dress in white',
  status: 'active',
  tenantId: 'tenant-a',
  assignedUserIds: [],
  createdBy: 'so-a',
  nextReceiptSeq: 0,
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
};

describe('EventFormDialog description and notes', () => {
  let fixture: ComponentFixture<EventFormDialog>;
  let eventData: { createEvent: ReturnType<typeof vi.fn>; updateEvent: ReturnType<typeof vi.fn> };

  function render(event: Event | null): HTMLElement {
    fixture = TestBed.createComponent(EventFormDialog);
    fixture.componentRef.setInput('event', event);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  const fillRequired = () =>
    fixture.componentInstance.form.patchValue({
      name: 'Mensah Wedding',
      date: '2026-12-01',
      hostName: 'Mensah Family',
    });

  beforeEach(() => {
    eventData = {
      createEvent: vi.fn().mockResolvedValue(EXISTING),
      updateEvent: vi.fn().mockResolvedValue(EXISTING),
    };
    TestBed.configureTestingModule({
      imports: [EventFormDialog],
      providers: [{ provide: OrganizerEventDataService, useValue: eventData }],
    });
  });

  it('labels both textareas and shows the remaining count', () => {
    const el = render(null);

    expect(el.querySelector('label[for="ev-description"]')?.textContent).toContain('Description');
    expect(el.querySelector('label[for="ev-notes"]')?.textContent).toContain('Notes');
    expect(el.querySelector('#ev-description-hint')?.textContent).toContain('1024 characters left');
    expect(el.querySelector('#ev-description')?.getAttribute('aria-describedby')).toBe(
      'ev-description-hint',
    );
  });

  it('pre-fills description and notes when editing', () => {
    const el = render(EXISTING);

    expect((el.querySelector('#ev-description') as HTMLTextAreaElement).value).toBe(
      'Celebration of life',
    );
    expect((el.querySelector('#ev-notes') as HTMLTextAreaElement).value).toBe('Dress in white');
    expect(el.querySelector('#ev-notes-hint')?.textContent).toContain('1010 characters left');
  });

  it('passes trimmed description and notes through on create, blank as null', async () => {
    render(null);
    fillRequired();
    fixture.componentInstance.form.patchValue({ description: '  A joyful day ', notes: '   ' });

    await fixture.componentInstance.submit();

    expect(eventData.createEvent).toHaveBeenCalledWith(
      expect.objectContaining({ description: 'A joyful day', notes: null, type: 'funeral' }),
    );
  });

  it('passes description and notes through on update', async () => {
    render(EXISTING);

    await fixture.componentInstance.submit();

    expect(eventData.updateEvent).toHaveBeenCalledWith(
      'e1',
      expect.objectContaining({ description: 'Celebration of life', notes: 'Dress in white' }),
    );
  });

  it('flags an over-long note via aria-describedby and blocks the save', async () => {
    const el = render(null);
    fillRequired();
    fixture.componentInstance.form.patchValue({ notes: 'x'.repeat(1025) });

    await fixture.componentInstance.submit();
    fixture.detectChanges();

    expect(eventData.createEvent).not.toHaveBeenCalled();
    expect(el.querySelector('#ev-notes')?.getAttribute('aria-describedby')).toBe(
      'ev-notes-hint ev-notes-error',
    );
    expect(el.querySelector('#ev-notes-error')?.textContent).toContain('1024');
    expect(el.querySelector('#ev-notes-hint')?.textContent).toContain('Over the limit by 1');
  });
});
