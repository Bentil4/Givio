import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';

export type ConnectionState = 'online' | 'offline' | 'syncing' | 'synced';

/**
 * The full-width strip above the entry form. Presentational only — it never reads
 * navigator.onLine itself, because 'online' has to mean 'we reached the server', not
 * 'the OS thinks there is a network'. Captive portals and Ghanaian mobile dead zones
 * both report online while every request times out. OfflineQueue owns that judgement.
 */
@Component({
  selector: 'app-connection-banner',
  imports: [MatIconModule],
  templateUrl: './connection-banner.html',
  styleUrl: './connection-banner.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ConnectionBanner {
  public state = input.required<ConnectionState>();
  public pendingCount = input(0);
  public syncedCount = input(0);
  public viewQueue = output<void>();

  /** Online is the quiet default: no banner at all. Chrome should not celebrate normality. */
  public visible = computed(() => this.state() !== 'online');

  public icon = computed(() => {
    switch (this.state()) {
      case 'offline': return 'cloud_off';
      case 'syncing': return 'sync';
      case 'synced': return 'check';
      default: return '';
    }
  });

  public heading = computed(() => {
    switch (this.state()) {
      case 'offline':
        return "You're offline \u2014 keep recording.";
      case 'syncing':
        return `Back online \u2014 syncing ${this.pendingCount()} ${this.pendingCount() === 1 ? 'donation' : 'donations'}`;
      case 'synced':
        return `All ${this.syncedCount()} ${this.syncedCount() === 1 ? 'donation' : 'donations'} synced`;
      default:
        return '';
    }
  });

  public detail = computed(() => {
    switch (this.state()) {
      case 'offline':
        return 'Donations are saved to this device and will sync the moment the connection returns.';
      case 'syncing':
        return 'Keep the app open. You can carry on recording while this finishes.';
      case 'synced':
        return "The queue is empty and the family's live total is up to date.";
      default:
        return '';
    }
  });
}
