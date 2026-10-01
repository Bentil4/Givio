import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnInit,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { CdkTrapFocus } from '@angular/cdk/a11y';
import { MatIconModule } from '@angular/material/icon';
import { TenantService } from '../../../../data/services/tenant.service';
import { TeamDataService } from '../../../../data/services/team-data.service';
import { ServiceError } from '../../../../core/services/service-error';
import type { MembershipRole } from '../../../../data/models/membership';
import type { TeamMember, TeamMemberRole } from '../../../../data/models/team-member';

const ROLE_ORDER: Record<MembershipRole, number> = {
  super_organizer: 0,
  organizer: 1,
  operator: 2,
};

const TIER_LABELS: Record<MembershipRole, string> = {
  super_organizer: 'Super Organizer',
  organizer: 'Co-Organizer',
  operator: 'Operator',
};

const TIER_DESCRIPTIONS: Record<MembershipRole, string> = {
  super_organizer: 'can add co-Organizers and Operators',
  organizer: 'can add and manage Operators',
  operator: 'records donations at the Events they are assigned to',
};

const ADD_COPY: Record<TeamMemberRole, { title: string; body: string }> = {
  organizer: {
    title: 'Add co-Organizer',
    body: 'They get their own login and can add and manage Operators for your company.',
  },
  operator: {
    title: 'Add Operator',
    body: 'They get their own login to record donations at the Events you assign them to.',
  },
};

// Mirrors the Function's own FR-11 matrix (TEAM_MANAGEABLE_ROLES) — display only; the Function
// refuses anything outside it regardless.
const MANAGEABLE: Record<MembershipRole, readonly MembershipRole[]> = {
  super_organizer: ['organizer', 'operator'],
  organizer: ['operator'],
  operator: [],
};

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof ServiceError ? err.message : fallback;
}

interface NewMemberNotice {
  readonly name: string;
  readonly password: string;
  readonly setupIncomplete: boolean;
}

/**
 * /company/team (FR-10/FR-11). A Super Organizer adds co-Organizers and Operators; a
 * co-Organizer adds Operators only, and the "Add co-Organizer" action is never rendered for
 * them. Every add creates a brand-new Account (FR-4/FR-5) with no Event access until it is
 * assigned to one. The Function enforces all of this — this page only reflects it.
 */
@Component({
  selector: 'app-company-team',
  imports: [MatIconModule, ReactiveFormsModule, DatePipe, CdkTrapFocus],
  templateUrl: './company-team.html',
  styleUrl: './company-team.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CompanyTeam implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly teamData = inject(TeamDataService);
  private readonly tenantService = inject(TenantService);
  private readonly heading = viewChild.required<ElementRef<HTMLHeadingElement>>('heading');

  private readonly members = signal<readonly TeamMember[]>([]);
  public readonly loading = signal(true);
  public readonly loadError = signal<string | null>(null);
  public readonly busy = signal(false);
  public readonly formError = signal<string | null>(null);
  public readonly actionError = signal<string | null>(null);
  public readonly adding = signal<TeamMemberRole | null>(null);
  public readonly revoking = signal<TeamMember | null>(null);
  public readonly newMember = signal<NewMemberNotice | null>(null);
  public readonly skeletons = [0, 1, 2];

  private readonly callerRole = computed<MembershipRole | null>(
    () => this.tenantService.context()?.membership.role ?? null,
  );
  public readonly isSuperOrganizer = computed(() => this.callerRole() === 'super_organizer');
  public readonly companyName = computed(() => this.tenantService.tenant()?.name ?? 'your company');

  public readonly team = computed(() =>
    [...this.members()].sort(
      (a, b) =>
        ROLE_ORDER[a.role] - ROLE_ORDER[b.role] ||
        a.grantedAt.localeCompare(b.grantedAt) ||
        a.name.localeCompare(b.name),
    ),
  );
  public readonly isEmpty = computed(
    () => !this.loading() && this.loadError() === null && this.team().every((m) => m.isSelf),
  );

  public readonly addCopy = computed(() => {
    const role = this.adding();
    return role ? ADD_COPY[role] : null;
  });

  public readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(120)]],
    email: ['', [Validators.required, Validators.email]],
  });

  ngOnInit(): void {
    void this.load();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    try {
      this.members.set(await this.teamData.listTeamMembers());
      this.loadError.set(null);
    } catch (err) {
      this.loadError.set(errorMessage(err, "We couldn't load your team"));
    } finally {
      this.loading.set(false);
    }
  }

  public tierLabel(role: MembershipRole): string {
    return TIER_LABELS[role];
  }

  public tierDescription(role: MembershipRole): string {
    return TIER_DESCRIPTIONS[role];
  }

  /** Story 7.2: held for review — shown, never explained (FR-12/FR-23). */
  public isPending(member: TeamMember): boolean {
    return member.status === 'pending_review';
  }

  public canRevoke(member: TeamMember): boolean {
    const role = this.callerRole();
    return !member.isSelf && role !== null && MANAGEABLE[role].includes(member.role);
  }

  public openAdd(role: TeamMemberRole): void {
    this.formError.set(null);
    this.form.reset({ name: '', email: '' });
    this.adding.set(role);
  }

  public closeAdd(): void {
    this.adding.set(null);
  }

  public invalid(control: 'name' | 'email'): boolean {
    const c = this.form.controls[control];
    return c.invalid && (c.touched || c.dirty);
  }

  public async add(): Promise<void> {
    const role = this.adding();
    if (!role) return;
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const { name, email } = this.form.getRawValue();
    this.busy.set(true);
    this.formError.set(null);
    try {
      const result = await this.teamData.addTeamMember({
        name: name.trim(),
        email: email.trim(),
        role,
      });
      this.newMember.set({
        name: result.name,
        password: result.generatedPassword,
        setupIncomplete: result.setupIncomplete,
      });
      this.closeAdd();
      await this.load();
    } catch (err) {
      this.formError.set(errorMessage(err, "We couldn't add them"));
    } finally {
      this.busy.set(false);
    }
  }

  public dismissNewMember(): void {
    this.newMember.set(null);
  }

  public askRevoke(member: TeamMember): void {
    this.actionError.set(null);
    this.revoking.set(member);
  }

  public dismissRevoke(): void {
    this.revoking.set(null);
  }

  /** Never optimistic: the row only leaves the list once the Function confirms and it's re-read. */
  public async confirmRevoke(): Promise<void> {
    const member = this.revoking();
    if (!member) return;
    this.busy.set(true);
    try {
      await this.teamData.revokeMembership(member.membershipId);
    } catch (err) {
      this.actionError.set(errorMessage(err, "We couldn't revoke their access"));
    } finally {
      this.busy.set(false);
      this.revoking.set(null);
    }
    await this.load();
    // Once their row is gone, so is the Revoke button the dialog would hand focus back to.
    if (!this.members().some((m) => m.membershipId === member.membershipId)) {
      this.heading().nativeElement.focus();
    }
  }
}
