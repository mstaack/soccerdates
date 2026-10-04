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
  [/^(Amazon )?Prime Video/i, 'Prime Video'],
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
  'Sky Sport Bundesliga', 'Sky Sport Top Event', 'Sky Sport', 'Sky Sport Austria', 'Sky X', 'WOW',
  'DAZN', 'Prime Video', 'MagentaSport'];

// Sky feeds keep their number ("Sky Sport Bundesliga 3"); HD/UHD variants merge into the plain feed.
const FEED = /^Sky Sport (Bundesliga|Austria)(?: (\d+))?(?: HD| UHD)?$/i;
const KONFERENZ = ' (Konferenz)';

// Conference slots on German Sky are marked; the Austrian feed numbers stay as they are.
const withConference = (label, icons) =>
  icons.includes('conference') && label.startsWith('Sky Sport') && !label.startsWith('Sky Sport Austria')
    ? label + KONFERENZ : label;

export function classify({ name, icons }) {
  if (icons.includes('radio')) return null;
  if (FOREIGN.test(name)) return null;
  const feed = name.match(FEED);
  if (feed) {
    const base = /austria/i.test(feed[1]) ? 'Sky Sport Austria' : 'Sky Sport Bundesliga';
    return withConference(feed[2] ? `${base} ${feed[2]}` : base, icons);
  }
  for (const [re, label] of RULES) {
    if (re.test(name)) return withConference(label, icons);
  }
  return null;
}

// Known German-market names we deliberately ignore (not worth logging).
const IGNORED = /^Sky (Go|Showcase)\b/i;

export function unknownChannels(entries) {
  const names = entries
    .filter((e) => classify(e) === null && !e.icons.includes('radio') && !FOREIGN.test(e.name) && !IGNORED.test(e.name))
    .map((e) => e.name);
  return [...new Set(names)];
}

const baseOf = (label) => label.replace(KONFERENZ, '').replace(/ \d+$/, '');
const feedNumber = (label) => Number(label.match(/ (\d+)(?: \(Konferenz\))?$/)?.[1] ?? 0);

export function normalizeChannels(entries) {
  const labels = new Set(entries.map(classify).filter(Boolean));
  // A plain "Sky Sport Bundesliga" entry is redundant once a concrete feed is known.
  for (const base of ['Sky Sport Bundesliga', 'Sky Sport Austria']) {
    if ([...labels].some((l) => l !== base && baseOf(l) === base && feedNumber(l) > 0)) labels.delete(base);
  }
  return [...labels].sort((a, b) =>
    ORDER.indexOf(baseOf(a)) - ORDER.indexOf(baseOf(b)) || feedNumber(a) - feedNumber(b) || a.localeCompare(b));
}
