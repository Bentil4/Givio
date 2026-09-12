import { Injectable, signal } from '@angular/core';

/**
 * Browser-level network signal (navigator.onLine + online/offline events) — updates within
 * milliseconds of a change, satisfying Story 3.1 AC5. Deliberately NOT server-reachability:
 * a captive portal or mobile dead zone can report online while every request times out.
 * That stricter judgment belongs to Story 3.5's SyncEngine, not this indicator.
 */
@Injectable({ providedIn: 'root' })
export class ConnectivityService {
  private readonly _online = signal(navigator.onLine);
  public readonly online = this._online.asReadonly();

  constructor() {
    window.addEventListener('online', () => this._online.set(true));
    window.addEventListener('offline', () => this._online.set(false));
  }
}
