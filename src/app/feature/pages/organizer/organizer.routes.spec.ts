import { SettingsPage } from '../settings/settings-page/settings-page';
import { ORGANIZER_ROUTES } from './organizer.routes';

describe('ORGANIZER_ROUTES', () => {
  it('serves the shared Settings page at /organizer/settings', async () => {
    const settings = ORGANIZER_ROUTES[0].children?.find((route) => route.path === 'settings');

    expect(settings?.title).toBe('Settings');
    expect(await settings?.loadComponent?.()).toBe(SettingsPage);
  });
});
