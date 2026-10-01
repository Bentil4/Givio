import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { CdkTrapFocus } from '@angular/cdk/a11y';
import { ImageUpload } from '../../../../../shared/components';
import {
  OrganizerEventDataService,
  type OrganizerEventDetails,
} from '../../../../../data/services/organizer-event-data.service';
import { ServiceError } from '../../../../../core/services/service-error';
import type { Event, EventType } from '../../../../../data/models/event';

type FormControlName = 'name' | 'date' | 'hostName' | 'venue';

/**
 * Create or edit one of the company's Events. `event` null means create; the occasion (type)
 * is only chosen at creation, as on the Admin side (Story 2.1).
 */
@Component({
  selector: 'app-event-form-dialog',
  imports: [ReactiveFormsModule, CdkTrapFocus, ImageUpload],
  templateUrl: './event-form-dialog.html',
  styleUrl: './event-form-dialog.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EventFormDialog implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly eventData = inject(OrganizerEventDataService);

  public readonly event = input<Event | null>(null);
  public readonly saved = output<Event>();
  public readonly dismissed = output<void>();

  public readonly busy = signal(false);
  public readonly formError = signal<string | null>(null);
  public readonly isCreate = computed(() => this.event() === null);
  public readonly title = computed(() => (this.isCreate() ? 'Create event' : 'Edit event'));

  public readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.minLength(3), Validators.maxLength(120)]],
    type: ['funeral' as EventType, Validators.required],
    date: ['', Validators.required],
    hostName: ['', [Validators.required, Validators.maxLength(120)]],
    venue: ['', Validators.maxLength(160)],
    image: this.fb.control<string | null>(null),
  });

  ngOnInit(): void {
    const event = this.event();
    if (event) {
      this.form.reset({
        name: event.name,
        type: event.type,
        date: event.date.slice(0, 10),
        hostName: event.hostName,
        venue: event.venue ?? '',
        image: event.image ?? null,
      });
    }
  }

  public invalid(control: FormControlName): boolean {
    const c = this.form.controls[control];
    return c.invalid && (c.touched || c.dirty);
  }

  public async submit(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.busy.set(true);
    this.formError.set(null);
    try {
      this.saved.emit(await this.saveEvent());
    } catch (err) {
      this.formError.set(err instanceof ServiceError ? err.message : "We couldn't save the event");
    } finally {
      this.busy.set(false);
    }
  }

  private saveEvent(): Promise<Event> {
    const existing = this.event();
    const details = this.details();
    return existing
      ? this.eventData.updateEvent(existing.id, details)
      : this.eventData.createEvent({ ...details, type: this.form.controls.type.value });
  }

  private details(): OrganizerEventDetails {
    const { name, date, hostName, venue, image } = this.form.getRawValue();
    return {
      name: name.trim(),
      date,
      hostName: hostName.trim(),
      venue: venue.trim() || null,
      image: image || null,
    };
  }
}
