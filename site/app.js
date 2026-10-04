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
  for (const c of [{ key: 'all', short: 'Alle', name: 'Alle' }, ...COMPETITIONS]) {
    const b = el('button', 'chip', c.short);
    b.type = 'button';
    b.title = c.name;
    b.dataset.key = c.key;
    b.setAttribute('aria-pressed', String(c.key === filter));
    b.addEventListener('click', () => {
      filter = c.key;
      try { localStorage.setItem('filter', filter); } catch { /* ignore */ }
      for (const x of box.children) x.setAttribute('aria-pressed', String(x.dataset.key === filter));
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

// Keep sticky day headings directly below the (variable-height) sticky header.
const header = document.querySelector('header');
const syncHeader = () => document.documentElement.style.setProperty('--header-h', header.offsetHeight + 'px');
new ResizeObserver(syncHeader).observe(header);
syncHeader();
