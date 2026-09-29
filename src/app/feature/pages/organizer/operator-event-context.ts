import { Injectable, computed, inject, signal } from '@angular/core';
import { EventService } from '../../../data/services/event.service';
import { AuthService } from '../../../data/services/auth.service';
import { ServiceError } from '../../../core/services/service-error';
import type { Event } from '../../../data/models/event';

export const PICK_EVENT_FIRST = 'Pick an Event first';

/**
 * Which Event the Operator is acting in (FR-3, UX-DR6). Provided by OrganizerLayout rather
 * than in root so a pick lives exactly as long as the /organizer shell: logging out or leaving
 * the tier destroys it, and nothing is ever restored from a previous session.
 */
@Injectable()
export class OperatorEventContext {
  private readonly eventService = inject(EventService);
  private readonly authService = inject(AuthService);

  private readonly _pickedId = signal<string | null>(null);
  private readonly _loaded = signal(false);
  private readonly _loadError = signal<string | null>(null);
  private readonly _pickPrompt = signal<string | null>(null);
  private readonly _focusRequest = signal(0);

  public readonly pickedId = this._pickedId.asReadonly();
  public readonly loaded = this._loaded.asReadonly();
  public readonly loadError = this._loadError.asReadonly();
  public readonly pickPrompt = this._pickPrompt.asReadonly();
  public readonly focusRequest = this._focusRequest.asReadonly();

  public readonly assignedEvents = computed(() => {
    const userId = this.authService.currentUser()?.$id;
    if (!userId) return [];
    return this.eventService.events().filter((e) => e.assignedUserIds.includes(userId));
  });

  public readonly activeEvents = computed(() =>
    this.assignedEvents().filter((e) => e.status === 'active'),
  );

  public readonly showSwitcher = computed(() => this.activeEvents().length >= 2);

  /**
   * An explicit pick always wins, and a pick that doesn't resolve to an assigned Event stays
   * unresolved — it is never swapped for some other Event. Only the single-active-Event case
   * resolves without a pick, because there is nothing to choose between.
   */
  public readonly activeEvent = computed<Event | null>(() => {
    const id = this._pickedId();
    if (id) return this.assignedEvents().find((e) => e.id === id) ?? null;
    const active = this.activeEvents();
    return active.length === 1 ? active[0] : null;
  });

  public readonly pickNotFound = computed(
    () => this._loaded() && !!this._pickedId() && !this.activeEvent(),
  );

  public async load(): Promise<void> {
    try {
      await this.eventService.loadEvents();
      this._loadError.set(null);
    } catch (err) {
      this._loadError.set(err instanceof ServiceError ? err.message : 'Failed to load events');
    } finally {
      this._loaded.set(true);
    }
  }

  public pick(eventId: string | null): void {
    this._pickedId.set(eventId || null);
    this._pickPrompt.set(null);
  }

  public requestPick(): void {
    const n = this.activeEvents().length;
    this._pickPrompt.set(
      `${PICK_EVENT_FIRST} — you're assigned to ${n} active Events and haven't chosen one yet.`,
    );
    this._focusRequest.update((count) => count + 1);
  }
}
