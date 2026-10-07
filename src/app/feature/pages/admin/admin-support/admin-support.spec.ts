import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { ApprovalCountsService } from '../../../../data/services/approval-counts.service';
import { SupportRequestDataService } from '../../../../data/services/support-request-data.service';
import type { SupportRequest } from '../../../../data/models/support-request';
import { AdminSupport } from './admin-support';

const request = (id: string, overrides: Partial<SupportRequest> = {}): SupportRequest => ({
  id,
  type: 'question',
  status: 'open',
  message: `Message ${id}`,
  createdAt: '2026-10-07T10:00:00.000Z',
  tenantId: 't1',
  tenantName: `Company ${id}`,
  contactEmail: `${id}@co.test`,
  senderName: null,
  senderEmail: null,
  closedAt: null,
  closedBy: null,
  closedByName: null,
  ...overrides,
});

describe('AdminSupport', () => {
  let supportData: {
    listRequests: ReturnType<typeof vi.fn>;
    setStatus: ReturnType<typeof vi.fn>;
  };
  let approvalCounts: { refreshSupportRequests: ReturnType<typeof vi.fn> };
  let fixture: ComponentFixture<AdminSupport>;

  async function render(tab?: string): Promise<HTMLElement> {
    TestBed.configureTestingModule({
      imports: [AdminSupport],
      providers: [
        { provide: SupportRequestDataService, useValue: supportData },
        { provide: ApprovalCountsService, useValue: approvalCounts },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { queryParamMap: convertToParamMap(tab ? { tab } : {}) } },
        },
      ],
    });
    fixture = TestBed.createComponent(AdminSupport);
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  const el = () => fixture.nativeElement as HTMLElement;
  const cards = () => el().querySelectorAll('app-support-request-card');
  const button = (text: string) =>
    [...el().querySelectorAll('button')].find((b) => b.textContent?.includes(text));

  beforeEach(() => {
    supportData = {
      listRequests: vi.fn().mockResolvedValue({ requests: [], nextCursor: null }),
      setStatus: vi.fn().mockResolvedValue(undefined),
    };
    approvalCounts = { refreshSupportRequests: vi.fn().mockResolvedValue(undefined) };
  });

  it('loads the open tab first, showing a loading status until it arrives', async () => {
    let resolve!: (page: unknown) => void;
    supportData.listRequests.mockReturnValueOnce(new Promise((r) => (resolve = r)));

    await render();

    expect(el().querySelector('app-skeleton-rows')).not.toBeNull();
    resolve({ requests: [request('a')], nextCursor: null });
    await fixture.whenStable();
    fixture.detectChanges();
    expect(el().querySelector('app-skeleton-rows')).toBeNull();
    expect(supportData.listRequests).toHaveBeenCalledWith({ status: 'open' });
    expect(cards().length).toBe(1);
  });

  it('opens on the closed tab for ?tab=closed', async () => {
    await render('closed');

    expect(supportData.listRequests).toHaveBeenCalledWith({ status: 'closed' });
    expect(el().querySelector('#support-tab-closed')?.getAttribute('aria-selected')).toBe('true');
  });

  it('exposes WAI-ARIA tabs wired to a labelled tabpanel', async () => {
    await render();

    const tabs = el().querySelectorAll('[role="tab"]');
    expect(el().querySelector('[role="tablist"]')).not.toBeNull();
    expect([...tabs].map((t) => t.getAttribute('tabindex'))).toEqual(['0', '-1']);
    const panel = el().querySelector('[role="tabpanel"]');
    expect(panel?.getAttribute('aria-labelledby')).toBe('support-tab-open');
  });

  it('reloads for the other status when a tab is chosen, and arrow keys move between tabs', async () => {
    await render();

    el()
      .querySelector('#support-tab-open')
      ?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
    await fixture.whenStable();

    expect(supportData.listRequests).toHaveBeenLastCalledWith({ status: 'closed' });
    expect(el().querySelector('#support-tab-closed')?.getAttribute('aria-selected')).toBe('true');
  });

  it('shows an empty state per tab', async () => {
    await render();
    expect(el().textContent).toContain('No open requests');

    button('Closed')?.click();
    await fixture.whenStable();
    expect(el().textContent).toContain('No closed requests');
  });

  it('shows an alert with a retry when loading fails, and recovers on retry', async () => {
    supportData.listRequests.mockRejectedValueOnce(new Error('down'));
    await render();

    expect(el().querySelector('[role="alert"]')?.textContent).toContain("Couldn't load");
    supportData.listRequests.mockResolvedValueOnce({ requests: [request('a')], nextCursor: null });
    button('Try again')?.click();
    await fixture.whenStable();

    expect(cards().length).toBe(1);
    expect(el().querySelector('[role="alert"]')).toBeNull();
  });

  it('appends the next page on Load more and hides it on the last page', async () => {
    supportData.listRequests.mockResolvedValueOnce({ requests: [request('a')], nextCursor: 'a' });
    await render();
    supportData.listRequests.mockResolvedValueOnce({ requests: [request('b')], nextCursor: null });

    button('Load more')?.click();
    await fixture.whenStable();

    expect(supportData.listRequests).toHaveBeenLastCalledWith({ status: 'open', cursor: 'a' });
    expect(cards().length).toBe(2);
    expect(button('Load more')).toBeUndefined();
  });

  it('removes a closed request at once, announces it and refreshes the badge count', async () => {
    supportData.listRequests.mockResolvedValueOnce({
      requests: [request('a'), request('b')],
      nextCursor: null,
    });
    await render();

    button('Mark closed')?.click();
    await fixture.whenStable();

    expect(supportData.setStatus).toHaveBeenCalledWith('a', 'closed');
    expect(cards().length).toBe(1);
    expect(el().querySelector('[role="status"]')?.textContent).toContain(
      'Request from Company a marked closed.',
    );
    expect(approvalCounts.refreshSupportRequests).toHaveBeenCalledOnce();
  });

  it('reopens from the closed tab', async () => {
    supportData.listRequests.mockResolvedValueOnce({
      requests: [request('a', { status: 'closed' })],
      nextCursor: null,
    });
    await render('closed');

    button('Reopen')?.click();
    await fixture.whenStable();

    expect(supportData.setStatus).toHaveBeenCalledWith('a', 'open');
    expect(el().textContent).toContain('No closed requests');
  });

  it('puts the request back in place and says so when the change fails', async () => {
    supportData.listRequests.mockResolvedValueOnce({
      requests: [request('a'), request('b'), request('c')],
      nextCursor: null,
    });
    await render();
    supportData.setStatus.mockRejectedValueOnce(new Error('nope'));

    el().querySelectorAll<HTMLButtonElement>('button.btn-secondary')[1]?.click();
    await fixture.whenStable();

    expect(el().querySelector('[role="alert"]')?.textContent).toContain('Company b');
    const titles = [...el().querySelectorAll('h3')].map((h) => h.textContent?.trim());
    expect(titles).toEqual(['Company a', 'Company b', 'Company c']);
    expect(approvalCounts.refreshSupportRequests).not.toHaveBeenCalled();
  });
});
