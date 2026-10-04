# soccerdates

Fixtures of 1. & 2. Bundesliga, Champions League and Nations League with the German TV channel, refreshed daily by a GitHub Action and published as a static page on GitHub Pages.

- Data source: [fussballgucken.info](https://fussballgucken.info) (4 requests per day)
- `npm test` runs the unit tests; `npm run update` fetches fresh data into `site/data/matches.json`
- Preview locally: `python3 -m http.server --directory site`
- Channel mapping lives in `scripts/channels.mjs`; add a rule there if a German broadcaster is missing.
