import { Injectable, inject, signal } from '@angular/core';
import { EventDataService } from './event-data.service';
import type { Event } from '../models/event';

@Injectable({ providedIn: 'root' })
export class EventService {
  private readonly eventDataService = inject(EventDataService);
  private readonly _events = signal<Event[]>([]);

  public readonly events = this._events.asReadonly();

  async loadEvents(): Promise<void> {
    this._events.set(await this.eventDataService.listEvents());
  }
}
