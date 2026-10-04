import { readFile, writeFile, mkdir, appendFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { buildData, sameMatches } from './update.mjs';

const OUT = new URL('../site/data/matches.json', import.meta.url);
const UA = 'soccerdates/1.0 (daily fixture list for a personal static page; 4 requests/day)';

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
