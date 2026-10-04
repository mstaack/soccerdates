import test from 'node:test';
import assert from 'node:assert/strict';
import { berlinDay, berlinTime, dayHeading, groupByDay, displayTime, hasStarted, COMPETITIONS } from '../site/lib.mjs';

const m = (id, competition, kickoff) => ({ id, competition, round: '', kickoff, home: 'H', away: 'A', tv: [] });

test('Berlin formatting', () => {
  assert.equal(berlinTime('2026-10-24T16:30:00Z'), '18:30');
  assert.equal(berlinTime('2026-10-25T14:30:00Z'), '15:30');
  assert.equal(dayHeading('2026-10-24T16:30:00Z'), 'Samstag, 24.10.');
});

test('a kickoff after midnight Berlin time sits under the next Berlin day', () => {
  assert.equal(berlinDay('2026-10-24T22:30:00Z'), '2026-10-25');
  const g = groupByDay([m('1', 'nl', '2026-10-24T22:30:00Z')], { now: '2026-10-24T10:00:00Z', filter: 'all' });
  assert.deepEqual(g.map((x) => x.day), ['2026-10-25']);
});

test('groupByDay drops past days, keeps today, sorts, and filters', () => {
  const ms = [
    m('past', 'bl1', '2026-10-03T16:30:00Z'),
    m('today', 'bl1', '2026-10-04T08:00:00Z'),
    m('b', 'ucl', '2026-10-13T16:45:00Z'),
    m('a', 'bl2', '2026-10-09T16:30:00Z'),
  ];
  const all = groupByDay(ms, { now: '2026-10-04T12:00:00Z', filter: 'all' });
  assert.deepEqual(all.map((d) => d.day), ['2026-10-04', '2026-10-09', '2026-10-13']);
  const ucl = groupByDay(ms, { now: '2026-10-04T12:00:00Z', filter: 'ucl' });
  assert.deepEqual(ucl.flatMap((d) => d.matches.map((x) => x.id)), ['b']);
  assert.deepEqual(groupByDay([], { now: '2026-10-04T12:00:00Z', filter: 'all' }), []);
});

test('competition list is complete', () => {
  assert.deepEqual(COMPETITIONS.map((c) => c.key), ['bl1', 'bl2', 'ucl', 'nl']);
});

test('matches with an unknown kickoff time show a placeholder and never count as started', () => {
  const tbd = { ...m('f', 'ucl', '2027-07-04T22:00:00Z'), timeTbd: true };
  assert.equal(displayTime(tbd), '–:–');
  assert.equal(displayTime(m('a', 'bl1', '2026-10-24T16:30:00Z')), '18:30');
  assert.equal(hasStarted(tbd, new Date('2027-07-05T10:00:00Z')), false);
  assert.equal(hasStarted(m('a', 'bl1', '2026-10-24T16:30:00Z'), new Date('2026-10-24T17:00:00Z')), true);
  assert.equal(hasStarted(m('a', 'bl1', '2026-10-24T16:30:00Z'), new Date('2026-10-24T16:00:00Z')), false);
});
