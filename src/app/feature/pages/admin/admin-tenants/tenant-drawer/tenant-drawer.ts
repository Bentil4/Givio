import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  input,
  output,
  viewChild,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { CdkTrapFocus } from '@angular/cdk/a11y';
import { MatIconModule } from '@angular/material/icon';
import {
  TENANT_SIZE_LABELS,
  TENANT_TYPE_LABELS,
  type Tenant,
  type TenantSize,
  type TenantType,
} from '../../../../../data/models/tenant';
import {
  TENANT_STATUS_LABELS,
  TENANT_STATUS_TAGS,
  type TenantAction,
  type TenantActionFailure,
} from '../tenant-status';
import { SuperOrganizerDesignation } from '../super-organizer-designation/super-organizer-designation';

const FAILED_TITLES: Record<TenantAction, string> = {
  suspend: 'Suspension FAILED',
  reinstate: 'Reinstatement FAILED',
};

/**
 * Story 8.1: one company's account detail, opened over the Companies list. The page owns the
 * Function calls and confirm step; this drawer shows the outcome — a FAILED alert with a retry
 * whenever the Function did not confirm the whole operation.
 */
@Component({
  selector: 'app-tenant-drawer',
  imports: [DatePipe, CdkTrapFocus, MatIconModule, SuperOrganizerDesignation],
  templateUrl: './tenant-drawer.html',
  styleUrl: './tenant-drawer.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TenantDrawer {
  private readonly result = viewChild<ElementRef<HTMLElement>>('result');

  public readonly tenant = input.required<Tenant>();
  public readonly working = input(false);
  public readonly failure = input<TenantActionFailure | null>(null);
  public readonly notice = input('');

  public readonly closed = output<void>();
  public readonly act = output<TenantAction>();
  public readonly retry = output<TenantAction>();
  public readonly designated = output<void>();

  public readonly statusLabel = computed(() => TENANT_STATUS_LABELS[this.tenant().status]);
  public readonly statusTag = computed(() => TENANT_STATUS_TAGS[this.tenant().status]);
  public readonly failedTitle = computed(() => {
    const failure = this.failure();
    return failure ? FAILED_TITLES[failure.action] : null;
  });
  public readonly sizeLabel = computed(
    () => TENANT_SIZE_LABELS[this.tenant().size as TenantSize] ?? this.tenant().size,
  );
  public readonly typeLabel = computed(
    () => TENANT_TYPE_LABELS[this.tenant().type as TenantType] ?? this.tenant().type,
  );
  public readonly hasTeam = computed(() =>
    ['approved', 'suspended'].includes(this.tenant().status),
  );

  /** Called by the page once an action settles, so the outcome is where focus lands. */
  public focusResult(): void {
    this.result()?.nativeElement.focus();
  }

  public close(): void {
    if (!this.working()) {
      this.closed.emit();
    }
  }
}
