import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { Button, Input } from '../../../../shared/components';
import { Radio } from '../../../../shared/components/radio/radio';
import { EventService } from '../../../../data/services/event.service';
import { ServiceError } from '../../../../data/services/service-error';

@Component({
  selector: 'app-create-event-screen',
  imports: [ReactiveFormsModule, Button, Input, Radio],
  templateUrl: './create-event-screen.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CreateEventScreen {
  private readonly eventService = inject(EventService);
  private readonly formBuilder = inject(FormBuilder);
  private readonly router = inject(Router);

  public formError = signal<string | null>(null);
  public submitting = signal(false);

  public form = this.formBuilder.group({
    name: ['', Validators.required],
    type: ['', Validators.required],
    date: ['', Validators.required],
    hostName: ['', Validators.required],
    venue: [''],
    description: [''],
    notes: [''],
  });

  async onSubmit(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.formError.set(null);
    this.submitting.set(true);

    const { name, type, date, hostName, venue, description, notes } = this.form.value;

    try {
      await this.eventService.createEvent({
        name: name ?? '',
        type: type as 'wedding' | 'funeral',
        date: date ?? '',
        hostName: hostName ?? '',
        venue: venue || undefined,
        description: description || undefined,
        notes: notes || undefined,
      });
      await this.router.navigate(['/dashboard']);
    } catch (err) {
      this.formError.set(err instanceof ServiceError ? err.message : 'Failed to create event');
    } finally {
      this.submitting.set(false);
    }
  }
}
