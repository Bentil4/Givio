import { signal, type Provider } from '@angular/core';
import { vi } from 'vitest';
import { CompanyDonationDataService } from '../../../../data/services/company-donation-data.service';
import { CompanyConflictDataService } from '../../../../data/services/company-conflict-data.service';
import { OrganizerEventDataService } from '../../../../data/services/organizer-event-data.service';
import { ReportService } from '../../../../data/services/report.service';
import { TeamDataService } from '../../../../data/services/team-data.service';
import { TenantService } from '../../../../data/services/tenant.service';
import type { Donation } from '../../../../data/models/donation';
import type { Event } from '../../../../data/models/event';
import type { MembershipRole } from '../../../../data/models/membership';
import type { TeamMember } from '../../../../data/models/team-member';
import { makeDonation } from '../../../../data/models/donation-test-fixtures';

/** Shared setup for the company event-detail and Donations page specs. */
export interface CompanyDonationsBackend {
  listTenantEvents: ReturnType<typeof vi.fn>;
  listDonationsForEvents: ReturnType<typeof vi.fn>;
  editDonation: ReturnType<typeof vi.fn>;
  softDeleteDonation: ReturnType<typeof vi.fn>;
  restoreDonation: ReturnType<typeof vi.fn>;
  listTeamMembersIncludingRevoked: ReturnType<typeof vi.fn>;
  listConflicts: ReturnType<typeof vi.fn>;
  resolveConflict: ReturnType<typeof vi.fn>;
  exportDonationsXlsx: ReturnType<typeof vi.fn>;
}

export const makeCompanyEvent = (overrides: Partial<Event> = {}): Event => ({
  id: 'e1',
  name: 'Odoi Funeral',
  type: 'funeral',
  date: '2026-11-02T00:00:00.000+00:00',
  hostName: 'The Odoi Family',
  venue: 'Osu Presbyterian Church',
  status: 'active',
  tenantId: 'tenant-a',
  assignedUserIds: ['op-1'],
  createdBy: 'so-a',
  nextReceiptSeq: 3,
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
  ...overrides,
});

const member = (userId: string, name: string, status: TeamMember['status']): TeamMember => ({
  membershipId: `m-${userId}`,
  userId,
  name,
  email: `${userId}@a.co`,
  role: 'operator',
  status,
  grantedAt: '2026-09-01T00:00:00.000Z',
  isSelf: false,
});

/** Kwesi still works the desk; Efua's access was revoked after she recorded a gift. */
export const TEAM: TeamMember[] = [
  member('op-1', 'Kwesi Boateng', 'active'),
  member('op-gone', 'Efua Mensah', 'revoked'),
];

export const COMPANY_DONATIONS: Donation[] = [
  makeDonation({ id: 'd1', receiptNumber: 'FUN-0001', donorName: 'Ama Owusu' }),
  makeDonation({
    id: 'd2',
    receiptNumber: 'FUN-0002',
    donorName: 'Yaw Darko',
    amountMinor: 20000,
    donationType: 'mobile_money',
    recordedBy: 'op-gone',
  }),
  makeDonation({
    id: 'd3',
    receiptNumber: 'FUN-0003',
    donorName: 'Kofi Asare',
    deletedAt: '2026-10-11T09:00:00.000Z',
    deletedBy: 'so-a',
    deletionReason: 'Duplicate of FUN-0001',
  }),
];

export function createCompanyDonationsBackend(): CompanyDonationsBackend {
  return {
    listTenantEvents: vi.fn().mockResolvedValue([makeCompanyEvent()]),
    listDonationsForEvents: vi.fn().mockResolvedValue(COMPANY_DONATIONS),
    editDonation: vi.fn(),
    softDeleteDonation: vi.fn(),
    restoreDonation: vi.fn(),
    listTeamMembersIncludingRevoked: vi.fn().mockResolvedValue(TEAM),
    listConflicts: vi.fn().mockResolvedValue([]),
    resolveConflict: vi.fn().mockResolvedValue(undefined),
    exportDonationsXlsx: vi.fn(),
  };
}

export function provideCompanyDonationsBackend(
  backend: CompanyDonationsBackend,
  role: MembershipRole,
): Provider[] {
  return [
    {
      provide: OrganizerEventDataService,
      useValue: { listTenantEvents: backend.listTenantEvents },
    },
    {
      provide: CompanyDonationDataService,
      useValue: {
        listDonationsForEvents: backend.listDonationsForEvents,
        editDonation: backend.editDonation,
        softDeleteDonation: backend.softDeleteDonation,
        restoreDonation: backend.restoreDonation,
      },
    },
    {
      provide: TeamDataService,
      useValue: { listTeamMembersIncludingRevoked: backend.listTeamMembersIncludingRevoked },
    },
    {
      provide: CompanyConflictDataService,
      useValue: { listConflicts: backend.listConflicts, resolveConflict: backend.resolveConflict },
    },
    { provide: ReportService, useValue: { exportDonationsXlsx: backend.exportDonationsXlsx } },
    {
      provide: TenantService,
      useValue: { context: signal({ membership: { tenantId: 'tenant-a', role } }) },
    },
  ];
}

export const buttonNamed = (el: HTMLElement, text: string) =>
  Array.from(el.querySelectorAll('button')).find((b) => b.textContent?.includes(text));

export async function settle(fixture: {
  detectChanges(): void;
  whenStable(): Promise<unknown>;
}): Promise<void> {
  fixture.detectChanges();
  await fixture.whenStable();
  // The page's loads are plain promises, not tracked tasks: let them all resolve.
  await new Promise((resolve) => setTimeout(resolve));
  fixture.detectChanges();
}
