import { berlinToUtcIso } from './time.mjs';
import { normalizeChannels, unknownChannels } from './channels.mjs';

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

export function parsePage(html, competition, { onUnknown = () => {} } = {}) {
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
    // The source shows 00:00 plus this marker when the real kickoff time is not set yet.
    const timeTbd = /meta-detail[^>]*>\s*Uhrzeit nicht fix/i.test(block);

    const entries = [...block.matchAll(CHANNEL_RE)].map((m) => ({
      name: decode(m[2]),
      icons: [...m[1].matchAll(ICON_RE)].map((x) => x[1]),
    }));

    unknownChannels(entries).forEach(onUnknown);

    matches.push({
      id, competition, round: decode(round),
      kickoff: berlinToUtcIso(date, time.padStart(5, '0')),
      home, away, tv: normalizeChannels(entries),
      ...(timeTbd && { timeTbd: true }),
    });
  });
  if (matches.length === 0) throw new Error(`no matches parsed for ${competition}`);
  return matches;
}
