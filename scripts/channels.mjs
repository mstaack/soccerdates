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
