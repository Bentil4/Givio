import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { AdminUser } from '../../../../data/models/admin-user';
import type { AuditLogEntry } from '../../../../data/models/audit-log';
import { PlatformActivityPanel } from './platform-activity-panel';

const ENTRY: AuditLogEntry = {
  id: 'log-1',
  entityType: 'event',
  entityId: 'e1',
  action: 'create',
  performedBy: 'admin-1',
  previousValues: null,
  newValues: { name: 'Platform demo' },
  timestamp: '2026-10-07T09:00:00.000Z',
};

const ADMIN = { id: 'admin-1', name: 'Ama Admin', email: 'ama@example.com' } as AdminUser;

describe('PlatformActivityPanel', () => {
  async function render(inputs: Record<string, unknown>) {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    const fixture = TestBed.createComponent(PlatformActivityPanel);
    for (const [name, value] of Object.entries({ entries: [ENTRY], ...inputs })) {
      fixture.componentRef.setInput(name, value);
    }
    await fixture.whenStable();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  it('lists each entry with who did what and when, linking to the full trail', async () => {
    const { el } = await render({ state: 'ready', usersById: new Map([[ADMIN.id, ADMIN]]) });

    const row = el.querySelector('.trail-row')?.textContent ?? '';
    expect(row).toContain('Event Platform demo created');
    expect(row).toContain('Ama Admin (ama@example.com)');
    expect(el.querySelector('a.panel-link')?.getAttribute('href')).toBe('/dashboard/audit');
  });

  it('offers a retry when the activity cannot be loaded', async () => {
    const { fixture, el } = await render({ state: 'error', entries: [] });
    const retried = vi.fn();
    fixture.componentInstance.retry.subscribe(retried);

    el.querySelector<HTMLButtonElement>('[role="alert"] button')!.click();

    expect(retried).toHaveBeenCalled();
  });

  it('says when nothing has been recorded yet', async () => {
    const { el } = await render({ state: 'ready', entries: [] });

    expect(el.textContent).toContain('No platform activity recorded yet.');
  });
});
