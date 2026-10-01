import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  candidateDateRange,
  findDuplicateMatchFields,
  identifyingWords,
} from '../src/duplicate-events/duplicate-matching.js';
import { duplicatePairKey } from '../src/duplicate-events/flag-store.js';
import { event } from './helpers/duplicate-events-fixtures.js';

const NEW_EVENT = event('new', { tenantId: 'tenant-a' });

test('titles and occasion words are ignored, so the same person reads the same', () => {
  assert.deepEqual(
    identifyingWords('  Funeral of the LATE   Mr. Kwame Mensah '),
    new Set(['kwame', 'mensah']),
  );
  assert.deepEqual(identifyingWords('Kwame Mensah — Burial Service'), new Set(['kwame', 'mensah']));
  assert.deepEqual(identifyingWords('Ｋｗａｍｅ'), new Set(['kwame']));
  assert.deepEqual(identifyingWords(null), new Set());
});

test('another tenant registering the same person within the window is a duplicate', () => {
  const candidate = event('other', {
    tenantId: 'tenant-b',
    name: 'Kwame Mensah Burial Service',
    hostName: 'Mensah family',
    date: '2026-11-12T00:00:00.000+00:00',
  });

  assert.deepEqual(findDuplicateMatchFields(NEW_EVENT, candidate), ['name', 'hostName']);
});

test('a fuller name containing the same two names still matches', () => {
  const candidate = event('other', {
    tenantId: 'tenant-b',
    name: 'Celebration of Life: Kwame Kofi Mensah',
    hostName: 'Akua Boateng',
  });

  assert.deepEqual(findDuplicateMatchFields(NEW_EVENT, candidate), ['name']);
});

test('one shared surname alone is not enough unless it is all either side says', () => {
  const surnameOnly = event('other', { tenantId: 'tenant-b', name: 'Ama Mensah Funeral' });
  const sameSingleName = event('again', {
    tenantId: 'tenant-b',
    name: 'Mensah Funeral',
    hostName: 'Owusu',
  });

  assert.deepEqual(findDuplicateMatchFields(NEW_EVENT, surnameOnly), ['hostName']);
  assert.deepEqual(findDuplicateMatchFields(event('n', { name: 'Mensah' }), sameSingleName), [
    'name',
  ]);
});

test('a generic host name with nothing identifying never matches', () => {
  const vague = { name: 'Ama Owusu', hostName: 'The Family' };

  assert.deepEqual(
    findDuplicateMatchFields(event('n', vague), event('o', { ...vague, tenantId: 'tenant-b' })),
    ['name'],
  );
});

test('same tenant, different type or dates beyond the window are never compared', () => {
  const twin = { name: NEW_EVENT.name, hostName: NEW_EVENT.hostName };

  assert.deepEqual(findDuplicateMatchFields(NEW_EVENT, event('same-tenant', twin)), []);
  assert.deepEqual(
    findDuplicateMatchFields(NEW_EVENT, event('w', { ...twin, tenantId: 'b', type: 'wedding' })),
    [],
  );
  assert.deepEqual(
    findDuplicateMatchFields(
      NEW_EVENT,
      event('late', { ...twin, tenantId: 'b', date: '2026-11-15T00:00:00.000+00:00' }),
    ),
    [],
  );
  assert.deepEqual(findDuplicateMatchFields(NEW_EVENT, NEW_EVENT), []);
});

test('an Admin-created Event (no tenantId) is a different owner from every tenant', () => {
  const adminEvent = event('admin', { tenantId: undefined });

  assert.deepEqual(findDuplicateMatchFields(NEW_EVENT, adminEvent), ['name', 'hostName']);
});

test('the candidate window is seven days either side, inclusive', () => {
  assert.deepEqual(candidateDateRange('2026-11-07T00:00:00.000+00:00'), {
    from: '2026-10-31T00:00:00.000Z',
    to: '2026-11-14T00:00:00.000Z',
  });
});

test('the pair key is the same whichever Event comes first', () => {
  assert.equal(duplicatePairKey('b-event', 'a-event'), 'a-event:b-event');
  assert.equal(duplicatePairKey('a-event', 'b-event'), 'a-event:b-event');
});
