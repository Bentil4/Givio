import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ServiceError } from '../../../../../core/services/service-error';
import { TenantLifecycleDataService } from '../../../../../data/services/tenant-lifecycle-data.service';
import type { Tenant } from '../../../../../data/models/tenant';
import type { TeamMember } from '../../../../../data/models/team-member';

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof ServiceError ? err.message : fallback;
}

/**
 * Story 8.1 (FR-19): a company whose sole Super Organizer was revoked is never left without
 * one. Admin designates an existing active Organizer, or adds a new person as an Organizer and
 * then designates them; the Function refuses either while another Super Organizer is active.
 */
@Component({
  selector: 'app-super-organizer-designation',
  imports: [ReactiveFormsModule],
  templateUrl: './super-organizer-designation.html',
  styleUrl: './super-organizer-designation.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SuperOrganizerDesignation {
  private readonly lifecycleData = inject(TenantLifecycleDataService);
  private readonly fb = inject(FormBuilder);
  private readonly injector = inject(Injector);
  private readonly heading = viewChild<ElementRef<HTMLElement>>('heading');

  public readonly tenant = input.required<Tenant>();
  public readonly designated = output<void>();

  public readonly members = signal<readonly TeamMember[]>([]);
  public readonly loading = signal(true);
  public readonly loadError = signal<string | null>(null);
  public readonly busy = signal(false);
  public readonly actionError = signal<string | null>(null);
  public readonly message = signal('');
  public readonly generatedPassword = signal<string | null>(null);

  public readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(120)]],
    email: ['', [Validators.required, Validators.email]],
  });

  public readonly superOrganizer = computed(
    () => this.members().find((m) => m.role === 'super_organizer' && m.status === 'active') ?? null,
  );
  public readonly candidates = computed(() =>
    this.members().filter((m) => m.role === 'organizer' && m.status === 'active'),
  );
  public readonly canAddPerson = computed(() => this.tenant().status === 'approved');
  // Tracked separately so a refreshed Tenant object with the same id doesn't reload the team.
  private readonly tenantId = computed(() => this.tenant().id);

  constructor() {
    effect(() => {
      const tenantId = this.tenantId();
      untracked(() => void this.load(tenantId));
    });
  }

  async load(tenantId = this.tenantId()): Promise<void> {
    this.loading.set(true);
    try {
      this.members.set(await this.lifecycleData.listTenantMembers(tenantId));
      this.loadError.set(null);
    } catch (err) {
      this.loadError.set(errorMessage(err, "Failed to load this company's team"));
    } finally {
      this.loading.set(false);
    }
  }

  public invalid(control: 'name' | 'email'): boolean {
    const c = this.form.controls[control];
    return c.invalid && (c.touched || c.dirty);
  }

  public async designate(member: TeamMember): Promise<void> {
    const succeeded = await this.attempt(
      () => this.lifecycleData.designateSuperOrganizer(this.tenantId(), member.membershipId),
      'Failed to designate the Super Organizer',
    );
    if (succeeded) {
      this.message.set(`${member.name} is now the Super Organizer.`);
      this.designated.emit();
      await this.load();
      afterNextRender(() => this.heading()?.nativeElement.focus(), { injector: this.injector });
    }
  }

  public async addOrganizer(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const { name, email } = this.form.getRawValue();
    const person = { name: name.trim(), email: email.trim() };
    const succeeded = await this.attempt(async () => {
      const result = await this.lifecycleData.addOrganizer(this.tenantId(), person);
      this.generatedPassword.set(result.generatedPassword);
    }, 'Failed to add the organizer');
    if (succeeded) {
      this.form.reset();
      this.message.set(`${person.name} was added as an Organizer.`);
      await this.load();
    }
  }

  private async attempt(call: () => Promise<void>, fallback: string): Promise<boolean> {
    this.busy.set(true);
    this.actionError.set(null);
    this.message.set('');
    try {
      await call();
      return true;
    } catch (err) {
      this.actionError.set(errorMessage(err, fallback));
      return false;
    } finally {
      this.busy.set(false);
    }
  }
}
