import { COMPETITIONS, groupByDay, displayTime, matchStatus, channelKind } from './lib.mjs';

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

function renderCard(m, now) {
  const status = matchStatus(m, now);
  const card = el('article', `card ${status}`);
  card.dataset.comp = m.competition;

  const time = el('div', 'time');
  time.append(el('span', 'clock', displayTime(m)));
  if (status === 'live') {
    const live = el('span', 'live-pill', 'läuft');
    live.title = 'Angepfiffen – läuft vermutlich noch';
    time.append(live);
  }
  card.append(time);

  const body = el('div', 'body');
  const teams = el('div', 'teams');
  teams.append(el('span', 'team', m.home), el('span', 'team', m.away));
  body.append(teams);

  const comp = COMPETITIONS.find((c) => c.key === m.competition);
  body.append(el('div', 'meta', [comp?.name, m.round].filter(Boolean).join(' · ')));

  const tv = el('div', 'tv');
  if (m.tv?.length) m.tv.forEach((t) => tv.append(el('span', `tag ${channelKind(t)}`, t)));
  else tv.append(el('span', 'tag open', 'TV: noch offen'));
  body.append(tv);

  card.append(body);
  return card;
}

function renderList() {
  const now = new Date();
  const days = groupByDay(data.matches, { now: now.toISOString(), filter });
  const list = $('list');
  list.replaceChildren();
  if (days.length === 0) { list.append(el('p', 'empty', 'Keine anstehenden Spiele.')); return; }
  for (const d of days) {
    const h = el('h2', 'day');
    if (d.label) h.append(el('span', 'day-label', d.label));
    h.append(el('span', 'day-date', d.heading));
    list.append(h);
    for (const m of d.matches) list.append(renderCard(m, now));
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
    setInterval(renderList, 60000); // keep "läuft"/ended status fresh on a long-open tab
  } catch {
    $('list').replaceChildren(el('p', 'empty', 'Daten konnten nicht geladen werden.'));
  }
}
init();

// Keep sticky day headings directly below the (variable-height) sticky header.
const header = document.querySelector('header');
const syncHeader = () => document.documentElement.style.setProperty('--header-h', header.offsetHeight + 'px');
if (typeof ResizeObserver !== 'undefined') new ResizeObserver(syncHeader).observe(header);
syncHeader();
