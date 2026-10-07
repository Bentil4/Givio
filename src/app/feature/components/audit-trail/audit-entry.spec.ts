import type { AuditLogEntry } from '../../../data/models/audit-log';
import { toAuditEntry } from './audit-entry';

const entry = (overrides: Partial<AuditLogEntry>): AuditLogEntry => ({
  id: 'a1',
  entityType: 'tenant',
  entityId: 't1',
  action: 'edit',
  performedBy: 'so-1',
  previousValues: {},
  newValues: {},
  timestamp: '2026-10-08T09:00:00.000Z',
  ...overrides,
});

describe('toAuditEntry — company profile changes', () => {
  it('names the fields that changed, with their old and new values', () => {
    const mapped = toAuditEntry(
      entry({
        previousValues: { name: 'Old Name', contactPhone: null },
        newValues: { name: 'Asante Events', contactPhone: '+233241234567', tenantId: 't1' },
      }),
    );

    expect(mapped.summary).toBe('Company profile edited');
    expect(mapped.detail).toBe(
      'Name: Old Name → Asante Events · Contact phone: none → +233241234567',
    );
    expect(mapped.actor).toBe('so-1');
  });

  it.each([
    ['set', 'Logo added'],
    ['replaced', 'Logo replaced'],
    ['none', 'Logo removed'],
  ])('describes a logo that is now "%s" without showing any image', (state, text) => {
    const mapped = toAuditEntry(entry({ newValues: { logo: state, tenantId: 't1' } }));

    expect(mapped.detail).toBe(text);
  });

  it('combines text changes and a logo change in one line', () => {
    const mapped = toAuditEntry(
      entry({
        previousValues: { location: 'Accra', logo: 'none' },
        newValues: { location: 'Kumasi', logo: 'set', tenantId: 't1' },
      }),
    );

    expect(mapped.detail).toBe('Location: Accra → Kumasi · Logo added');
  });

  it('has no detail when nothing recognisable changed', () => {
    expect(toAuditEntry(entry({ newValues: { tenantId: 't1' } })).detail).toBeUndefined();
  });
});

describe('toAuditEntry — existing entity types', () => {
  it('still describes an event and a donation', () => {
    const event = toAuditEntry(
      entry({ entityType: 'event', action: 'create', newValues: { name: 'Mensah Wedding' } }),
    );
    const donation = toAuditEntry(
      entry({ entityType: 'donation', action: 'delete', previousValues: { receiptNumber: 'R-9' } }),
    );

    expect(event.summary).toBe('Event Mensah Wedding created');
    expect(donation.summary).toBe('Donation R-9 deleted');
  });
});
