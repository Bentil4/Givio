import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Button, Input } from '../../../../shared/components';
import { appDb } from '../../../../data/dexie/app-db';
import { EventService } from '../../../../data/services/event.service';
import { ServiceError } from '../../../../data/services/service-error';
import type { Event } from '../../../../data/models/event';

@Component({
  selector: 'app-edit-event',
  imports: [ReactiveFormsModule, Button, Input],
  templateUrl: './edit-event.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EditEvent implements OnInit {
  private readonly eventService = inject(EventService);
  private readonly formBuilder = inject(FormBuilder);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  public event = signal<Event | null>(null);
  public loading = signal(true);
  public notFound = signal(false);
  public formError = signal<string | null>(null);
  public submitting = signal(false);

  public form = this.formBuilder.group({
    name: ['', Validators.required],
    date: ['', Validators.required],
    hostName: ['', Validators.required],
    venue: [''],
    description: [''],
    notes: [''],
  });

  async ngOnInit(): Promise<void> {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) {
      this.notFound.set(true);
      this.loading.set(false);
      return;
    }

    const event = await appDb.events.get(id);
    if (!event) {
      this.notFound.set(true);
      this.loading.set(false);
      return;
    }

    this.event.set(event);
    this.form.reset({
      name: event.name,
      date: event.date,
      hostName: event.hostName,
      venue: event.venue ?? '',
      description: event.description ?? '',
      notes: event.notes ?? '',
    });
    if (event.status === 'closed') {
      this.form.disable();
    }
    this.loading.set(false);
  }

  async onSubmit(): Promise<void> {
    const event = this.event();
    if (!event || this.form.invalid || event.status === 'closed') {
      this.form.markAllAsTouched();
      return;
    }

    this.formError.set(null);
    this.submitting.set(true);

    const { name, date, hostName, venue, description, notes } = this.form.value;

    try {
      await this.eventService.updateEvent(event.id, {
        name: name ?? '',
        date: date ?? '',
        hostName: hostName ?? '',
        venue: venue || undefined,
        description: description || undefined,
        notes: notes || undefined,
      });
      await this.router.navigate(['/dashboard']);
    } catch (err) {
      this.formError.set(err instanceof ServiceError ? err.message : 'Failed to update event');
    } finally {
      this.submitting.set(false);
    }
  }
}
