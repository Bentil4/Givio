import { test } from 'node:test';
import assert from 'node:assert/strict';
import { seedStore, withEnv, run } from './helpers/team-management-fixtures.js';

// updateCompanyProfile: the Super Organizer edits their own company's name, location, contact
// phone and logo. Co-Organizers can read these details but not change them.

const PNG_LOGO = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==';

const update = (extra = {}) => ({
  action: 'updateCompanyProfile',
  name: '  Asante Events  ',
  location: 'Kumasi',
  contactPhone: '+233 24 123 4567',
  logo: PNG_LOGO,
  ...extra,
});

const tenantUpdates = (calls) =>
  (calls.updateRow ?? []).filter(([args]) => args.tableId === 'tenants-1');

test(
  "a Super Organizer updates their own company's profile",
  withEnv(async () => {
    const { result, store } = await run({ body: update(), as: 'so-a' });

    assert.equal(result.status, 200);
    assert.deepEqual(result.body, {
      success: true,
      tenant: {
        name: 'Asante Events',
        location: 'Kumasi',
        contactPhone: '+233241234567',
        logo: PNG_LOGO,
      },
    });
    const tenant = store['tenants-1']['tenant-a'];
    assert.equal(tenant.name, 'Asante Events');
    assert.equal(tenant.contactPhone, '+233241234567');
    assert.equal(tenant.logo, PNG_LOGO);
    assert.equal(tenant.status, 'approved');
    assert.equal(tenant.superOrganizerId, 'so-a');
  }),
);

test(
  'only the caller’s own tenant row is written',
  withEnv(async () => {
    const before = structuredClone(seedStore()['tenants-1']['tenant-b']);
    const { result, store, calls } = await run({ body: update(), as: 'so-a' });

    assert.equal(result.status, 200);
    assert.deepEqual(
      tenantUpdates(calls).map(([args]) => args.rowId),
      ['tenant-a'],
    );
    assert.deepEqual(store['tenants-1']['tenant-b'], before);
  }),
);

test(
  'naming another tenant is refused before anything is written',
  withEnv(async () => {
    const { result, calls } = await run({ body: update({ tenantId: 'tenant-b' }), as: 'so-a' });

    assert.equal(result.status, 400);
    assert.equal(calls.updateRow, undefined);
  }),
);

test(
  'a co-Organizer is refused (403) and the row is untouched',
  withEnv(async () => {
    const { result, calls } = await run({ body: update(), as: 'org-a' });

    assert.equal(result.status, 403);
    assert.equal(calls.updateRow, undefined);
  }),
);

test(
  'an Operator is refused (403) before any lookup',
  withEnv(async () => {
    const { result, calls } = await run({ body: update(), as: 'op-a' });

    assert.equal(result.status, 403);
    assert.equal(calls.listRows, undefined);
    assert.equal(calls.updateRow, undefined);
  }),
);

test(
  'a member of a tenant that is not approved is refused (403)',
  withEnv(async () => {
    const { result, calls } = await run({ body: update(), as: 'so-p' });

    assert.equal(result.status, 403);
    assert.equal(calls.updateRow, undefined);
  }),
);

test(
  'Admin is refused (403) — the profile belongs to the company',
  withEnv(async () => {
    const { result, calls } = await run({ body: update(), as: 'admin-1' });

    assert.equal(result.status, 403);
    assert.equal(calls.updateRow, undefined);
  }),
);

test(
  'invalid name, location, phone or logo is refused (400) with nothing written',
  withEnv(async () => {
    const invalidPayloads = {
      'empty name': { name: '   ' },
      'missing location': { location: undefined },
      'too-long name': { name: 'x'.repeat(129) },
      'too-long location': { location: 'x'.repeat(129) },
      'bad phone': { contactPhone: '0241234567' },
      'non-image logo': { logo: 'data:text/html;base64,PGgxPg==' },
      'svg logo': { logo: 'data:image/svg+xml;base64,PHN2Zz4=' },
      'remote logo URL': { logo: 'https://example.com/logo.png' },
      'oversize logo': { logo: `data:image/png;base64,${'A'.repeat(200000)}` },
      'non-string logo': { logo: 42 },
    };
    for (const [label, extra] of Object.entries(invalidPayloads)) {
      const { result, calls } = await run({ body: update(extra), as: 'so-a' });
      assert.equal(result.status, 400, label);
      assert.equal(calls.updateRow, undefined, label);
    }
  }),
);

test(
  'server-owned trust fields are refused (400)',
  withEnv(async () => {
    for (const field of ['status', 'superOrganizerId', 'verifiedBy', 'verifiedAt', 'role']) {
      const { result, calls } = await run({ body: update({ [field]: 'x' }), as: 'so-a' });
      assert.equal(result.status, 400, field);
      assert.match(result.body.error, new RegExp(field), field);
      assert.equal(calls.updateRow, undefined, field);
    }
  }),
);

test(
  'other intake fields are ignored, never written',
  withEnv(async () => {
    const { result, calls } = await run({
      body: update({ size: '201+', estimatedUserCount: 5, verificationDocumentId: 'f1' }),
      as: 'so-a',
    });

    assert.equal(result.status, 200);
    const [[args]] = tenantUpdates(calls);
    assert.deepEqual(Object.keys(args.data).sort(), ['contactPhone', 'location', 'logo', 'name']);
  }),
);

test(
  'logo null removes the logo; an omitted logo leaves it as it was',
  withEnv(async () => {
    const store = seedStore();
    store['tenants-1']['tenant-a'].logo = PNG_LOGO;

    const kept = await run({ body: update({ logo: undefined }), as: 'so-a', store });
    assert.equal(kept.result.status, 200);
    assert.equal(store['tenants-1']['tenant-a'].logo, PNG_LOGO);

    const removed = await run({ body: update({ logo: null }), as: 'so-a', store });
    assert.equal(removed.result.status, 200);
    assert.equal(store['tenants-1']['tenant-a'].logo, null);
    assert.equal(removed.result.body.tenant.logo, null);
  }),
);

test(
  'an omitted contact phone clears it',
  withEnv(async () => {
    const { result, store } = await run({ body: update({ contactPhone: '' }), as: 'so-a' });

    assert.equal(result.status, 200);
    assert.equal(store['tenants-1']['tenant-a'].contactPhone, null);
  }),
);

test(
  'the success log omits the logo data URL',
  withEnv(async () => {
    const { result, logs } = await run({ body: update(), as: 'so-a' });

    assert.equal(result.status, 200);
    assert.equal(logs.length, 1);
    assert.ok(!logs[0].includes('base64'), logs[0]);
    assert.match(logs[0], /"logo":"\[omitted\]"/);
  }),
);

test(
  'a failed write is reported as 502',
  withEnv(async () => {
    const { result } = await run({ body: update(), as: 'so-a', failOn: { updateRow: true } });

    assert.equal(result.status, 502);
  }),
);

// Every profile change is recorded in the company's own activity log (FR-15): only the fields
// that changed, never the logo image itself, and never visible to platform Admins (AD-12).

const auditRows = (store) => Object.values(store['audit-1']);

test(
  'a profile change is recorded against the tenant with only the changed fields',
  withEnv(async () => {
    const seed = seedStore();
    Object.assign(seed['tenants-1']['tenant-a'], { name: 'Old Name', location: 'Kumasi' });
    const { store } = await run({
      body: update({ name: 'Asante Events', contactPhone: '' }),
      as: 'so-a',
      store: seed,
    });

    const [entry] = auditRows(store);
    assert.equal(entry.entityType, 'tenant');
    assert.equal(entry.entityId, 'tenant-a');
    assert.equal(entry.action, 'edit');
    assert.equal(entry.performedBy, 'so-a');
    assert.equal(entry.tenantId, 'tenant-a');
    assert.deepEqual(JSON.parse(entry.previousValues), { name: 'Old Name', logo: 'none' });
    assert.deepEqual(JSON.parse(entry.newValues), {
      name: 'Asante Events',
      logo: 'set',
      tenantId: 'tenant-a',
    });
  }),
);

test(
  'the audit entry never holds the logo image and carries no Admin read',
  withEnv(async () => {
    const { store } = await run({ body: update(), as: 'so-a' });

    const [entry] = auditRows(store);
    assert.ok(!entry.newValues.includes('base64'));
    assert.deepEqual(entry.$permissions, []);
  }),
);

test(
  'replacing and removing a logo are told apart',
  withEnv(async () => {
    const seed = seedStore();
    seed['tenants-1']['tenant-a'].logo = PNG_LOGO;
    const replaced = await run({
      body: update({ logo: 'data:image/png;base64,QUJD' }),
      as: 'so-a',
      store: seed,
    });
    assert.equal(JSON.parse(auditRows(replaced.store)[0].newValues).logo, 'replaced');

    const removed = await run({ body: update({ logo: null }), as: 'so-a', store: seed });
    const removal = JSON.parse(auditRows(removed.store).at(-1).newValues);
    assert.equal(removal.logo, 'none');
  }),
);

test(
  'a save that changes nothing leaves no audit entry',
  withEnv(async () => {
    const seed = seedStore();
    Object.assign(seed['tenants-1']['tenant-a'], {
      name: 'Asante Events',
      location: 'Kumasi',
      contactPhone: '+233241234567',
      logo: PNG_LOGO,
    });
    const { result, store } = await run({ body: update(), as: 'so-a', store: seed });

    assert.equal(result.status, 200);
    assert.equal(auditRows(store).length, 0);
  }),
);

test(
  'a failed audit write never fails the profile save',
  withEnv(async () => {
    const { result, store, errors } = await run({
      body: update(),
      as: 'so-a',
      failOn: { createRow: true },
    });

    assert.equal(result.status, 200);
    assert.equal(store['tenants-1']['tenant-a'].location, 'Kumasi');
    assert.ok(errors.some((message) => message.includes('writeTenantAuditLog')));
  }),
);

test(
  'a refused change (co-Organizer) writes no audit entry',
  withEnv(async () => {
    const { store } = await run({ body: update(), as: 'org-a' });

    assert.equal(auditRows(store).length, 0);
  }),
);
