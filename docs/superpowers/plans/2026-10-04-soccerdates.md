# soccerdates Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A daily GitHub Action scrapes fussballgucken.info for 1. Bundesliga, 2. Bundesliga, Champions League and Nations League fixtures with German TV channels, and publishes a mobile-friendly static page on GitHub Pages.

**Architecture:** Zero-dependency Node 20 scripts fetch 4 pages, parse them with pure functions (tested against saved HTML fixtures), normalize channels to German brands, and write `site/data/matches.json`. A static HTML/CSS/ES-module page renders that JSON. One workflow runs tests, updates data, commits it, and deploys `site/` to Pages.

**Tech Stack:** Node 20 (ESM, `node:test`, global `fetch`, `Intl`), plain HTML/CSS/JS, GitHub Actions + GitHub Pages.

**Spec:** `docs/superpowers/specs/2026-10-04-soccerdates-design.md`

## Global Constraints

- Single data source: `https://fussballgucken.info/wettbewerb/{bundesliga,2-bundesliga,uefa-champions-league,nations-league}` — 4 requests per run, sequential, descriptive User-Agent.
- No runtime dependencies, no build step, no framework. Node 20 (`engines`), tests via `node --test`.
- German and Austrian channels only: keep German- and Austria-market channels (incl. Sky Sport Austria, ORF, ServusTV); drop Swiss/French/Italian/other-country channels and radio. **DAZN and Prime Video must always be kept when listed** (user requirement).
- Merge channel variants: strip `HD`/`UHD`, `(App)`/`(Amazon)`/… suffixes and numbered feeds (`Sky Sport Austria 3 HD` → `Sky Sport Austria`). Conference feeds on German Sky show as `Sky Konferenz`.
- Kickoff times on the source are Europe/Berlin; store as UTC ISO strings; display in Europe/Berlin.
- Competition keys: `bl1`, `bl2`, `ucl`, `nl`.
- Fixtures only (no scores). Past days are not shown. Empty channel list shows "TV: noch offen".
- Failure policy: a failing/empty page keeps that competition's previous data and warns; the run fails only if all four pages fail or output would be empty. Zero parsed games is a failure (loud, not silent).
- Output `site/data/matches.json` shape: `{ "generatedAt": ISO, "matches": [{id, competition, round, kickoff, home, away, tv: string[]}] }`, sorted by kickoff then id; rewritten only if `matches` changed.
- Deploy: Pages source = GitHub Actions; cron `0 5 * * *` UTC + `workflow_dispatch` + push to `main`.
- Commit messages: no attribution lines.

## Review Focus

- Team names containing HTML entities/umlauts/apostrophes/ampersands (e.g. `1. FC K&ouml;ln`, `Borussia M&#039;gladbach`) must display decoded — pinned in Task 3.
- A match with no channels listed (or only dropped ones) must yield `tv: []` and render "TV: noch offen" — pinned in Tasks 2 and 5.
- Markup change / empty or error page must not wipe good data or silently publish garbage — pinned in Tasks 3 and 4.
- Clock change on 2026-10-25 (CEST→CET) must not shift kickoff times by an hour — pinned in Task 1.
- A kickoff just after midnight Berlin time (22:30Z) must sit under the next Berlin day, not the UTC day — pinned in Task 5.

---

## File Structure

```
package.json
.gitignore
README.md
scripts/time.mjs        berlinToUtcIso(yyyymmdd, hhmm)
scripts/channels.mjs    classify(entry), normalizeChannels(entries)
scripts/parse.mjs       decode(s), parsePage(html, competition)
scripts/sources.mjs     SOURCES (competition key -> url)
scripts/update.mjs      mergeMatches(), buildData() — orchestration, pure/injectable
scripts/fetch.mjs       CLI: real fetch, read/write site/data/matches.json
site/lib.mjs            COMPETITIONS, berlinDay/berlinTime/dayHeading, groupByDay (pure)
site/app.js             DOM rendering, filter chips, localStorage
site/index.html, site/style.css
site/data/matches.json  generated
test/*.test.mjs, test/fixtures/*.html (already saved: bundesliga, 2-bundesliga, uefa-champions-league, nations-league)
.github/workflows/update.yml
```

---

### Task 1: Project scaffold and Berlin→UTC conversion

**Files:**
- Create: `package.json`, `.gitignore`, `scripts/time.mjs`
- Test: `test/time.test.mjs`

**Interfaces:**
- Produces: `berlinToUtcIso(yyyymmdd: string, hhmm: string): string` — e.g. `('20261024','18:30') -> '2026-10-24T16:30:00.000Z'`.

- [ ] **Step 1: Create `package.json` and `.gitignore`**

```json
{
  "name": "soccerdates",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "engines": { "node": ">=20" },
  "scripts": {
    "test": "node --test test/",
    "update": "node scripts/fetch.mjs"
  }
}
```

`.gitignore`:
```
node_modules/
.DS_Store
```

- [ ] **Step 2: Write the failing test** — `test/time.test.mjs`

```js
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
```

- [ ] **Step 3: Run test, verify it fails**

Run: `npm test`
Expected: FAIL — cannot find module `../scripts/time.mjs`.

- [ ] **Step 4: Implement** — `scripts/time.mjs`

```js
const fmt = new Intl.DateTimeFormat('en-US', {
  timeZone: 'Europe/Berlin',
  hourCycle: 'h23',
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit',
});

// Offset (ms) of Europe/Berlin from UTC at the given instant.
function offsetMs(utcMs) {
  const p = Object.fromEntries(fmt.formatToParts(new Date(utcMs)).map((x) => [x.type, x.value]));
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  return asUtc - utcMs;
}

// Interpret a Berlin wall-clock date/time ('YYYYMMDD', 'HH:MM') as a UTC ISO string.
export function berlinToUtcIso(yyyymmdd, hhmm) {
  const y = +yyyymmdd.slice(0, 4), mo = +yyyymmdd.slice(4, 6), d = +yyyymmdd.slice(6, 8);
  const [h, mi] = hhmm.split(':').map(Number);
  const naive = Date.UTC(y, mo - 1, d, h, mi);
  let utc = naive - offsetMs(naive);
  utc = naive - offsetMs(utc); // second pass settles instants near a clock change
  return new Date(utc).toISOString();
}
```

- [ ] **Step 5: Run test, verify it passes**

Run: `npm test`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add package.json .gitignore scripts/time.mjs test/time.test.mjs test/fixtures
git commit -m "feat: project scaffold and Berlin to UTC conversion"
```

---

### Task 2: Channel classification and normalization

**Files:**
- Create: `scripts/channels.mjs`
- Test: `test/channels.test.mjs`

**Interfaces:**
- Consumes: entries `{ name: string, icons: string[] }` where `icons` are the source's icon names (`tv`, `hdtv`, `free`, `internet`, `mobile`, `settop`, `radio`, `conference`).
- Produces:
  - `classify(entry): string | null` — German/Austrian brand label or `null` (dropped).
  - `normalizeChannels(entries): string[]` — unique labels, ordered free-TV, Sky, DAZN, Prime, other.

- [ ] **Step 1: Write the failing test** — `test/channels.test.mjs`

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { classify, normalizeChannels } from '../scripts/channels.mjs';

const e = (name, ...icons) => ({ name, icons });

test('variants merge into one brand', () => {
  assert.equal(classify(e('Sky Sport Bundesliga 3 HD', 'hdtv')), 'Sky Sport Bundesliga');
  assert.equal(classify(e('Sky Sport Bundesliga UHD', 'hdtv')), 'Sky Sport Bundesliga');
  assert.equal(classify(e('DAZN (App)', 'mobile')), 'DAZN');
  assert.equal(classify(e('DAZN (Apple TV)', 'settop')), 'DAZN');
  assert.equal(classify(e('DAZN 2 HD', 'hdtv')), 'DAZN');
  assert.equal(classify(e('RTL+', 'internet')), 'RTL');
  assert.equal(classify(e('Das Erste HD', 'free', 'hdtv')), 'ARD');
  assert.equal(classify(e('DAZN (Austria)', 'internet')), 'DAZN');
});

test('Austrian channels are kept and merged', () => {
  assert.equal(classify(e('Sky Sport Austria 1', 'conference', 'tv')), 'Sky Sport Austria');
  assert.equal(classify(e('Sky Sport Austria 3 HD', 'hdtv')), 'Sky Sport Austria');
  assert.equal(classify(e('Sky X (Austria)', 'internet')), 'Sky X');
  assert.equal(classify(e('ORF 1', 'free', 'tv')), 'ORF');
  assert.equal(classify(e('ORF 1 HD', 'free', 'hdtv')), 'ORF');
  assert.equal(classify(e('ORF ON', 'free', 'internet')), 'ORF');
});

test('DAZN and Prime Video are always kept', () => {
  assert.equal(classify(e('DAZN', 'internet')), 'DAZN');
  assert.equal(classify(e('Amazon Prime Video', 'internet')), 'Prime Video');
  assert.equal(classify(e('Amazon Prime Video (App)', 'mobile')), 'Prime Video');
});

test('channels outside Germany/Austria and radio are dropped', () => {
  for (const n of ['blue Sport', 'blue Sport HD', 'blue Sport (Livestream)', 'RSI LA 2', 'SRF zwei', 'RTS 2',
    'TF1', 'Rai 1', 'CANAL+', "L'Équipe Live Football", 'DAZN (Schweiz)', 'Sky (Schweiz)',
    'Swisscom blue TV App', 'Sky Go', 'Sky Showcase HD']) {
    assert.equal(classify(e(n, 'tv')), null, n);
  }
  assert.equal(classify(e('ARD Audiothek', 'free', 'radio')), null);
  assert.equal(classify(e('FC Bayern Webradio', 'free', 'radio')), null);
});

test('conference feeds on Sky become Sky Konferenz', () => {
  assert.equal(classify(e('Sky Sport Bundesliga 2', 'conference', 'tv')), 'Sky Konferenz');
  assert.equal(classify(e('Sky Sport Top Event', 'conference', 'tv')), 'Sky Konferenz');
  assert.equal(classify(e('Sky Sport Bundesliga 4', 'tv')), 'Sky Sport Bundesliga');
});

test('normalizeChannels: unique, ordered free-TV, Sky, DAZN, Prime', () => {
  const out = normalizeChannels([
    e('DAZN', 'internet'), e('DAZN (App)', 'mobile'),
    e('Sky Sport Bundesliga 4', 'tv'), e('Sky Sport Bundesliga 4 HD', 'hdtv'),
    e('Amazon Prime Video', 'internet'), e('NITRO', 'free', 'tv'), e('Sky Sport Austria 1', 'tv'),
    e('ORF 1', 'free', 'tv'), e('blue Sport', 'tv'),
  ]);
  assert.deepEqual(out, ['ORF', 'NITRO', 'Sky Sport Bundesliga', 'Sky Sport Austria', 'DAZN', 'Prime Video']);
});

test('no channels (or only dropped ones) gives an empty list', () => {
  assert.deepEqual(normalizeChannels([]), []);
  assert.deepEqual(normalizeChannels([e('blue Sport', 'tv'), e('ARD Audiothek', 'radio')]), []);
});
```

- [ ] **Step 2: Run, verify it fails**

Run: `npm test`
Expected: FAIL — cannot find module `../scripts/channels.mjs`.

- [ ] **Step 3: Implement** — `scripts/channels.mjs`

```js
// Markets other than Germany/Austria: dropped before any brand rule is applied.
const FOREIGN = /schweiz|\(ch\)|zattoo ch|\bblue\b|swisscom|\bRSI\b|\bRTS\b|\bSRF\b|\bTF1\b|\bRai\b|canal\+|mediaset|\bTV8\b|équipe|equipe/i;

// First match wins. Anything matching no rule is dropped (Sky Go, Sky Showcase, ...).
const RULES = [
  [/^Sky Sport Bundesliga/i, 'Sky Sport Bundesliga'],
  [/^Sky Sport Austria/i, 'Sky Sport Austria'],
  [/^Sky X\b/i, 'Sky X'],
  [/^Sky Sport Top Event/i, 'Sky Sport Top Event'],
  [/^Sky Sport( \d+)?( HD| UHD)?$/i, 'Sky Sport'],
  [/^WOW$/i, 'WOW'],
  [/^DAZN\b/i, 'DAZN'],
  [/^Amazon Prime Video/i, 'Prime Video'],
  [/^(Das Erste|ARD)\b/i, 'ARD'],
  [/^ZDF\b/i, 'ZDF'],
  [/^ORF\b/i, 'ORF'],
  [/^ServusTV\b/i, 'ServusTV'],
  [/^RTL\b/i, 'RTL'],
  [/^NITRO\b/i, 'NITRO'],
  [/^SAT\.?1\b/i, 'Sat.1'],
  [/^Sport1\b/i, 'Sport1'],
  [/^MagentaSport\b/i, 'MagentaSport'],
  [/^Joyn\b/i, 'Joyn'],
];

const ORDER = ['ARD', 'ZDF', 'ORF', 'ServusTV', 'RTL', 'Sat.1', 'NITRO', 'Sport1', 'Joyn',
  'Sky Sport Bundesliga', 'Sky Konferenz', 'Sky Sport Top Event', 'Sky Sport', 'Sky Sport Austria', 'Sky X', 'WOW',
  'DAZN', 'Prime Video', 'MagentaSport'];

export function classify({ name, icons }) {
  if (icons.includes('radio')) return null;
  if (FOREIGN.test(name)) return null;
  for (const [re, label] of RULES) {
    if (re.test(name)) {
      return icons.includes('conference') && label.startsWith('Sky Sport') && label !== 'Sky Sport Austria'
        ? 'Sky Konferenz' : label;
    }
  }
  return null;
}

export function normalizeChannels(entries) {
  const labels = new Set(entries.map(classify).filter(Boolean));
  return [...labels].sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b));
}
```

- [ ] **Step 4: Run, verify it passes**

Run: `npm test`
Expected: PASS (all channel tests plus Task 1).

- [ ] **Step 5: Commit**

```bash
git add scripts/channels.mjs test/channels.test.mjs
git commit -m "feat: German channel classification and normalization"
```

---

### Task 3: HTML parser

**Files:**
- Create: `scripts/parse.mjs`
- Test: `test/parse.test.mjs`

**Interfaces:**
- Consumes: `berlinToUtcIso` (Task 1), `normalizeChannels` (Task 2); fixtures in `test/fixtures/<slug>.html`.
- Produces:
  - `decode(s: string): string` — HTML entity decode + trim.
  - `parsePage(html: string, competition: string): Match[]` where `Match = {id: string, competition: string, round: string, kickoff: string (UTC ISO), home: string, away: string, tv: string[]}`. Throws `Error` if no games parse or a game lacks time/teams/id.

Source markup (verified): date header `id="date-YYYYMMDD"`; game `id="item-game-<n>"` containing `meta-time">HH:MM<`, `meta-phase …>NN. Spieltag<`, `id="match-<id>"`, `team-home"><a …>Name</a>`, `team-guest"><a …>Name</a>`, and channel `<li>`s each with `fg-icon-<type>` classes and `title="zum Sender">Name</a>`.

- [ ] **Step 1: Write the failing tests** — `test/parse.test.mjs`

```js
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
```

- [ ] **Step 2: Run, verify it fails**

Run: `npm test`
Expected: FAIL — cannot find module `../scripts/parse.mjs`.

- [ ] **Step 3: Implement** — `scripts/parse.mjs`

```js
import { berlinToUtcIso } from './time.mjs';
import { normalizeChannels } from './channels.mjs';

const ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  auml: 'ä', ouml: 'ö', uuml: 'ü', Auml: 'Ä', Ouml: 'Ö', Uuml: 'Ü', szlig: 'ß',
  eacute: 'é', Eacute: 'É', egrave: 'è', agrave: 'à', aacute: 'á', iacute: 'í', oacute: 'ó', uacute: 'ú',
  ccedil: 'ç', ntilde: 'ñ', scaron: 'š', Scaron: 'Š', ccaron: 'č', zcaron: 'ž', oslash: 'ø', aring: 'å',
};

export function decode(s) {
  return s
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
      if (e[0] === '#') {
        const code = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        return String.fromCodePoint(code);
      }
      return ENTITIES[e] ?? m;
    })
    .trim();
}

function required(block, re, what, id) {
  const m = block.match(re);
  if (!m) throw new Error(`game ${id}: missing ${what}`);
  return decode(m[1]);
}

const ICON_RE = /fg-icon-(conference|tv|hdtv|free|internet|mobile|settop|radio)\b/g;
const CHANNEL_RE = /<li>((?:(?!<\/li>)[\s\S])*?)title="zum Sender">([^<]+)<\/a>/g;

export function parsePage(html, competition) {
  const tokens = [...html.matchAll(/id="date-(\d{8})"|id="item-game-(\d+)"/g)];
  const matches = [];
  let date = null;
  tokens.forEach((t, i) => {
    if (t[1]) { date = t[1]; return; }
    const gameId = t[2];
    if (!date) throw new Error(`game ${gameId} appears before any date header`);
    const block = html.slice(t.index, i + 1 < tokens.length ? tokens[i + 1].index : html.length);

    const time = required(block, /meta-time">(\d{1,2}:\d{2})</, 'kickoff time', gameId);
    const id = required(block, /id="match-(\d+)"/, 'match id', gameId);
    const home = required(block, /team-home">\s*<a[^>]*>([^<]+)</, 'home team', gameId);
    const away = required(block, /team-guest">\s*<a[^>]*>([^<]+)</, 'away team', gameId);
    const round = block.match(/meta-phase[^>]*>([^<]*)</)?.[1] ?? '';

    const entries = [...block.matchAll(CHANNEL_RE)].map((m) => ({
      name: decode(m[2]),
      icons: [...m[1].matchAll(ICON_RE)].map((x) => x[1]),
    }));

    matches.push({
      id, competition, round: decode(round),
      kickoff: berlinToUtcIso(date, time.padStart(5, '0')),
      home, away, tv: normalizeChannels(entries),
    });
  });
  if (matches.length === 0) throw new Error(`no matches parsed for ${competition}`);
  return matches;
}
```

- [ ] **Step 4: Run, verify it passes**

Run: `npm test`
Expected: PASS. If a fixture count or first-match assertion fails, print `parsePage(fx(...))[0]` and fix the **parser** (the counts 27/42/127/78 and first matches were verified against the saved fixtures with an independent script). Note: DAZN is asserted via `ms.some(...)` because Friday games are Sky-only; the first 2. Bundesliga match lists Sky Sport Bundesliga 2/4 and Top Event (conference icon).

- [ ] **Step 5: Commit**

```bash
git add scripts/parse.mjs test/parse.test.mjs
git commit -m "feat: parse fussballgucken competition pages"
```

---

### Task 4: Update orchestration and CLI

**Files:**
- Create: `scripts/sources.mjs`, `scripts/update.mjs`, `scripts/fetch.mjs`
- Test: `test/update.test.mjs`
- Generated: `site/data/matches.json`

**Interfaces:**
- Consumes: `parsePage` (Task 3).
- Produces:
  - `SOURCES: Record<'bl1'|'bl2'|'ucl'|'nl', string>` (URLs).
  - `mergeMatches(previous: Match[], fresh: Record<string, Match[] | null>): Match[]` — fresh array replaces that competition; `null` keeps previous matches of that competition; result sorted by `kickoff` then `id`.
  - `buildData({ fetchHtml: (url) => Promise<string>, previous: Match[], now: string, log?: (msg) => void }): Promise<{ data: {generatedAt: string, matches: Match[]}, failed: string[] }>` — throws if all sources fail or merged result is empty.
  - `sameMatches(a: Match[], b: Match[]): boolean`.

- [ ] **Step 1: Write the failing tests** — `test/update.test.mjs`

```js
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
```

- [ ] **Step 2: Run, verify it fails**

Run: `npm test`
Expected: FAIL — cannot find module `../scripts/sources.mjs`.

- [ ] **Step 3: Implement** — `scripts/sources.mjs`

```js
const BASE = 'https://fussballgucken.info/wettbewerb';
export const SOURCES = {
  bl1: `${BASE}/bundesliga`,
  bl2: `${BASE}/2-bundesliga`,
  ucl: `${BASE}/uefa-champions-league`,
  nl: `${BASE}/nations-league`,
};
```

`scripts/update.mjs`:

```js
import { SOURCES } from './sources.mjs';
import { parsePage } from './parse.mjs';

export function mergeMatches(previous, fresh) {
  const out = [];
  for (const key of Object.keys(SOURCES)) {
    const next = fresh[key];
    out.push(...(next ?? previous.filter((m) => m.competition === key)));
  }
  return out.sort((a, b) => a.kickoff.localeCompare(b.kickoff) || a.id.localeCompare(b.id));
}

export function sameMatches(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

export async function buildData({ fetchHtml, previous, now, log = console.log, delayMs = 0 }) {
  const fresh = {};
  const failed = [];
  for (const [key, url] of Object.entries(SOURCES)) {
    try {
      fresh[key] = parsePage(await fetchHtml(url), key);
      log(`${key}: ${fresh[key].length} matches`);
    } catch (err) {
      fresh[key] = null;
      failed.push(key);
      log(`::warning::${key} failed (${err.message}); keeping previous data`);
    }
    if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
  }
  if (failed.length === Object.keys(SOURCES).length) throw new Error('all sources failed');
  const matches = mergeMatches(previous, fresh);
  if (matches.length === 0) throw new Error('merged result is empty');
  return { data: { generatedAt: now, matches }, failed };
}
```

`scripts/fetch.mjs`:

```js
import { readFile, writeFile, mkdir, appendFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { buildData, sameMatches } from './update.mjs';

const OUT = new URL('../site/data/matches.json', import.meta.url);
const UA = 'soccerdates/1.0 (+https://github.com/; daily fixture list, 4 requests/day)';

async function fetchHtml(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'de-DE,de;q=0.9' } });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.text();
}

async function readPrevious() {
  try { return JSON.parse(await readFile(OUT, 'utf8')).matches ?? []; } catch { return []; }
}

async function main() {
  const previous = await readPrevious();
  const { data, failed } = await buildData({ fetchHtml, previous, now: new Date().toISOString(), delayMs: 1000 });
  if (sameMatches(previous, data.matches)) {
    console.log('No changes in match data.');
  } else {
    await mkdir(new URL('./', OUT), { recursive: true });
    await writeFile(OUT, JSON.stringify(data, null, 1) + '\n');
    console.log(`Wrote ${data.matches.length} matches.`);
  }
  if (process.env.GITHUB_STEP_SUMMARY) {
    await appendFile(process.env.GITHUB_STEP_SUMMARY,
      `### soccerdates update\n- matches: ${data.matches.length}\n- failed sources: ${failed.join(', ') || 'none'}\n`);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => { console.error(err); process.exit(1); });
}
```

- [ ] **Step 4: Run tests, verify they pass**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Run the real fetch once (hits the live site: 4 requests)**

Run: `node scripts/fetch.mjs && node -e "const d=require('./site/data/matches.json');console.log(d.matches.length,d.matches[0])"`
Expected: `Wrote N matches.`, and a first match object with a non-empty `tv` array for Bundesliga games. If a page returns HTTP 403 from this machine, stop and report (the site blocks the client).

- [ ] **Step 6: Commit**

```bash
git add scripts site/data/matches.json test/update.test.mjs
git commit -m "feat: update orchestration, stale-data fallback and fetch CLI"
```

---

### Task 5: Static page

**Files:**
- Create: `site/lib.mjs`, `site/app.js`, `site/index.html`, `site/style.css`
- Test: `test/lib.test.mjs`

**Interfaces:**
- Consumes: `site/data/matches.json` (shape from Global Constraints).
- Produces (`site/lib.mjs`): `COMPETITIONS: {key, short, name}[]`; `berlinDay(iso): 'YYYY-MM-DD'`; `berlinTime(iso): 'HH:MM'`; `dayHeading(iso): 'Samstag, 24.10.'`; `groupByDay(matches, {now: string, filter: string}): {day, heading, matches}[]` (drops Berlin days before today; `filter` is a competition key or `'all'`).

- [ ] **Step 1: Write the failing test** — `test/lib.test.mjs`

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { berlinDay, berlinTime, dayHeading, groupByDay, COMPETITIONS } from '../site/lib.mjs';

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
```

- [ ] **Step 2: Run, verify it fails**

Run: `npm test`
Expected: FAIL — cannot find module `../site/lib.mjs`.

- [ ] **Step 3: Implement** — `site/lib.mjs`

```js
export const COMPETITIONS = [
  { key: 'bl1', short: 'BL1', name: '1. Bundesliga' },
  { key: 'bl2', short: 'BL2', name: '2. Bundesliga' },
  { key: 'ucl', short: 'CL', name: 'Champions League' },
  { key: 'nl', short: 'NL', name: 'Nations League' },
];

const TZ = 'Europe/Berlin';
const dayFmt = new Intl.DateTimeFormat('sv-SE', { timeZone: TZ }); // YYYY-MM-DD
const timeFmt = new Intl.DateTimeFormat('de-DE', { timeZone: TZ, hour: '2-digit', minute: '2-digit' });
const headFmt = new Intl.DateTimeFormat('de-DE', { timeZone: TZ, weekday: 'long', day: '2-digit', month: '2-digit' });

export const berlinDay = (iso) => dayFmt.format(new Date(iso));
export const berlinTime = (iso) => timeFmt.format(new Date(iso));
export const dayHeading = (iso) => headFmt.format(new Date(iso));

export function groupByDay(matches, { now, filter }) {
  const today = berlinDay(now);
  const days = new Map();
  for (const m of matches) {
    if (filter && filter !== 'all' && m.competition !== filter) continue;
    const day = berlinDay(m.kickoff);
    if (day < today) continue;
    if (!days.has(day)) days.set(day, { day, heading: dayHeading(m.kickoff), matches: [] });
    days.get(day).matches.push(m);
  }
  return [...days.values()].sort((a, b) => a.day.localeCompare(b.day));
}
```

- [ ] **Step 4: Run, verify it passes**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Create the page** — `site/index.html`

```html
<!doctype html>
<html lang="de">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light dark">
  <title>Fußball im TV</title>
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <header>
    <h1>Fußball im TV</h1>
    <p id="updated" class="muted"></p>
    <nav id="chips" aria-label="Wettbewerb filtern"></nav>
  </header>
  <main id="list" aria-live="polite"><p class="muted">Lade…</p></main>
  <footer class="muted">Quelle: fussballgucken.info · Zeiten in MEZ/MESZ</footer>
  <script type="module" src="app.js"></script>
</body>
</html>
```

`site/style.css`:

```css
:root {
  --bg: #f6f7f9; --card: #fff; --text: #14171a; --muted: #667085; --line: #e4e7ec;
  --accent: #0a7d3b; --chip: #e9ecf1; --tv: #e3f4ea; --tv-text: #0a5a2b;
}
@media (prefers-color-scheme: dark) {
  :root { --bg: #0e1116; --card: #181c23; --text: #eef0f3; --muted: #98a2b3; --line: #2a303a;
          --accent: #3ccf7a; --chip: #232934; --tv: #12301f; --tv-text: #7fe3ad; }
}
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--text);
  font: 16px/1.4 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
header, main, footer { max-width: 640px; margin: 0 auto; padding: 0 16px; }
header { padding-top: 16px; position: sticky; top: 0; background: var(--bg); z-index: 2; padding-bottom: 8px; }
h1 { margin: 0; font-size: 1.4rem; }
.muted { color: var(--muted); font-size: .85rem; margin: .2rem 0 0; }
#chips { display: flex; gap: 8px; overflow-x: auto; padding: 10px 0 2px; }
.chip { flex: none; border: 0; border-radius: 999px; padding: 8px 14px; font: inherit; font-size: .9rem;
  background: var(--chip); color: var(--text); cursor: pointer; }
.chip[aria-pressed="true"] { background: var(--accent); color: #fff; }
.day { margin: 18px 0 6px; font-size: .95rem; font-weight: 600; color: var(--muted);
  position: sticky; top: 104px; background: var(--bg); padding: 4px 0; }
.card { background: var(--card); border: 1px solid var(--line); border-radius: 12px;
  padding: 12px 14px; margin-bottom: 8px; display: grid; grid-template-columns: 54px 1fr; gap: 2px 12px; }
.card.started { opacity: .55; }
.time { font-weight: 700; font-variant-numeric: tabular-nums; grid-row: span 3; }
.teams { font-weight: 600; }
.meta { color: var(--muted); font-size: .8rem; }
.tv { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 4px; }
.tv span { background: var(--tv); color: var(--tv-text); border-radius: 6px; padding: 2px 8px; font-size: .8rem; font-weight: 600; }
.tv .open { background: transparent; color: var(--muted); font-weight: 400; padding-left: 0; }
footer { padding-top: 24px; padding-bottom: 32px; }
```

`site/app.js`:

```js
import { COMPETITIONS, groupByDay, berlinTime } from './lib.mjs';

const $ = (id) => document.getElementById(id);
let data = { matches: [], generatedAt: null };
let filter = 'all';

try { filter = localStorage.getItem('filter') || 'all'; } catch { /* storage unavailable */ }
if (filter !== 'all' && !COMPETITIONS.some((c) => c.key === filter)) filter = 'all';

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
}

function renderChips() {
  const box = $('chips');
  box.replaceChildren();
  for (const c of [{ key: 'all', short: 'Alle', name: 'Alle' }, ...COMPETITIONS]) {
    const b = el('button', 'chip', c.short);
    b.type = 'button';
    b.title = c.name;
    b.setAttribute('aria-pressed', String(c.key === filter));
    b.addEventListener('click', () => {
      filter = c.key;
      try { localStorage.setItem('filter', filter); } catch { /* ignore */ }
      renderChips();
      renderList();
    });
    box.append(b);
  }
}

function renderList() {
  const now = new Date();
  const days = groupByDay(data.matches, { now: now.toISOString(), filter });
  const list = $('list');
  list.replaceChildren();
  if (days.length === 0) { list.append(el('p', 'muted', 'Keine Spiele gefunden.')); return; }
  for (const d of days) {
    list.append(el('h2', 'day', d.heading));
    for (const m of d.matches) {
      const card = el('article', 'card' + (new Date(m.kickoff) < now ? ' started' : ''));
      card.append(el('div', 'time', berlinTime(m.kickoff)));
      card.append(el('div', 'teams', `${m.home} – ${m.away}`));
      const comp = COMPETITIONS.find((c) => c.key === m.competition);
      card.append(el('div', 'meta', [comp?.name, m.round].filter(Boolean).join(' · ')));
      const tv = el('div', 'tv');
      if (m.tv.length) m.tv.forEach((t) => tv.append(el('span', '', t)));
      else tv.append(el('span', 'open', 'TV: noch offen'));
      card.append(tv);
      list.append(card);
    }
  }
}

async function init() {
  renderChips();
  try {
    const res = await fetch('data/matches.json', { cache: 'no-cache' });
    if (!res.ok) throw new Error(res.status);
    data = await res.json();
    if (data.generatedAt) {
      $('updated').textContent = 'Aktualisiert: ' +
        new Date(data.generatedAt).toLocaleString('de-DE', { timeZone: 'Europe/Berlin', dateStyle: 'medium', timeStyle: 'short' });
    }
    renderList();
  } catch {
    $('list').replaceChildren(el('p', 'muted', 'Daten konnten nicht geladen werden.'));
  }
}
init();
```

- [ ] **Step 6: Verify visually at phone width**

Run `python3 -m http.server 8000 --directory site` in the background, open `http://localhost:8000` with chrome-devtools (`emulate` a 390×844 mobile viewport), take a screenshot. Check: chips scroll horizontally, no horizontal page scroll, day headings sticky, cards show channels, "TV: noch offen" shows for matches without channels, filter chip persists after reload, no console errors. Stop the server afterwards.

- [ ] **Step 7: Commit**

```bash
git add site test/lib.test.mjs
git commit -m "feat: mobile-friendly static page"
```

---

### Task 6: Workflow, README, publish

**Files:**
- Create: `.github/workflows/update.yml`, `README.md`

- [ ] **Step 1: Create the workflow** — `.github/workflows/update.yml`

```yaml
name: update

on:
  schedule:
    - cron: '0 5 * * *'
  workflow_dispatch:
  push:
    branches: [main]

permissions:
  contents: write
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: false

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm test
      - run: node scripts/fetch.mjs
      - name: Commit data
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
          git add site/data/matches.json
          git diff --staged --quiet || (git commit -m "chore: update match data" && git push)
      - uses: actions/configure-pages@v5
      - uses: actions/upload-pages-artifact@v3
        with:
          path: site

  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```

- [ ] **Step 2: Create `README.md`**

```markdown
# soccerdates

Fixtures of 1. & 2. Bundesliga, Champions League and Nations League with the German TV channel, refreshed daily by a GitHub Action and published as a static page on GitHub Pages.

- Data source: [fussballgucken.info](https://fussballgucken.info) (4 requests per day)
- `npm test` runs the unit tests; `npm run update` fetches fresh data into `site/data/matches.json`
- Preview locally: `python3 -m http.server --directory site`
- Channel mapping lives in `scripts/channels.mjs`; add a rule there if a German broadcaster is missing.
```

- [ ] **Step 3: Run the full test suite**

Run: `npm test`
Expected: all tests PASS.

- [ ] **Step 4: Commit**

```bash
git add .github README.md
git commit -m "ci: daily update and Pages deployment workflow"
```

- [ ] **Step 5: Ask the user before publishing**

Creating a public GitHub repo is outward-facing. Ask: repo name (default `soccerdates`) and confirm public. Only after a yes:

```bash
gh repo create soccerdates --public --source=. --push
gh api -X POST repos/{owner}/soccerdates/pages -f build_type=workflow
gh workflow run update.yml
gh run watch
```

Expected: run succeeds, summary shows 4 sources fetched (this also proves GitHub runners are not blocked by the site). If the fetch step gets HTTP 403, stop and report to the user.

- [ ] **Step 6: Verify the live page**

Run: `gh api repos/{owner}/soccerdates/pages --jq .html_url`, open that URL (also at 390px width via chrome-devtools), confirm matches and channel chips render. Report the URL to the user.
