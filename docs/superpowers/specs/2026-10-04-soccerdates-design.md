# soccerdates — design

## Goal
A free, mobile-friendly static page (GitHub Pages, `<user>.github.io/soccerdates`) that lists upcoming fixtures of 1. Bundesliga, 2. Bundesliga, UEFA Champions League and UEFA Nations League, **with the German TV/stream channel for each match**. Data is refreshed daily by a GitHub Action. German and Austrian channels.

## Decisions (agreed)
- **Single data source: fussballgucken.info.** It provides fixtures, kickoff times and per-match German channels for all four competitions. No ESPN, no tvspielfilm, no fallback rules file.
- Page shows all matches, grouped by day, with competition filter chips. Fixtures only (the source has no scores).
- Static site, plain HTML/CSS/JS, no framework, no build step. No backend.

## Architecture
```
.github/workflows/update.yml   daily cron (+ workflow_dispatch): fetch -> commit data if changed -> deploy Pages
scripts/fetch.mjs              Node 20, zero dependencies: fetch 4 pages, parse, normalize, write JSON
scripts/parse.mjs              pure functions: HTML -> matches (unit-tested against saved fixtures)
scripts/channels.mjs           German channel allowlist + variant merging (pure, unit-tested)
test/                          node:test tests + saved HTML fixtures
site/index.html, app.js, style.css
site/data/matches.json         generated, committed by the Action
```

### Sources (4 requests per run)
`https://fussballgucken.info/wettbewerb/{bundesliga, 2-bundesliga, uefa-champions-league, nations-league}`
Request with a descriptive User-Agent, one request per page, sequential, small delay. robots.txt is `Allow: /`.

### Parsing (per page)
- Day header `div#date-YYYYMMDD` gives the date.
- Each `div.item.game` gives: `.meta-time` (HH:MM, Europe/Berlin), `.meta-phase` (round), teams (`.team-home`, `.team-guest`), match id (`div#match-<id>`), and the channel list (`.coverage-list li`, each with an icon type and a sender link).
- Kickoff converted to a UTC ISO string (Europe/Berlin -> UTC, DST-aware).

### Channel normalization (`channels.mjs`)
- Keep only German- and Austrian-market broadcasters via an allowlist (Sky Sport Bundesliga n / Top Event / Sky Sport, DAZN, Sat.1, RTL, ARD, ZDF, Prime Video, MagentaSport, Sport1, Joyn, ...). Keep Austrian ones too (Sky Sport Austria, Sky X, ORF, ServusTV). Drop Swiss/French/Italian/other (blue Sport, SRF, RTS, RSI, TF1, Rai, L'Équipe), radio and webradio entries.
- Merge variants into one label: strip `HD`/`UHD`, `(App)`, `(Amazon)`, numbered feed (`Sky Sport Bundesliga 3` -> `Sky Sport Bundesliga`). Conference feeds shown as `Sky Konferenz`.
- Each match gets `tv: string[]` of unique labels, ordered Free-TV, Sky, DAZN, other. Empty list means "no German channel announced yet".
- Unknown channel names are logged to the run summary so the allowlist can be extended.

### Output `site/data/matches.json`
```json
{ "generatedAt": "2026-10-04T05:00:00Z",
  "matches": [ { "id": "192151", "competition": "ucl", "round": "02. Spieltag",
                 "kickoff": "2026-10-13T16:45:00Z", "home": "...", "away": "...", "tv": ["Amazon Prime Video"] } ] }
```
Sorted by kickoff. Written only if content changed (ignoring `generatedAt`) to avoid empty commits.

### Page
- Mobile-first single column, system font, dark mode via `prefers-color-scheme`.
- Header with "updated <date>"; competition chips (Alle, BL1, BL2, CL, NL), selection kept in `localStorage`.
- Day sections ("Samstag, 24.10."), sticky day header; match card = time (Europe/Berlin, via `Intl`), home – away, round, channel chips. Matches that already kicked off earlier today are dimmed. Empty channel list shows "TV: noch offen".
- Past days are not shown. Empty state if filter yields nothing.

### Error handling
- A page that fails to fetch/parse (HTTP error, zero matches parsed): keep the previous matches of that competition from the existing JSON and print a warning; the run fails only if **all four** pages fail or the output would be empty. Failures surface in the Action log/summary.
- Parser asserts basic structure (date header + at least one game) so a markup change fails loudly instead of silently producing garbage.

### Deploy
Workflow uses `actions/checkout`, `setup-node@v4` (Node 20), commits `site/data/matches.json` as `github-actions[bot]`, then `actions/upload-pages-artifact` + `actions/deploy-pages` (Pages source: GitHub Actions). Cron `0 5 * * *` UTC plus manual trigger. Push to `main` also deploys.

### Testing
`node --test`: parser against saved HTML fixtures of each of the 4 pages, Berlin->UTC conversion across the DST change (2026-10-25), channel normalization table (Sky HD variant, DAZN app, ORF dropped, conference), change-detection logic. Manual check of the page at phone width with Chrome DevTools.

## Out of scope
Scores/results, team favorites, notifications, other competitions, Swiss/other-country channels, a custom domain (free `github.io` URL is used).

## Risks
- Single scrape source: markup changes break parsing (mitigated by fixtures, loud failure, stale-data fallback). Terms of use not reviewed; load is 4 requests/day.
- GitHub runners might be blocked by the site: first implementation step is a `workflow_dispatch` run to confirm.
- Creating the GitHub repo is outward-facing: it will be created only after your confirmation (public is required for free Pages).
