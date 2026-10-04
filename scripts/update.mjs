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
