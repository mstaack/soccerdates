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

// Kickoff placeholder (the source has no final time yet): show "–:–".
export const displayTime = (m) => (m.timeTbd ? '–:–' : berlinTime(m.kickoff));

// No live data: a match counts as running for 135 min after kickoff (90 + break + stoppage), then as ended.
const LIVE_MINUTES = 135;
export function matchStatus(m, now) {
  if (m.timeTbd) return 'tbd';
  const minutes = (new Date(now) - new Date(m.kickoff)) / 60000;
  if (minutes < 0) return 'upcoming';
  return minutes <= LIVE_MINUTES ? 'live' : 'ended';
}

// Colour group of a channel label.
export function channelKind(label) {
  if (/^(Sky|WOW)/.test(label)) return 'sky';
  if (/^DAZN/.test(label)) return 'dazn';
  if (/^Prime/.test(label)) return 'prime';
  if (/^(ARD|ZDF|ORF|ServusTV|RTL|Sat\.1|NITRO)$/.test(label)) return 'free';
  return 'other';
}

// 'YYYY-MM-DD' + 1 calendar day (no clock arithmetic, so the 25-hour DST day is safe).
const nextDay = (day) => {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
};

export function groupByDay(matches, { now, filter }) {
  const today = berlinDay(now);
  const tomorrow = nextDay(today);
  const days = new Map();
  for (const m of matches) {
    if (filter && filter !== 'all' && m.competition !== filter) continue;
    const day = berlinDay(m.kickoff);
    if (day < today || matchStatus(m, now) === 'ended') continue;
    if (!days.has(day)) {
      const label = day === today ? 'Heute' : day === tomorrow ? 'Morgen' : '';
      days.set(day, { day, label, heading: dayHeading(m.kickoff), matches: [] });
    }
    days.get(day).matches.push(m);
  }
  return [...days.values()].sort((a, b) => a.day.localeCompare(b.day));
}
