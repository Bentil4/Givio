import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { SyncEngineService } from './data/services/sync-engine.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  // providedIn: 'root' singletons are only constructed on first injection — this is that
  // first injection, so SyncEngineService's connectivity-triggered auto-drain (Story 3.5)
  // is alive for the whole session, not just whichever screen happens to need it first.
  private readonly syncEngine = inject(SyncEngineService);
}
