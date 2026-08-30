import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';

/**
 * Session-expiry modal. Mount once in the authenticated shell, not per page.
 *
 * The copy leads with what SURVIVED, not with what went wrong. An operator whose tablet idled
 * during a service has queued donations on the device, and their first fear is that they lost
 * them. Telling them the count up front is the whole job of this dialog.
 *
 * Queued records live in IndexedDB and are keyed by localId, so they are entirely independent
 * of the Appwrite session — signing back in picks the queue straight back up.
 */
@Component({
  selector: 'app-session-expired',
  imports: [MatIconModule],
  templateUrl: './session-expired.html',
  styleUrl: './session-expired.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SessionExpired {
  public open = input.required<boolean>();
  public idleMinutes = input(30);
  public queuedCount = input(0);
  public signIn = output<void>();

  public readonly queuedLabel = computed(() => {
    const n = this.queuedCount();
    if (n === 0) return null;
    return n === 1 ? '1 donation' : `${n} donations`;
  });
}
