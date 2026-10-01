import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Injector,
  OnInit,
  afterNextRender,
  computed,
  inject,
  signal,
  viewChild,
  viewChildren,
} from '@angular/core';
import { CdkTrapFocus } from '@angular/cdk/a11y';
import { MatIconModule } from '@angular/material/icon';
import { ServiceError } from '../../../../core/services/service-error';
import {
  TenantDataService,
  type TenantDecision,
  type TenantVerification,
} from '../../../../data/services/tenant-data.service';
import { UserService } from '../../../../data/services/user.service';
import { IdentityReviewDataService } from '../../../../data/services/identity-review-data.service';
import type { IdentityReview } from '../../../../data/models/identity-review';
import type { AdminUser } from '../../../../data/models/admin-user';
import type { Tenant } from '../../../../data/models/tenant';
import type { ApplicationView } from './application-view';
import { ApplicationRow } from './application-row/application-row';
import {
  InviteOrganizerDialog,
  type OrganizerInvited,
} from './invite-organizer-dialog/invite-organizer-dialog';
import { FlaggedAdditions } from './flagged-additions/flagged-additions';

/** Story 7.4 adds 'duplicates' (Duplicate-event flags) as a further tab on this same screen. */
export type ApprovalsTab = 'applications' | 'flagged';

interface TabDef {
  readonly id: ApprovalsTab;
  readonly label: string;
  readonly count: number | null;
}

interface PendingDecision {
  readonly kind: TenantDecision;
  readonly application: ApplicationView;
}

interface RowError {
  readonly tenantId: string;
  readonly message: string;
}

const DECISION_COPY: Record<
  TenantDecision,
  { title: (company: string) => string; body: string; cta: string; danger: boolean }
> = {
  approved: {
    title: (company) => `Approve ${company}?`,
    body:
      'Their Super Organizer reaches the company dashboard the next time they sign in, and can ' +
      'start creating events and adding their team.',
    cta: 'Approve',
    danger: false,
  },
  rejected: {
    title: (company) => `Reject ${company}?`,
    body:
      "The application leaves the queue and can't be approved later. The applicant only sees " +
      'that it was not approved — no reason is shown to them.',
    cta: 'Reject',
    danger: true,
  },
};

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof ServiceError ? err.message : fallback;
}

function toView(tenant: Tenant, users: ReadonlyMap<string, AdminUser>): ApplicationView {
  const applicant = users.get(tenant.superOrganizerId);
  return {
    tenant,
    applicantName: applicant?.name ?? null,
    applicantEmail: applicant?.email ?? null,
    verifierName: tenant.verifiedBy ? (users.get(tenant.verifiedBy)?.name ?? null) : null,
  };
}

/**
 * Admin's approval queue (FR-6, FR-8, UX-DR5). Every decision is confirmed, sent to the
 * Function, and followed by a re-read — never optimistic — so a refused approval can't look
 * like it went through. The Function, not this page, is what refuses an unverified approval.
 */
@Component({
  selector: 'app-admin-approvals',
  imports: [MatIconModule, CdkTrapFocus, ApplicationRow, InviteOrganizerDialog, FlaggedAdditions],
  templateUrl: './admin-approvals.html',
  styleUrl: './admin-approvals.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminApprovals implements OnInit {
  private readonly tenantData = inject(TenantDataService);
  private readonly userService = inject(UserService);
  private readonly identityReviewData = inject(IdentityReviewDataService);
  private readonly injector = inject(Injector);
  private readonly queueHeading = viewChild<ElementRef<HTMLElement>>('queueHeading');
  private readonly tabButtons = viewChildren<ElementRef<HTMLButtonElement>>('tabButton');

  private readonly usersById = signal<ReadonlyMap<string, AdminUser>>(new Map());
  public readonly applications = signal<readonly ApplicationView[]>([]);
  public readonly loading = signal(true);
  public readonly loadError = signal<string | null>(null);
  public readonly activeTab = signal<ApprovalsTab>('applications');
  public readonly pending = signal<PendingDecision | null>(null);
  public readonly deciding = signal(false);
  public readonly rowError = signal<RowError | null>(null);
  public readonly announcement = signal('');
  public readonly inviting = signal(false);
  public readonly invited = signal<OrganizerInvited | null>(null);
  public readonly skeletons = [0, 1, 2];
  public readonly identityReviews = signal<readonly IdentityReview[]>([]);
  public readonly reviewsLoading = signal(true);
  public readonly reviewsError = signal<string | null>(null);

  public readonly tabs = computed<readonly TabDef[]>(() => [
    {
      id: 'applications',
      label: 'Organizer applications',
      count: this.loading() || this.loadError() ? null : this.applications().length,
    },
    {
      id: 'flagged',
      label: 'Flagged additions',
      count: this.reviewsLoading() || this.reviewsError() ? null : this.identityReviews().length,
    },
  ]);

  public readonly pendingCopy = computed(() => {
    const p = this.pending();
    if (!p) return null;
    const copy = DECISION_COPY[p.kind];
    return { ...copy, title: copy.title(p.application.tenant.name) };
  });

  public readonly invitedCopy = computed(() => {
    const invite = this.invited();
    if (!invite) return null;
    const emailed = invite.result.inviteStatus.email === 'sent';
    return {
      summary: `${invite.name} can now sign in as the Super Organizer of ${invite.companyName}, which is already approved.`,
      password: invite.result.generatedPassword,
      delivery: emailed
        ? "We emailed them their login details. Share the password directly only if the email doesn't arrive; it won't be shown again."
        : "The invite email didn't send — share the password with them directly; it won't be shown again.",
    };
  });

  ngOnInit(): void {
    void this.load();
    void this.loadIdentityReviews();
  }

  /** Story 7.2: loaded here rather than in the tab so its count shows before the tab is opened. */
  async loadIdentityReviews(): Promise<void> {
    try {
      this.identityReviews.set(await this.identityReviewData.listIdentityReviews());
      this.reviewsError.set(null);
    } catch (err) {
      this.reviewsError.set(errorMessage(err, 'Failed to load flagged additions'));
    } finally {
      this.reviewsLoading.set(false);
    }
  }

  async load(): Promise<void> {
    this.loading.set(true);
    try {
      await this.refresh();
    } finally {
      this.loading.set(false);
    }
  }

  /** Re-reads in place — rows are tracked by Tenant id, so an open row keeps its state. */
  private async refresh(): Promise<void> {
    try {
      const [tenants, users] = await Promise.all([
        this.tenantData.listPendingTenants(),
        this.userService.getUsersById(),
      ]);
      this.usersById.set(users);
      this.applications.set(tenants.map((t) => toView(t, users)));
      this.loadError.set(null);
    } catch (err) {
      this.loadError.set(errorMessage(err, 'Failed to load pending applications'));
    }
  }

  public selectTab(tab: ApprovalsTab): void {
    this.activeTab.set(tab);
  }

  /** WAI-ARIA tabs: arrow keys move between tabs; only the selected tab is in the Tab order. */
  public onTabKeydown(event: KeyboardEvent, index: number): void {
    const tabs = this.tabs();
    const targets: Record<string, number> = {
      ArrowRight: (index + 1) % tabs.length,
      ArrowLeft: (index - 1 + tabs.length) % tabs.length,
      Home: 0,
      End: tabs.length - 1,
    };
    const next = targets[event.key];
    if (next === undefined) return;
    event.preventDefault();
    this.selectTab(tabs[next].id);
    this.tabButtons()[next]?.nativeElement.focus();
  }

  public rowErrorFor(application: ApplicationView): string | null {
    const e = this.rowError();
    return e?.tenantId === application.tenant.id ? e.message : null;
  }

  public ask(kind: TenantDecision, application: ApplicationView): void {
    this.rowError.set(null);
    this.pending.set({ kind, application });
  }

  public dismissPending(): void {
    if (!this.deciding()) {
      this.pending.set(null);
    }
  }

  public onVerified(application: ApplicationView, verification: TenantVerification): void {
    const users = this.usersById();
    this.applications.update((list) =>
      list.map((a) =>
        a.tenant.id === application.tenant.id ? toView({ ...a.tenant, ...verification }, users) : a,
      ),
    );
    this.announcement.set(`Verification recorded for ${application.tenant.name}.`);
  }

  public async confirmPending(): Promise<void> {
    const p = this.pending();
    if (!p) return;
    const { tenant } = p.application;
    this.deciding.set(true);
    let succeeded = false;
    try {
      await this.tenantData.decideTenantApplication(tenant.id, p.kind);
      succeeded = true;
      this.announcement.set(
        p.kind === 'approved'
          ? `${tenant.name} approved. Their Super Organizer reaches the company dashboard on their next sign-in.`
          : `${tenant.name} rejected.`,
      );
    } catch (err) {
      this.rowError.set({
        tenantId: tenant.id,
        message: errorMessage(
          err,
          p.kind === 'approved'
            ? 'Failed to approve the application'
            : 'Failed to reject the application',
        ),
      });
    } finally {
      this.deciding.set(false);
      this.pending.set(null);
    }
    await this.refresh();
    if (succeeded) {
      afterNextRender(() => this.queueHeading()?.nativeElement.focus(), {
        injector: this.injector,
      });
    }
  }

  public openInvite(): void {
    this.inviting.set(true);
  }

  public closeInvite(): void {
    this.inviting.set(false);
  }

  public onInvited(invite: OrganizerInvited): void {
    this.invited.set(invite);
    this.inviting.set(false);
  }

  public dismissInvited(): void {
    this.invited.set(null);
  }
}
