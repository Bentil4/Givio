import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { FunctionRejectedError } from '../../../../../data/appwrite/invoke-admin-function';
import { SupportRequestDataService } from '../../../../../data/services/support-request-data.service';
import { CompanyDispute } from './company-dispute';

describe('CompanyDispute', () => {
  let submitDispute: ReturnType<typeof vi.fn>;

  async function render() {
    submitDispute = vi.fn();
    TestBed.configureTestingModule({
      imports: [CompanyDispute],
      providers: [
        provideRouter([]),
        { provide: SupportRequestDataService, useValue: { submitDispute } },
      ],
    });
    const fixture = TestBed.createComponent(CompanyDispute);
    document.body.appendChild(fixture.nativeElement);
    fixture.detectChanges();
    await fixture.whenStable();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  function fill(fixture: ComponentFixture<CompanyDispute>, values: Record<string, string>) {
    const el = fixture.nativeElement as HTMLElement;
    for (const [id, value] of Object.entries(values)) {
      const field = el.querySelector<HTMLInputElement | HTMLTextAreaElement>(`#${id}`)!;
      field.value = value;
      field.dispatchEvent(new Event('input'));
    }
    fixture.detectChanges();
  }

  async function send(fixture: ComponentFixture<CompanyDispute>) {
    (fixture.nativeElement as HTMLElement)
      .querySelector('form')!
      .dispatchEvent(new Event('submit'));
    await fixture.whenStable();
    fixture.detectChanges();
    await fixture.whenStable();
  }

  const VALID = {
    'dispute-email': 'kwame@asante.test',
    'dispute-tenant': ' Asante Events ',
    'dispute-message': 'We were suspended by mistake.',
  };

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('moves focus to the heading and labels every field', async () => {
    const { el } = await render();

    expect(document.activeElement).toBe(el.querySelector('h1'));
    for (const id of Object.keys(VALID)) {
      expect(el.querySelector(`label[for="${id}"]`)).not.toBeNull();
    }
  });

  it('submits email, company name and message, then shows the inline confirmation', async () => {
    const { fixture, el } = await render();
    submitDispute.mockResolvedValueOnce(undefined);

    fill(fixture, VALID);
    await send(fixture);

    expect(submitDispute).toHaveBeenCalledWith({
      email: 'kwame@asante.test',
      tenantName: 'Asante Events',
      message: 'We were suspended by mistake.',
    });
    expect(el.querySelector('form')).toBeNull();
    const confirmation = el.querySelector('[role="status"]');
    expect(confirmation?.textContent).toContain('Sent — Admin will follow up.');
    expect(document.activeElement).toBe(confirmation);
  });

  it('keeps every entered value and shows the error inline above the submit button on failure', async () => {
    const { fixture, el } = await render();
    submitDispute.mockRejectedValueOnce(
      new FunctionRejectedError('We are receiving a lot of requests right now.', '', 429),
    );

    fill(fixture, VALID);
    await send(fixture);

    expect(el.querySelector<HTMLInputElement>('#dispute-email')?.value).toBe('kwame@asante.test');
    expect(el.querySelector<HTMLTextAreaElement>('#dispute-message')?.value).toBe(
      'We were suspended by mistake.',
    );
    const alert = el.querySelector('[role="alert"]');
    expect(alert?.textContent).toContain('a lot of requests');
    const submit = el.querySelector('button[type="submit"]')!;
    expect(alert!.compareDocumentPosition(submit) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('rejects an email the Function would reject, without calling it, and focuses that field', async () => {
    const { fixture, el } = await render();

    fill(fixture, { ...VALID, 'dispute-email': 'kwame@asante' });
    await send(fixture);

    expect(submitDispute).not.toHaveBeenCalled();
    const email = el.querySelector('#dispute-email')!;
    expect(email.getAttribute('aria-invalid')).toBe('true');
    expect(document.activeElement).toBe(email);
  });

  it('treats a whitespace-only company name as missing', async () => {
    const { fixture, el } = await render();

    fill(fixture, { ...VALID, 'dispute-tenant': '   ' });
    await send(fixture);

    expect(submitDispute).not.toHaveBeenCalled();
    expect(el.querySelector('#dispute-tenant-error')).not.toBeNull();
    expect(document.activeElement).toBe(el.querySelector('#dispute-tenant'));
  });
});
