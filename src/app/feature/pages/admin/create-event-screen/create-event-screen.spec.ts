import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { CreateEventScreen } from './create-event-screen';
import { EventService } from '../../../../data/services/event.service';
import { ServiceError } from '../../../../data/services/service-error';

describe('CreateEventScreen', () => {
  let component: CreateEventScreen;
  let fixture: ComponentFixture<CreateEventScreen>;
  let eventService: { createEvent: ReturnType<typeof vi.fn> };
  let router: Router;

  beforeEach(async () => {
    eventService = { createEvent: vi.fn() };

    await TestBed.configureTestingModule({
      imports: [CreateEventScreen],
      providers: [provideRouter([]), { provide: EventService, useValue: eventService }],
    }).compileComponents();

    fixture = TestBed.createComponent(CreateEventScreen);
    component = fixture.componentInstance;
    router = TestBed.inject(Router);
    vi.spyOn(router, 'navigate').mockResolvedValue(true);
    fixture.detectChanges();
    await fixture.whenStable();
  });

  it('does not submit when required fields are missing', async () => {
    await component.onSubmit();

    expect(eventService.createEvent).not.toHaveBeenCalled();
  });

  it('calls EventService.createEvent with the form shape and navigates on success', async () => {
    eventService.createEvent.mockResolvedValueOnce({ id: 'e1' });
    component.form.setValue({
      name: 'Ama & Kojo',
      type: 'wedding',
      date: '2026-06-01',
      hostName: 'The Mensah Family',
      venue: '',
      description: '',
      notes: '',
    });

    await component.onSubmit();

    expect(eventService.createEvent).toHaveBeenCalledWith({
      name: 'Ama & Kojo',
      type: 'wedding',
      date: '2026-06-01',
      hostName: 'The Mensah Family',
      venue: undefined,
      description: undefined,
      notes: undefined,
    });
    expect(router.navigate).toHaveBeenCalledWith(['/dashboard']);
  });

  it('shows an inline error on failure and does not navigate', async () => {
    eventService.createEvent.mockRejectedValueOnce(new ServiceError('Failed to save event locally'));
    component.form.setValue({
      name: 'Ama & Kojo',
      type: 'wedding',
      date: '2026-06-01',
      hostName: 'The Mensah Family',
      venue: '',
      description: '',
      notes: '',
    });

    await component.onSubmit();

    expect(component.formError()).toBe('Failed to save event locally');
    expect(router.navigate).not.toHaveBeenCalled();
  });
});
