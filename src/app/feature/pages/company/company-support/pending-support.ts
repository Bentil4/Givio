import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CompanySupport } from './company-support';

/**
 * CompanySupport for a not-yet-approved tenant: there's no CompanyLayout (and so no <main> or
 * sidebar) under the pending tree, so this supplies the page landmark and the way back.
 */
@Component({
  selector: 'app-pending-support',
  imports: [RouterLink, CompanySupport],
  template: `
    <main class="pending-support">
      <a routerLink="/company" class="pending-support-back">Back to application status</a>
      <app-company-support />
    </main>
  `,
  styles: `
    .pending-support {
      display: flex;
      flex-direction: column;
      gap: var(--space-md);
      max-width: 720px;
      min-height: 100vh;
      margin: 0 auto;
      padding: var(--space-xl) var(--space-md);
    }

    .pending-support-back {
      align-self: flex-start;
      color: var(--primary-deep);
      font-weight: 600;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PendingSupport {}
