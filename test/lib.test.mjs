import test from 'node:test';
import assert from 'node:assert/strict';
import { berlinDay, berlinTime, dayHeading, groupByDay, displayTime, matchStatus, channelKind, COMPETITIONS } from '../site/lib.mjs';

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

test('groupByDay drops past days and ended matches, keeps live/upcoming, sorts, filters, labels', () => {
  const ms = [
    m('past', 'bl1', '2026-10-03T16:30:00Z'),
    m('ended', 'bl1', '2026-10-04T08:00:00Z'),
    m('live', 'bl1', '2026-10-04T10:30:00Z'),
    m('b', 'ucl', '2026-10-13T16:45:00Z'),
    m('a', 'bl2', '2026-10-09T16:30:00Z'),
    m('tmrw', 'nl', '2026-10-05T16:30:00Z'),
  ];
  const now = '2026-10-04T12:00:00Z';
  const all = groupByDay(ms, { now, filter: 'all' });
  assert.deepEqual(all.map((d) => d.day), ['2026-10-04', '2026-10-05', '2026-10-09', '2026-10-13']);
  assert.deepEqual(all[0].matches.map((x) => x.id), ['live']);
  assert.deepEqual(all.map((d) => d.label), ['Heute', 'Morgen', '', '']);
  const ucl = groupByDay(ms, { now, filter: 'ucl' });
  assert.deepEqual(ucl.flatMap((d) => d.matches.map((x) => x.id)), ['b']);
  assert.deepEqual(groupByDay([], { now, filter: 'all' }), []);
});

test('"Morgen" is computed on the calendar, also across the clock change', () => {
  // 2026-10-25 00:30 Berlin (CEST) is still the 25th; tomorrow is the 26th even though that day has 25 hours.
  const g = groupByDay([m('x', 'bl1', '2026-10-25T14:30:00Z'), m('y', 'bl1', '2026-10-26T14:30:00Z')],
    { now: '2026-10-24T22:30:00Z', filter: 'all' });
  assert.deepEqual(g.map((d) => [d.day, d.label]), [['2026-10-25', 'Heute'], ['2026-10-26', 'Morgen']]);
});

test('matchStatus: tbd / upcoming / live / ended', () => {
  const k = m('k', 'bl1', '2026-10-24T16:30:00Z');
  assert.equal(matchStatus(k, new Date('2026-10-24T16:00:00Z')), 'upcoming');
  assert.equal(matchStatus(k, new Date('2026-10-24T16:30:00Z')), 'live');
  assert.equal(matchStatus(k, new Date('2026-10-24T18:44:00Z')), 'live');
  assert.equal(matchStatus(k, new Date('2026-10-24T18:46:00Z')), 'ended');
  assert.equal(matchStatus({ ...k, timeTbd: true }, new Date('2030-01-01T00:00:00Z')), 'tbd');
});

test('channelKind groups channels for colouring', () => {
  assert.equal(channelKind('Sky Sport Bundesliga 3'), 'sky');
  assert.equal(channelKind('Sky Sport Top Event'), 'sky');
  assert.equal(channelKind('WOW'), 'sky');
  assert.equal(channelKind('DAZN'), 'dazn');
  assert.equal(channelKind('Prime Video'), 'prime');
  for (const f of ['ARD', 'ZDF', 'ORF', 'RTL', 'Sat.1', 'NITRO', 'ServusTV']) assert.equal(channelKind(f), 'free', f);
  assert.equal(channelKind('MagentaSport'), 'other');
});

test('competition list is complete', () => {
  assert.deepEqual(COMPETITIONS.map((c) => c.key), ['bl1', 'bl2', 'ucl', 'nl']);
});

test('matches with an unknown kickoff time show a placeholder', () => {
  const tbd = { ...m('f', 'ucl', '2027-07-04T22:00:00Z'), timeTbd: true };
  assert.equal(displayTime(tbd), '–:–');
  assert.equal(displayTime(m('a', 'bl1', '2026-10-24T16:30:00Z')), '18:30');
});
