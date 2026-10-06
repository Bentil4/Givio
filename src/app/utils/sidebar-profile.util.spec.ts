import { buildSidebarProfile, initialsOf } from './sidebar-profile.util';

describe('buildSidebarProfile', () => {
  const user = { name: 'Ama Mensah', email: 'ama@givio.test' };

  it('pairs the name with the tier badge', () => {
    expect(buildSidebarProfile(user, 'super_organizer', '/company/settings')).toEqual({
      name: 'Ama Mensah',
      email: 'ama@givio.test',
      tierLabel: 'Super Organizer',
      tierIcon: 'domain',
      settingsRoute: '/company/settings',
    });
  });

  it('labels a Super Admin distinctly from an Admin', () => {
    expect(buildSidebarProfile(user, 'super_admin')?.tierLabel).toBe('Super Admin');
    expect(buildSidebarProfile(user, 'admin')?.tierLabel).toBe('Admin');
  });

  it('falls back to the email when the account has no name', () => {
    expect(buildSidebarProfile({ name: '  ', email: 'x@y.z' }, 'operator')?.name).toBe('x@y.z');
  });

  it('is null until both the user and the tier are known', () => {
    expect(buildSidebarProfile(null, 'admin')).toBeNull();
    expect(buildSidebarProfile(user, null)).toBeNull();
  });
});

describe('initialsOf', () => {
  it('takes the first and last word', () => {
    expect(initialsOf('Ama Kofi Mensah')).toBe('AM');
  });

  it('uses one letter for a single word', () => {
    expect(initialsOf('admin')).toBe('A');
  });

  it('never returns an empty string', () => {
    expect(initialsOf('   ')).toBe('?');
  });
});
