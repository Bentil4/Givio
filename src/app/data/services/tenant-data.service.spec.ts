import { TestBed } from '@angular/core/testing';
import { AppwriteException } from 'appwrite';
import { TenantDataService } from './tenant-data.service';
import { AuthService } from './auth.service';
import { DATABASES, FUNCTIONS, STORAGE } from '../../core/appwrite/client';
import { ServiceError } from '../../core/services/service-error';
import { environment } from '../../../environments/environment';

describe('TenantDataService', () => {
  let service: TenantDataService;
  let databases: { listRows: ReturnType<typeof vi.fn> };
  let functions: { createExecution: ReturnType<typeof vi.fn> };
  let storage: { createFile: ReturnType<typeof vi.fn> };
  let currentUser: { $id: string } | null;

  beforeEach(() => {
    databases = { listRows: vi.fn() };
    functions = { createExecution: vi.fn() };
    storage = { createFile: vi.fn() };
    currentUser = { $id: 'user-1' };
    TestBed.configureTestingModule({
      providers: [
        { provide: DATABASES, useValue: databases },
        { provide: FUNCTIONS, useValue: functions },
        { provide: STORAGE, useValue: storage },
        { provide: AuthService, useValue: { currentUser: () => currentUser } },
      ],
    });
    service = TestBed.inject(TenantDataService);
  });

  describe('getMyActiveMembership', () => {
    it('returns null when there is no signed-in user', async () => {
      currentUser = null;

      const result = await service.getMyActiveMembership();

      expect(result).toBeNull();
      expect(databases.listRows).not.toHaveBeenCalled();
    });

    it('returns null when the caller has no active Membership row', async () => {
      databases.listRows.mockResolvedValueOnce({ rows: [] });

      const result = await service.getMyActiveMembership();

      expect(result).toBeNull();
    });

    it('returns null (never throws) when the lookup fails — e.g. offline', async () => {
      databases.listRows.mockRejectedValueOnce(new Error('offline'));

      const result = await service.getMyActiveMembership();

      expect(result).toBeNull();
    });

    it("maps the first matching row and queries by the caller's own userId and active status", async () => {
      databases.listRows.mockResolvedValueOnce({
        rows: [
          {
            $id: 'membership-1',
            userId: 'user-1',
            tenantId: 'tenant-1',
            role: 'super_organizer',
            status: 'active',
            grantedBy: 'admin-1',
            grantedAt: '2026-09-25T00:00:00.000Z',
          },
        ],
      });

      const result = await service.getMyActiveMembership();

      expect(result).toEqual({
        id: 'membership-1',
        userId: 'user-1',
        tenantId: 'tenant-1',
        role: 'super_organizer',
        status: 'active',
        grantedBy: 'admin-1',
        grantedAt: '2026-09-25T00:00:00.000Z',
      });
      expect(databases.listRows).toHaveBeenCalledWith(
        expect.objectContaining({
          queries: expect.arrayContaining([
            expect.stringContaining('user-1'),
            expect.stringContaining('active'),
          ]),
        }),
      );
    });
  });

  describe('getMyMembership', () => {
    it('throws a ServiceError when the lookup fails, rather than reporting no Membership', async () => {
      databases.listRows.mockRejectedValueOnce(new Error('offline'));

      await expect(service.getMyMembership()).rejects.toBeInstanceOf(ServiceError);
    });

    it('returns the row in any status', async () => {
      databases.listRows.mockResolvedValueOnce({
        rows: [
          { $id: 'm1', userId: 'user-1', tenantId: 't1', role: 'organizer', status: 'revoked' },
        ],
      });

      expect((await service.getMyMembership())?.status).toBe('revoked');
    });
  });

  describe('uploadVerificationDocument', () => {
    it("uploads to the tenant documents bucket with only the applicant's own permissions", async () => {
      storage.createFile.mockResolvedValueOnce({ $id: 'file-1' });
      const file = new File(['%PDF'], 'reg.pdf', { type: 'application/pdf' });

      const fileId = await service.uploadVerificationDocument(file);

      expect(fileId).toBe('file-1');
      const [args] = storage.createFile.mock.calls[0];
      expect(args.bucketId).toBe(environment.tenantDocumentsBucketId);
      expect(args.file).toBe(file);
      expect(args.permissions).toEqual([
        'read("user:user-1")',
        'update("user:user-1")',
        'delete("user:user-1")',
      ]);
    });

    it('wraps an upload failure in a ServiceError', async () => {
      storage.createFile.mockRejectedValueOnce(new Error('network'));

      await expect(
        service.uploadVerificationDocument(new File(['x'], 'a.pdf', { type: 'application/pdf' })),
      ).rejects.toBeInstanceOf(ServiceError);
    });
  });

  describe('Function actions', () => {
    it('submitTenantApplication sends only the intake and document id', async () => {
      functions.createExecution.mockResolvedValueOnce({
        responseStatusCode: 200,
        responseBody: JSON.stringify({ tenantId: 't1', membershipId: 'm1' }),
      });
      const company = {
        name: 'Asante Events',
        location: 'Kumasi',
        size: '11-50' as const,
        type: 'funeral' as const,
        estimatedUserCount: 12,
      };

      const result = await service.submitTenantApplication({
        company,
        verificationDocumentId: 'f1',
      });

      expect(result.tenantId).toBe('t1');
      expect(JSON.parse(functions.createExecution.mock.calls[0][0].body)).toEqual({
        action: 'submitTenantApplication',
        company,
        verificationDocumentId: 'f1',
      });
    });

    it('inviteOrganizer surfaces the Function error message', async () => {
      functions.createExecution.mockResolvedValueOnce({
        responseStatusCode: 409,
        responseBody: JSON.stringify({ error: 'A user with this email already exists' }),
      });

      await expect(
        service.inviteOrganizer({
          name: 'K',
          email: 'k@x.co',
          company: {
            name: 'A',
            location: 'B',
            size: '1-10',
            type: 'other',
            estimatedUserCount: 1,
          },
        }),
      ).rejects.toThrow('A user with this email already exists');
    });
  });

  describe('Admin approval queue (Story 6.5)', () => {
    const row = (id: string, createdAt: string) => ({
      $id: id,
      name: `Company ${id}`,
      location: 'Accra',
      size: '1-10',
      type: 'other',
      estimatedUserCount: 3,
      status: 'pending',
      superOrganizerId: `owner-${id}`,
      verificationDocumentId: `file-${id}`,
      verifiedBy: null,
      verifiedAt: null,
      createdAt,
    });

    it('listPendingTenants pages through every pending Tenant and sorts oldest first', async () => {
      const firstPage = Array.from({ length: 100 }, (_, i) =>
        row(`p${i}`, `2026-09-${String(10 + (i % 10)).padStart(2, '0')}T00:00:00.000Z`),
      );
      databases.listRows
        .mockResolvedValueOnce({ rows: firstPage })
        .mockResolvedValueOnce({ rows: [row('early', '2026-09-01T00:00:00.000Z')] });

      const tenants = await service.listPendingTenants();

      expect(tenants).toHaveLength(101);
      expect(tenants[0].id).toBe('early');
      expect(tenants[0].verifiedBy).toBeUndefined();
      const [first, second] = databases.listRows.mock.calls.map((c) => c[0]);
      expect(first.tableId).toBe(environment.tenantsCollectionId);
      expect(
        first.queries.some((q: string) => q.includes('"status"') && q.includes('pending')),
      ).toBe(true);
      expect(
        second.queries.some((q: string) => q.includes('cursorAfter') && q.includes('p99')),
      ).toBe(true);
    });

    it('listPendingTenants wraps a failed read in a ServiceError', async () => {
      databases.listRows.mockRejectedValueOnce(new Error('offline'));

      await expect(service.listPendingTenants()).rejects.toBeInstanceOf(ServiceError);
    });

    it('getVerificationDocument returns the file name and a view URL', async () => {
      Object.assign(storage, {
        getFile: vi
          .fn()
          .mockResolvedValue({ name: 'reg.pdf', mimeType: 'application/pdf', sizeOriginal: 2048 }),
        getFileView: vi.fn().mockReturnValue('https://files.example/view'),
      });

      const doc = await service.getVerificationDocument('file-1');

      expect(doc).toEqual({
        name: 'reg.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 2048,
        viewUrl: 'https://files.example/view',
      });
    });

    it('getVerificationDocument returns null when the file is gone, and throws otherwise', async () => {
      const getFile = vi
        .fn()
        .mockRejectedValueOnce(new AppwriteException('File not found', 404))
        .mockRejectedValueOnce(new Error('offline'));
      Object.assign(storage, { getFile, getFileView: vi.fn() });

      await expect(service.getVerificationDocument('file-1')).resolves.toBeNull();
      await expect(service.getVerificationDocument('file-1')).rejects.toBeInstanceOf(ServiceError);
    });

    it('recordTenantVerification attests both checks in one call', async () => {
      functions.createExecution.mockResolvedValueOnce({
        responseStatusCode: 200,
        responseBody: JSON.stringify({
          success: true,
          tenantId: 't1',
          verifiedBy: 'admin-1',
          verifiedAt: '2026-09-30T10:00:00.000Z',
        }),
      });

      const result = await service.recordTenantVerification('t1');

      expect(result).toEqual({ verifiedBy: 'admin-1', verifiedAt: '2026-09-30T10:00:00.000Z' });
      expect(JSON.parse(functions.createExecution.mock.calls[0][0].body)).toEqual({
        action: 'recordTenantVerification',
        tenantId: 't1',
        documentReviewed: true,
        phoneVerified: true,
      });
    });

    it('decideTenantApplication sends setTenantStatus and surfaces a refusal', async () => {
      functions.createExecution
        .mockResolvedValueOnce({ responseStatusCode: 200, responseBody: '{"success":true}' })
        .mockResolvedValueOnce({
          responseStatusCode: 409,
          responseBody: JSON.stringify({
            error: 'Record the document review and phone verification before approving',
          }),
        });

      await service.decideTenantApplication('t1', 'rejected');
      expect(JSON.parse(functions.createExecution.mock.calls[0][0].body)).toEqual({
        action: 'setTenantStatus',
        tenantId: 't1',
        status: 'rejected',
      });
      await expect(service.decideTenantApplication('t1', 'approved')).rejects.toThrow(
        'Record the document review and phone verification before approving',
      );
    });
  });
});
