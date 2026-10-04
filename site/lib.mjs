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

// Kickoff placeholder (the source has no final time yet): show "–:–" and never dim as started.
export const displayTime = (m) => (m.timeTbd ? '–:–' : berlinTime(m.kickoff));
export const hasStarted = (m, now) => !m.timeTbd && new Date(m.kickoff) < now;

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
