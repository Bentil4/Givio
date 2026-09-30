import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { AppwriteException } from 'appwrite';
import { AuthService } from '../../../../data/services/auth.service';
import { TenantDataService } from '../../../../data/services/tenant-data.service';
import { TenantService } from '../../../../data/services/tenant.service';
import { SignupWizard } from './signup-wizard';

const COMPANY = {
  name: 'Asante Events',
  location: 'Kumasi',
  contactPhone: '+233 24 123 4567',
  size: '11-50' as const,
  type: 'funeral' as const,
  estimatedUserCount: '12',
};

describe('SignupWizard', () => {
  let currentUser: ReturnType<typeof signal<{ $id: string; email: string } | null>>;
  let register: ReturnType<typeof vi.fn>;
  let upload: ReturnType<typeof vi.fn>;
  let submitApplication: ReturnType<typeof vi.fn>;
  let load: ReturnType<typeof vi.fn>;

  async function render() {
    currentUser = signal<{ $id: string; email: string } | null>(null);
    register = vi.fn().mockImplementation(async (_n: string, email: string) => {
      currentUser.set({ $id: 'applicant-1', email });
    });
    upload = vi.fn();
    submitApplication = vi.fn();
    load = vi.fn().mockResolvedValue(null);
    TestBed.configureTestingModule({
      imports: [SignupWizard],
      providers: [
        provideRouter([]),
        {
          provide: AuthService,
          useValue: {
            register,
            currentUser,
            isAuthenticated: () => currentUser() !== null,
          },
        },
        {
          provide: TenantDataService,
          useValue: {
            uploadVerificationDocument: upload,
            submitTenantApplication: submitApplication,
          },
        },
        { provide: TenantService, useValue: { load } },
      ],
    });
    const fixture = TestBed.createComponent(SignupWizard);
    document.body.appendChild(fixture.nativeElement);
    fixture.detectChanges();
    await fixture.whenStable();
    const router = TestBed.inject(Router);
    vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
    return {
      fixture,
      wizard: fixture.componentInstance,
      el: fixture.nativeElement as HTMLElement,
      router,
    };
  }

  async function completeStepOne(wizard: SignupWizard) {
    wizard.companyForm.setValue(COMPANY);
    wizard.accountForm.setValue({
      fullName: 'Kwame Asante',
      email: 'kwame@asante.example',
      password: 'long-enough-pw',
    });
    await wizard.continueFromCompany();
  }

  function chooseFile(wizard: SignupWizard, file: File) {
    wizard.onFileSelected({ target: { files: [file], value: '' } } as unknown as Event);
  }

  const pdf = () => new File(['%PDF'], 'registration.pdf', { type: 'application/pdf' });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('starts on step 1 with the five intake fields and the sign-in fields', async () => {
    const { el } = await render();

    for (const id of [
      'companyName',
      'companyLocation',
      'companySize',
      'companyUsers',
      'companyType',
    ]) {
      expect(el.querySelector(`#${id}`)).not.toBeNull();
    }
    expect(el.querySelector('#applicantEmail')).not.toBeNull();
    expect(el.querySelector('[aria-current="step"]')?.textContent).toContain('Company');
  });

  it('does not advance or create an account while step 1 is incomplete', async () => {
    const { wizard } = await render();

    await wizard.continueFromCompany();

    expect(wizard.step()).toBe(1);
    expect(register).not.toHaveBeenCalled();
  });

  it('creates the applicant Account when step 1 is completed, then moves to the document step', async () => {
    const { wizard } = await render();

    await completeStepOne(wizard);

    expect(register).toHaveBeenCalledWith('Kwame Asante', 'kwame@asante.example', 'long-enough-pw');
    expect(wizard.step()).toBe(2);
  });

  it('stays on step 1 with a sign-in pointer when the email already has an Account', async () => {
    const { wizard, fixture, el } = await render();
    register.mockRejectedValueOnce(new AppwriteException('exists', 409));

    await completeStepOne(wizard);
    fixture.detectChanges();

    expect(wizard.step()).toBe(1);
    expect(el.querySelector('[role="alert"] a')?.getAttribute('href')).toBe('/login');
  });

  it('on a failed upload, resets only the document step and keeps the step-1 company details', async () => {
    const { wizard, fixture, el } = await render();
    await completeStepOne(wizard);
    upload.mockRejectedValueOnce(new Error('network dropped'));

    chooseFile(wizard, pdf());
    await wizard.continueFromDocument();
    fixture.detectChanges();

    expect(wizard.step()).toBe(2);
    expect(wizard.selectedFile()).toBeNull();
    expect(wizard.uploadedFileId()).toBeNull();
    expect(el.querySelector('[role="alert"]')?.textContent).toContain("didn't finish");
    expect(wizard.companyForm.getRawValue()).toEqual(COMPANY);
    expect(register).toHaveBeenCalledTimes(1);

    upload.mockResolvedValueOnce('file-1');
    chooseFile(wizard, pdf());
    await wizard.continueFromDocument();

    expect(wizard.step()).toBe(3);
    expect(wizard.uploadedFileId()).toBe('file-1');
    expect(wizard.companyForm.getRawValue()).toEqual(COMPANY);
  });

  it('keeps the company details and skips account creation when going Back to step 1', async () => {
    const { wizard, fixture, el } = await render();
    await completeStepOne(wizard);

    wizard.back();
    fixture.detectChanges();

    expect(wizard.step()).toBe(1);
    expect(wizard.companyForm.getRawValue()).toEqual(COMPANY);
    expect(el.querySelector('#applicantEmail')).toBeNull();
    await wizard.continueFromCompany();
    expect(register).toHaveBeenCalledTimes(1);
    expect(wizard.step()).toBe(2);
  });

  it('rejects an unsupported file type before uploading', async () => {
    const { wizard } = await render();
    await completeStepOne(wizard);

    chooseFile(wizard, new File(['x'], 'notes.docx', { type: 'application/msword' }));
    await wizard.continueFromDocument();

    expect(upload).not.toHaveBeenCalled();
    expect(wizard.step()).toBe(2);
    expect(wizard.documentError()).toBeTruthy();
  });

  it('submits the intake and document id, then goes to /company', async () => {
    const { wizard, router } = await render();
    await completeStepOne(wizard);
    upload.mockResolvedValueOnce('file-1');
    chooseFile(wizard, pdf());
    await wizard.continueFromDocument();
    submitApplication.mockResolvedValueOnce({ tenantId: 't1', membershipId: 'm1' });

    await wizard.submit();

    expect(submitApplication).toHaveBeenCalledWith({
      company: { ...COMPANY, contactPhone: '+233241234567', estimatedUserCount: 12 },
      verificationDocumentId: 'file-1',
    });
    expect(load).toHaveBeenCalledWith(true);
    expect(router.navigateByUrl).toHaveBeenCalledWith('/company');
  });

  it('shows a generic, non-disclosing message when the submission is refused', async () => {
    const { wizard, router } = await render();
    await completeStepOne(wizard);
    upload.mockResolvedValueOnce('file-1');
    chooseFile(wizard, pdf());
    await wizard.continueFromDocument();
    submitApplication.mockRejectedValueOnce(new Error('409'));

    await wizard.submit();

    expect(wizard.submitError()).toBe(
      "We couldn't process this application. Please try again later.",
    );
    expect(router.navigateByUrl).not.toHaveBeenCalled();
    expect(wizard.step()).toBe(3);
  });

  describe('contact phone', () => {
    it('is a labelled tel field with autocomplete and the verification-call hint', async () => {
      const { el } = await render();
      const input = el.querySelector<HTMLInputElement>('#companyPhone')!;

      expect(el.querySelector('label[for="companyPhone"]')?.textContent).toContain('Contact phone');
      expect(input.type).toBe('tel');
      expect(input.getAttribute('inputmode')).toBe('tel');
      expect(input.getAttribute('autocomplete')).toBe('tel');
      expect(input.placeholder).toMatch(/^\+233/);
      expect(input.getAttribute('aria-describedby')).toBe('companyPhone-hint');
      expect(el.querySelector('#companyPhone-hint')?.textContent).toContain(
        "We'll call this number to verify your company",
      );
    });

    it('blocks step 1 on a missing or local-format number and links the error to the field', async () => {
      const { wizard, fixture, el } = await render();

      for (const contactPhone of ['', '024 123 4567']) {
        wizard.companyForm.setValue({ ...COMPANY, contactPhone });
        wizard.accountForm.setValue({
          fullName: 'Kwame Asante',
          email: 'kwame@asante.example',
          password: 'long-enough-pw',
        });
        await wizard.continueFromCompany();
        fixture.detectChanges();

        expect(wizard.step()).toBe(1);
        expect(register).not.toHaveBeenCalled();
        const input = el.querySelector<HTMLInputElement>('#companyPhone')!;
        expect(input.getAttribute('aria-invalid')).toBe('true');
        expect(input.getAttribute('aria-describedby')).toBe('companyPhone-hint companyPhone-error');
        expect(el.querySelector('#companyPhone-error')).not.toBeNull();
      }
    });

    it('survives the upload-step retry and is shown, normalized, on the confirmation step', async () => {
      const { wizard, fixture, el } = await render();
      await completeStepOne(wizard);
      upload.mockRejectedValueOnce(new Error('network dropped'));
      chooseFile(wizard, pdf());
      await wizard.continueFromDocument();

      expect(wizard.companyForm.controls.contactPhone.value).toBe('+233 24 123 4567');

      upload.mockResolvedValueOnce('file-1');
      chooseFile(wizard, pdf());
      await wizard.continueFromDocument();
      fixture.detectChanges();

      expect(wizard.step()).toBe(3);
      expect(el.querySelector('.signup-summary')?.textContent).toContain('+233241234567');
    });
  });
});
