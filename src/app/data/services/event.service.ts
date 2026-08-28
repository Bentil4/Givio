import { Injectable, inject, signal } from '@angular/core';
import { EventDataService } from './event-data.service';
import type { Event } from '../models/event';

@Injectable({ providedIn: 'root' })
export class EventService {
  private readonly eventDataService = inject(EventDataService);
  private readonly _events = signal<Event[]>([]);

  public readonly events = this._events.asReadonly();

  async createEvent(input: Parameters<EventDataService['createEvent']>[0]): Promise<Event> {
    const event = await this.eventDataService.createEvent(input);
    this._events.update((events) => [...events, event]);
    return event;
  }

  async updateEvent(
    id: string,
    patch: Parameters<EventDataService['updateEvent']>[1],
  ): Promise<Event> {
    const event = await this.eventDataService.updateEvent(id, patch);
    this._events.update((events) => events.map((e) => (e.id === id ? event : e)));
    return event;
  }
}
