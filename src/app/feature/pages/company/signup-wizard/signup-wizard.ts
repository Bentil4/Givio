import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  afterNextRender,
  computed,
  inject,
  signal,
  viewChild,
  Injector,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AppwriteException } from 'appwrite';
import { Progress } from '../../../../shared/components/progress/progress';
import { AuthService } from '../../../../data/services/auth.service';
import { TenantDataService } from '../../../../data/services/tenant-data.service';
import { TenantService } from '../../../../data/services/tenant.service';
import {
  TENANT_SIZES,
  TENANT_SIZE_LABELS,
  TENANT_TYPES,
  TENANT_TYPE_LABELS,
  type CompanyIntake,
  type TenantSize,
  type TenantType,
} from '../../../../data/models/tenant';

export type WizardStep = 1 | 2 | 3;

// Mirrors the tenant_documents bucket's own limits — checked here only to fail fast.
const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;
const DOCUMENT_TYPES = ['application/pdf', 'image/jpeg', 'image/png'];

const STEP_TITLES: Record<WizardStep, string> = {
  1: 'Your company',
  2: 'Verification document',
  3: 'Confirm and submit',
};

/**
 * Organizer self-signup (FR-6b, FR-7, UX-DR7). Steps are component state, not routes: each
 * step owns its own slice of state, so a failed document upload resets only step 2 and the
 * company details from step 1 are never lost. The Account is created when step 1 is
 * completed, because the document upload in step 2 has to run as the signed-in applicant.
 */
@Component({
  selector: 'app-signup-wizard',
  imports: [ReactiveFormsModule, RouterLink, Progress],
  templateUrl: './signup-wizard.html',
  styleUrl: './signup-wizard.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SignupWizard {
  private readonly fb = inject(FormBuilder);
  private readonly router = inject(Router);
  private readonly injector = inject(Injector);
  private readonly authService = inject(AuthService);
  private readonly tenantData = inject(TenantDataService);
  private readonly tenantService = inject(TenantService);
  private readonly stepHeading = viewChild<ElementRef<HTMLHeadingElement>>('stepHeading');
  private readonly fileInput = viewChild<ElementRef<HTMLInputElement>>('fileInput');

  public readonly step = signal<WizardStep>(1);
  public readonly stepTitle = computed(() => STEP_TITLES[this.step()]);
  public readonly busy = signal(false);
  public readonly accountError = signal<string | null>(null);
  public readonly accountEmailTaken = signal(false);
  public readonly submitError = signal<string | null>(null);

  public readonly hasAccount = computed(() => this.authService.isAuthenticated());
  public readonly accountEmail = computed(() => this.authService.currentUser()?.email ?? '');

  public readonly selectedFile = signal<File | null>(null);
  public readonly uploadedFileId = signal<string | null>(null);
  public readonly uploadedFileName = signal<string | null>(null);
  public readonly documentError = signal<string | null>(null);

  public readonly sizeOptions = TENANT_SIZES.map((value) => ({
    value,
    label: TENANT_SIZE_LABELS[value],
  }));
  public readonly typeOptions = TENANT_TYPES.map((value) => ({
    value,
    label: TENANT_TYPE_LABELS[value],
  }));

  public readonly accountForm = this.fb.nonNullable.group({
    fullName: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(120)]],
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(8)]],
  });

  public readonly companyForm = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(128)]],
    location: ['', [Validators.required, Validators.maxLength(128)]],
    size: ['' as TenantSize | '', Validators.required],
    type: ['' as TenantType | '', Validators.required],
    estimatedUserCount: [
      '',
      [Validators.required, Validators.min(1), Validators.max(100000), Validators.pattern(/^\d+$/)],
    ],
  });

  public invalid(form: 'account' | 'company', control: string): boolean {
    const c = form === 'account' ? this.accountForm.get(control) : this.companyForm.get(control);
    return !!c && c.invalid && (c.touched || c.dirty);
  }

  public sizeLabel(): string {
    const size = this.companyForm.controls.size.value;
    return size ? TENANT_SIZE_LABELS[size] : '';
  }

  public typeLabel(): string {
    const type = this.companyForm.controls.type.value;
    return type ? TENANT_TYPE_LABELS[type] : '';
  }

  public async continueFromCompany(): Promise<void> {
    const needsAccount = !this.hasAccount();
    if (this.companyForm.invalid || (needsAccount && this.accountForm.invalid)) {
      this.companyForm.markAllAsTouched();
      this.accountForm.markAllAsTouched();
      return;
    }
    if (needsAccount) {
      this.busy.set(true);
      this.accountError.set(null);
      this.accountEmailTaken.set(false);
      const { fullName, email, password } = this.accountForm.getRawValue();
      try {
        await this.authService.register(fullName.trim(), email.trim(), password);
      } catch (error) {
        const emailTaken = error instanceof AppwriteException && error.code === 409;
        this.accountEmailTaken.set(emailTaken);
        this.accountError.set(
          emailTaken
            ? 'An account with this email already exists.'
            : "We couldn't create your account. Check your details and try again.",
        );
        return;
      } finally {
        this.busy.set(false);
      }
    }
    this.goTo(2);
  }

  public onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    this.documentError.set(null);
    if (file && !DOCUMENT_TYPES.includes(file.type)) {
      this.documentError.set('Choose a PDF, JPG or PNG file.');
      input.value = '';
      this.selectedFile.set(null);
      return;
    }
    if (file && file.size > MAX_DOCUMENT_BYTES) {
      this.documentError.set('That file is larger than 10 MB. Choose a smaller file.');
      input.value = '';
      this.selectedFile.set(null);
      return;
    }
    this.selectedFile.set(file);
  }

  public async continueFromDocument(): Promise<void> {
    const file = this.selectedFile();
    if (!file) {
      if (this.uploadedFileId()) {
        this.goTo(3);
        return;
      }
      this.documentError.set('Choose your business registration or ID document to continue.');
      return;
    }

    this.busy.set(true);
    this.documentError.set(null);
    try {
      const fileId = await this.tenantData.uploadVerificationDocument(file);
      this.uploadedFileId.set(fileId);
      this.uploadedFileName.set(file.name);
      this.selectedFile.set(null);
      this.goTo(3);
    } catch {
      this.resetDocumentStep();
      this.documentError.set("The upload didn't finish. Choose the file again to retry.");
    } finally {
      this.busy.set(false);
    }
  }

  public async submit(): Promise<void> {
    const verificationDocumentId = this.uploadedFileId();
    if (!verificationDocumentId || this.companyForm.invalid) {
      return;
    }
    this.busy.set(true);
    this.submitError.set(null);
    try {
      await this.tenantData.submitTenantApplication({
        company: this.companyIntake(),
        verificationDocumentId,
      });
      await this.tenantService.load(true);
      await this.router.navigateByUrl('/company');
    } catch {
      this.submitError.set("We couldn't process this application. Please try again later.");
    } finally {
      this.busy.set(false);
    }
  }

  public back(): void {
    const step = this.step();
    if (step > 1) {
      this.goTo((step - 1) as WizardStep);
    }
  }

  private resetDocumentStep(): void {
    const input = this.fileInput()?.nativeElement;
    if (input) {
      input.value = '';
    }
    this.selectedFile.set(null);
    this.uploadedFileId.set(null);
    this.uploadedFileName.set(null);
  }

  private companyIntake(): CompanyIntake {
    const { name, location, size, type, estimatedUserCount } = this.companyForm.getRawValue();
    return {
      name: name.trim(),
      location: location.trim(),
      size: size as TenantSize,
      type: type as TenantType,
      estimatedUserCount: Number(estimatedUserCount),
    };
  }

  private goTo(step: WizardStep): void {
    this.step.set(step);
    afterNextRender(() => this.stepHeading()?.nativeElement.focus(), { injector: this.injector });
  }
}
