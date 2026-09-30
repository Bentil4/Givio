import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { ServiceError } from '../../../../core/services/service-error';
import { SupportRequestDataService } from '../../../../data/services/support-request-data.service';
import { CompanySupport } from './company-support';

describe('CompanySupport', () => {
  let submitQuestion: ReturnType<typeof vi.fn>;

  async function render() {
    submitQuestion = vi.fn();
    TestBed.configureTestingModule({
      imports: [CompanySupport],
      providers: [
        provideRouter([]),
        { provide: SupportRequestDataService, useValue: { submitQuestion } },
      ],
    });
    const fixture = TestBed.createComponent(CompanySupport);
    document.body.appendChild(fixture.nativeElement);
    fixture.detectChanges();
    await fixture.whenStable();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  async function type(fixture: Awaited<ReturnType<typeof render>>['fixture'], text: string) {
    const textarea = (fixture.nativeElement as HTMLElement).querySelector('textarea')!;
    textarea.value = text;
    textarea.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  }

  async function send(fixture: Awaited<ReturnType<typeof render>>['fixture']) {
    (fixture.nativeElement as HTMLElement)
      .querySelector('form')!
      .dispatchEvent(new Event('submit'));
    await fixture.whenStable();
    fixture.detectChanges();
    await fixture.whenStable();
  }

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('labels the message field', async () => {
    const { el } = await render();

    const textarea = el.querySelector('textarea')!;
    expect(el.querySelector(`label[for="${textarea.id}"]`)?.textContent).toContain('Your message');
  });

  it('replaces the form with an inline confirmation on success — no navigation', async () => {
    const { fixture, el } = await render();
    const router = TestBed.inject(Router);
    const navigate = vi.spyOn(router, 'navigateByUrl');
    submitQuestion.mockResolvedValueOnce(undefined);

    await type(fixture, '  Where can I see my reports?  ');
    await send(fixture);

    expect(submitQuestion).toHaveBeenCalledWith('Where can I see my reports?');
    expect(el.querySelector('form')).toBeNull();
    const confirmation = el.querySelector('[role="status"]');
    expect(confirmation?.textContent).toContain('Sent — Admin will follow up.');
    expect(document.activeElement).toBe(confirmation);
    expect(navigate).not.toHaveBeenCalled();
  });

  it('lets a second question be sent from the same screen', async () => {
    const { fixture, el } = await render();
    submitQuestion.mockResolvedValueOnce(undefined);
    await type(fixture, 'First question');
    await send(fixture);

    el.querySelector<HTMLButtonElement>('.support-actions button')!.click();
    fixture.detectChanges();
    await fixture.whenStable();

    const textarea = el.querySelector('textarea');
    expect(textarea?.value).toBe('');
    expect(document.activeElement).toBe(textarea);
  });

  it('keeps the entered text and shows an inline error above the submit button on failure', async () => {
    const { fixture, el } = await render();
    submitQuestion.mockRejectedValueOnce(
      new ServiceError("Couldn't send your message. Check your connection and try again."),
    );

    await type(fixture, 'Something looks wrong');
    await send(fixture);

    expect(el.querySelector('textarea')?.value).toBe('Something looks wrong');
    const alert = el.querySelector('[role="alert"]');
    expect(alert?.textContent).toContain("Couldn't send your message");
    const submit = el.querySelector('button[type="submit"]')!;
    expect(alert!.compareDocumentPosition(submit) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('refuses a blank message without calling the Function and focuses the field', async () => {
    const { fixture, el } = await render();

    await type(fixture, '   ');
    await send(fixture);

    expect(submitQuestion).not.toHaveBeenCalled();
    const textarea = el.querySelector('textarea')!;
    expect(textarea.getAttribute('aria-invalid')).toBe('true');
    expect(document.activeElement).toBe(textarea);
    expect(textarea.getAttribute('aria-describedby')).toContain('support-message-error');
  });

  it('shows no ticket history or status anywhere (FR-20 Non-Goal)', async () => {
    const { el } = await render();

    expect(el.textContent?.toLowerCase()).not.toMatch(/ticket|status|history|resolved/);
    expect(el.querySelector('table, ul, ol')).toBeNull();
  });
});
