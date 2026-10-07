import { TestBed } from '@angular/core/testing';
import { TeamDataService } from './team-data.service';
import { FUNCTIONS } from '../../core/appwrite/client';

describe('TeamDataService', () => {
  let service: TeamDataService;
  let createExecution: ReturnType<typeof vi.fn>;

  const respond = (status: number, body: object) =>
    createExecution.mockResolvedValueOnce({
      responseStatusCode: status,
      responseBody: JSON.stringify(body),
    });
  const sentBody = () => JSON.parse(createExecution.mock.calls[0][0].body);

  beforeEach(() => {
    createExecution = vi.fn();
    TestBed.configureTestingModule({
      providers: [{ provide: FUNCTIONS, useValue: { createExecution } }],
    });
    service = TestBed.inject(TeamDataService);
  });

  it('listTeamMembers never sends a tenantId — the Function resolves it from the caller', async () => {
    respond(200, { members: [{ membershipId: 'm1', name: 'Ama' }] });

    const members = await service.listTeamMembers();

    expect(members).toEqual([{ membershipId: 'm1', name: 'Ama' }]);
    expect(sentBody()).toEqual({ action: 'listTeamMembers' });
  });

  it('listTeamMembersIncludingRevoked asks for revoked members too', async () => {
    respond(200, { members: [{ membershipId: 'm1', status: 'revoked' }] });

    const members = await service.listTeamMembersIncludingRevoked();

    expect(members).toEqual([{ membershipId: 'm1', status: 'revoked' }]);
    expect(sentBody()).toEqual({ action: 'listTeamMembers', includeRevoked: true });
  });

  it('addTeamMember sends only the name, email and role', async () => {
    respond(200, { userId: 'u1', membershipId: 'm1', generatedPassword: 'pw' });

    const result = await service.addTeamMember({ name: 'Kojo', email: 'k@a.co', role: 'operator' });

    expect(result.generatedPassword).toBe('pw');
    expect(sentBody()).toEqual({
      action: 'addTeamMember',
      name: 'Kojo',
      email: 'k@a.co',
      role: 'operator',
    });
  });

  it('revokeMembership surfaces the Function error message', async () => {
    respond(403, { error: 'Forbidden' });

    await expect(service.revokeMembership('m1', { reason: 'routine' })).rejects.toThrow(
      'Forbidden',
    );
    expect(sentBody()).toEqual({
      action: 'revokeMembership',
      membershipId: 'm1',
      reason: 'routine',
    });
  });
});
