import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { CdkTrapFocus } from '@angular/cdk/a11y';
import type { TenantAction } from '../tenant-status';

const CONFIRM_COPY: Record<
  TenantAction,
  { title: (company: string) => string; body: string; cta: string; danger: boolean }
> = {
  suspend: {
    title: (company) => `Suspend ${company}?`,
    body:
      'Every Super Organizer, Organizer and Operator at this company is signed out now and ' +
      "can't sign back in or see its events until you reinstate it. Family event codes keep " +
      'working.',
    cta: 'Suspend company',
    danger: true,
  },
  reinstate: {
    title: (company) => `Reinstate ${company}?`,
    body:
      'Its team gets back exactly the access they had before — nobody needs to be added again. ' +
      'They can sign in as soon as this completes.',
    cta: 'Reinstate company',
    danger: false,
  },
};

/** Story 8.1: the confirm step before Admin suspends or reinstates a whole company. */
@Component({
  selector: 'app-tenant-action-confirm',
  imports: [CdkTrapFocus],
  templateUrl: './tenant-action-confirm.html',
  styleUrl: './tenant-action-confirm.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TenantActionConfirm {
  public readonly action = input.required<TenantAction>();
  public readonly tenantName = input.required<string>();

  public readonly confirmed = output<void>();
  public readonly cancelled = output<void>();

  public readonly copy = computed(() => {
    const copy = CONFIRM_COPY[this.action()];
    return { ...copy, title: copy.title(this.tenantName()) };
  });
}
