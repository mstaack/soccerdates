import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SOURCES } from '../scripts/sources.mjs';
import { mergeMatches, buildData, sameMatches } from '../scripts/update.mjs';

const fx = (n) => readFileSync(new URL(`./fixtures/${n}.html`, import.meta.url), 'utf8');
const byUrl = Object.fromEntries(Object.entries(SOURCES).map(([k, u]) =>
  [u, fx({ bl1: 'bundesliga', bl2: '2-bundesliga', ucl: 'uefa-champions-league', nl: 'nations-league' }[k])]));
const NOW = '2026-10-04T05:00:00.000Z';
const m = (id, competition, kickoff) => ({ id, competition, round: '', kickoff, home: 'H', away: 'A', tv: [] });

test('mergeMatches replaces fresh competitions, keeps previous for null, sorts', () => {
  const prev = [m('1', 'bl1', '2026-10-10T10:00:00Z'), m('2', 'ucl', '2026-10-09T10:00:00Z')];
  const out = mergeMatches(prev, { bl1: [m('3', 'bl1', '2026-10-11T10:00:00Z')], ucl: null, bl2: [], nl: [] });
  assert.deepEqual(out.map((x) => x.id), ['2', '3']);
});

test('buildData happy path covers all four competitions', async () => {
  const { data, failed } = await buildData({ fetchHtml: async (u) => byUrl[u], previous: [], now: NOW, log: () => {} });
  assert.deepEqual(failed, []);
  assert.equal(data.generatedAt, NOW);
  assert.equal(data.matches.length, 27 + 42 + 127 + 78);
  assert.deepEqual(data.matches.map((x) => x.kickoff), [...data.matches.map((x) => x.kickoff)].sort());
});

test('one broken page keeps that competition\'s previous data', async () => {
  const previous = [m('old-ucl', 'ucl', '2026-10-13T16:45:00Z')];
  const fetchHtml = async (u) => (u === SOURCES.ucl ? '<html>Wartung</html>' : byUrl[u]);
  const { data, failed } = await buildData({ fetchHtml, previous, now: NOW, log: () => {} });
  assert.deepEqual(failed, ['ucl']);
  assert.deepEqual(data.matches.filter((x) => x.competition === 'ucl').map((x) => x.id), ['old-ucl']);
  assert.equal(data.matches.filter((x) => x.competition === 'bl1').length, 27);
});

test('HTTP error on one page is tolerated', async () => {
  const fetchHtml = async (u) => { if (u === SOURCES.nl) throw new Error('HTTP 503'); return byUrl[u]; };
  const { failed } = await buildData({ fetchHtml, previous: [], now: NOW, log: () => {} });
  assert.deepEqual(failed, ['nl']);
});

test('all pages failing throws (so the Action fails and nothing is published)', async () => {
  await assert.rejects(
    buildData({ fetchHtml: async () => { throw new Error('HTTP 403'); }, previous: [m('1', 'bl1', '2026-10-10T10:00:00Z')], now: NOW, log: () => {} }),
    /all sources failed/i);
});

test('sameMatches ignores generatedAt and detects changes', () => {
  assert.equal(sameMatches([m('1', 'bl1', 'x')], [m('1', 'bl1', 'x')]), true);
  assert.equal(sameMatches([m('1', 'bl1', 'x')], [{ ...m('1', 'bl1', 'x'), tv: ['DAZN'] }]), false);
});

test('buildData reports unknown channel names', async () => {
  const { unknown } = await buildData({ fetchHtml: async (u) => byUrl[u], previous: [], now: NOW, log: () => {} });
  assert.ok(Array.isArray(unknown));
  const html = `<div id="date-20261009"></div><div id="item-game-1"><span class="meta-time">20:30</span>
    <div id="match-1"></div><div class="team-home"><a href="#">A</a></div><div class="team-guest"><a href="#">B</a></div>
    <ul><li><i class="fg-icon-free"></i><a href="#" title="zum Sender">ProSieben</a></li></ul></div>`;
  const logs = [];
  const res = await buildData({ fetchHtml: async () => html, previous: [], now: NOW, log: (s) => logs.push(s) });
  assert.deepEqual(res.unknown, ['ProSieben']);
  assert.ok(logs.includes('unknown channels: ProSieben'));
});
