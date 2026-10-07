import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideRouter } from '@angular/router';
import { AdminDashboard } from './admin-dashboard';
import type { AdminUser } from '../../../../data/models/admin-user';
import type { Tenant, TenantStatus } from '../../../../data/models/tenant';
import { ApprovalCountsService } from '../../../../data/services/approval-counts.service';
import { SupportRequestDataService } from '../../../../data/services/support-request-data.service';
import { TenantLifecycleDataService } from '../../../../data/services/tenant-lifecycle-data.service';
import { UserService } from '../../../../data/services/user.service';

const tenant = (id: string, status: TenantStatus) => ({ id, name: id, status }) as Tenant;
const user = (id: string, role: AdminUser['role']) => ({ id, role }) as AdminUser;

const TENANTS = [
  tenant('t1', 'approved'),
  tenant('t2', 'approved'),
  tenant('t3', 'pending'),
  tenant('t4', 'suspended'),
];
const USERS = [
  user('a1', 'admin'),
  user('o1', 'operator'),
  user('o2', 'operator'),
  user('c1', null),
];

describe('AdminDashboard (platform metrics only — AD-12, amended 2026-10-07)', () => {
  let countOpenRequests: ReturnType<typeof vi.fn>;
  let refresh: ReturnType<typeof vi.fn>;

  async function render(): Promise<HTMLElement> {
    TestBed.configureTestingModule({
      imports: [AdminDashboard],
      providers: [
        provideRouter([]),
        { provide: TenantLifecycleDataService, useValue: { listTenants: async () => TENANTS } },
        { provide: UserService, useValue: { listUsers: async () => USERS } },
        { provide: SupportRequestDataService, useValue: { countOpenRequests } },
        { provide: ApprovalCountsService, useValue: { total: signal(5), refresh } },
      ],
    });
    const fixture = TestBed.createComponent(AdminDashboard);
    await vi.waitFor(() => expect(fixture.componentInstance.loading()).toBe(false));
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  const tile = (el: HTMLElement, label: string) =>
    [...el.querySelectorAll('.stat-tile')].find((t) => t.textContent?.includes(label))
      ?.textContent ?? '';

  beforeEach(() => {
    countOpenRequests = vi.fn().mockResolvedValue(7);
    refresh = vi.fn().mockResolvedValue(undefined);
  });

  it('shows companies, pending approvals, users and open support requests', async () => {
    const el = await render();

    expect(tile(el, 'Active companies')).toContain('2');
    expect(tile(el, 'Active companies')).toContain('1 suspended');
    expect(tile(el, 'Pending approvals')).toContain('5');
    expect(tile(el, 'Users')).toContain('4');
    expect(tile(el, 'Users')).toContain('1 admins · 2 operators');
    expect(tile(el, 'Open support requests')).toContain('7');
    expect(refresh).toHaveBeenCalled();
  });

  it('lists every company status with its count', async () => {
    const el = await render();

    const rows = [...el.querySelectorAll('.status-list li')].map((li) =>
      [...li.querySelectorAll('span')].map((span) => span.textContent?.trim()).join(' '),
    );
    expect(rows).toEqual(['Active 2', 'Awaiting approval 1', 'Suspended 1', 'Rejected 0']);
  });

  it('shows no event or donation figures and links to no event or donation page', async () => {
    const el = await render();

    const text = el.textContent?.toLowerCase() ?? '';
    expect(text).not.toContain('donation');
    expect(text).not.toContain('raised');
    const links = [...el.querySelectorAll('a')].map((a) => a.getAttribute('href'));
    expect(links).toEqual(['/dashboard/approvals', '/dashboard/companies']);
  });

  it('shows the support count as unavailable, never as zero, when it cannot be read', async () => {
    countOpenRequests.mockRejectedValueOnce(new Error('offline'));

    const el = await render();

    expect(tile(el, 'Open support requests')).toContain('—');
    expect(tile(el, 'Open support requests')).toContain('Not available');
  });
});
