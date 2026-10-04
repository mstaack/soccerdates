import test from 'node:test';
import assert from 'node:assert/strict';
import { berlinToUtcIso } from '../scripts/time.mjs';

test('summer time (CEST, UTC+2)', () => {
  assert.equal(berlinToUtcIso('20261009', '20:30'), '2026-10-09T18:30:00.000Z');
  assert.equal(berlinToUtcIso('20261024', '18:30'), '2026-10-24T16:30:00.000Z');
});

test('winter time (CET, UTC+1) after the 2026-10-25 clock change', () => {
  assert.equal(berlinToUtcIso('20261025', '15:30'), '2026-10-25T14:30:00.000Z');
  assert.equal(berlinToUtcIso('20261113', '20:45'), '2026-11-13T19:45:00.000Z');
});

test('night of the change: 00:30 is still CEST, 03:00 is CET', () => {
  assert.equal(berlinToUtcIso('20261025', '00:30'), '2026-10-24T22:30:00.000Z');
  assert.equal(berlinToUtcIso('20261025', '03:00'), '2026-10-25T02:00:00.000Z');
});
