import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { decode, parsePage } from '../scripts/parse.mjs';

const fx = (n) => readFileSync(new URL(`./fixtures/${n}.html`, import.meta.url), 'utf8');

test('decode handles named, numeric and hex entities', () => {
  assert.equal(decode('1. FC K&ouml;ln'), '1. FC Köln');
  assert.equal(decode('Borussia M&#039;gladbach'), "Borussia M'gladbach");
  assert.equal(decode('Brighton &amp; Hove'), 'Brighton & Hove');
  assert.equal(decode('Fortuna D&#xFC;sseldorf'), 'Fortuna Düsseldorf');
  assert.equal(decode('  Plain  '), 'Plain');
});

test('Bundesliga fixture: first match and counts', () => {
  const ms = parsePage(fx('bundesliga'), 'bl1');
  assert.equal(ms.length, 27);
  assert.deepEqual(
    { ...ms[0], tv: undefined },
    { id: '194003', competition: 'bl1', round: '05. Spieltag', kickoff: '2026-10-09T18:30:00.000Z',
      home: 'Borussia Dortmund', away: 'SV Werder Bremen', tv: undefined });
  assert.ok(ms[0].tv.includes('Sky Sport Bundesliga'));
  assert.ok(ms.some((m) => m.tv.includes('DAZN')), 'DAZN listed for matches must be kept');
});

test('2. Bundesliga fixture: conference + feed channels', () => {
  const ms = parsePage(fx('2-bundesliga'), 'bl2');
  assert.equal(ms.length, 42);
  assert.equal(ms[0].home, 'Eintracht Braunschweig');
  assert.equal(ms[0].kickoff, '2026-10-09T16:30:00.000Z');
  assert.ok(ms[0].tv.includes('Sky Sport Bundesliga'));
  assert.ok(ms[0].tv.includes('Sky Konferenz'));
});

test('Champions League fixture: DAZN, Prime and Austrian Sky kept, Swiss dropped', () => {
  const ms = parsePage(fx('uefa-champions-league'), 'ucl');
  assert.equal(ms.length, 127);
  assert.equal(ms[0].home, 'Sabah FK');
  assert.equal(ms[0].kickoff, '2026-10-13T16:45:00.000Z');
  const all = new Set(ms.flatMap((m) => m.tv));
  assert.ok(all.has('DAZN'));
  assert.ok(all.has('Prime Video'));
  assert.ok(all.has('Sky Sport Austria'));
  for (const bad of ['blue Sport', 'Sky Sport Austria 1', 'Sky Sport Austria 1 HD']) assert.ok(!all.has(bad));
});

test('Nations League fixture', () => {
  const ms = parsePage(fx('nations-league'), 'nl');
  assert.equal(ms.length, 78);
  assert.equal(ms[0].away, 'Litauen');
  assert.equal(ms[0].kickoff, '2026-10-04T13:00:00.000Z');
  assert.ok(ms.some((m) => m.tv.includes('RTL')));
  assert.ok(ms.some((m) => m.tv.includes('ARD')));
  assert.ok(ms.some((m) => m.tv.includes('ORF')));
});

test('every parsed match is well-formed in every fixture', () => {
  for (const [n, c] of [['bundesliga', 'bl1'], ['2-bundesliga', 'bl2'], ['uefa-champions-league', 'ucl'], ['nations-league', 'nl']]) {
    for (const m of parsePage(fx(n), c)) {
      assert.match(m.id, /^\d+$/);
      assert.ok(m.home && m.away && !m.home.includes('&'), `${n} ${m.id} teams decoded`);
      assert.ok(!Number.isNaN(Date.parse(m.kickoff)));
      assert.ok(Array.isArray(m.tv));
    }
  }
});

test('a game without channels yields tv: []', () => {
  const html = `<div id="date-20261009"></div><div id="item-game-1" class="row item game">
    <div class="meta-time">20:30</div><div class="meta-phase">05. Spieltag</div>
    <div id="match-77" class="row match"></div>
    <div class="team-home"><a href="/t" title="x">A &amp; B</a></div><div class="team-guest"><a href="/t" title="x">C</a></div>
    <div class="coverage-list"><ul><li><a class="badge" href="/m">x</a></li></ul></div></div>`;
  const [m] = parsePage(html, 'bl1');
  assert.deepEqual(m.tv, []);
  assert.equal(m.home, 'A & B');
});

test('markup change (no games) throws instead of returning an empty list', () => {
  assert.throws(() => parsePage('<html><body>Wartung</body></html>', 'bl1'), /no matches/i);
});

test('a game missing its kickoff time throws', () => {
  const html = `<div id="date-20261009"></div><div id="item-game-1"><div id="match-77"></div>
    <div class="team-home"><a>A</a></div><div class="team-guest"><a>B</a></div></div>`;
  assert.throws(() => parsePage(html, 'bl1'), /time/i);
});
