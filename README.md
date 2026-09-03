# Pokémon TCG League Events Calendar

Scrapes League Cup / Challenge / Pre-release events from
[pokedata.ovh](https://www.pokedata.ovh/events/leagues/), stores them
persistently, and publishes them as a subscribable `.ics` calendar feed —
hosted entirely on Netlify.

## How it works

```
GitHub Actions (nightly, 02:00 UTC)
        │
        ▼
pokedata.ovh getevents.php API  ──►  normalise  ──►  verify against store sites
                                                            │
                                                            ▼
                                     committed to web/public via an auto-merged PR
                                                            │
                                                            ▼
                                            Netlify static deploy
                                                            │
                                                            ▼
                                               GET /calendar.ics  ──►  subscribers
```

- **Data source**: rather than scraping rendered HTML, we call the same
  JSON API the page's own JavaScript uses
  (`https://www.pokedata.ovh/events/leagues/getevents.php`). This is far
  more reliable than parsing the DOM. See
  [src/lib/pokedata.js](src/lib/pokedata.js).
- **Storage**: none. The generated data is committed to the repository under
  `web/public` and served as static files, so there is no database and no
  runtime state to go stale.
- **Time verification**: pokedata mirrors Pokémon's official listings, and
  those are frequently out of date. Where a shop publishes its own schedule,
  [src/lib/store-sites.js](src/lib/store-sites.js) reads it and lets the shop
  win. Roughly half of all events are corrected this way.
- **Venue data cleanup**: pokedata.ovh's raw shop/address fields are messy
  (ALL CAPS, inconsistent punctuation — e.g. "DO OR DICE ADDLESTONE" vs
  "DO OR DICE - ADDLESTONE" — and the same venue sometimes has two
  differently-formatted addresses). [src/lib/venues.js](src/lib/venues.js)
  title-cases names/addresses and groups near-duplicate spellings of the
  same venue (ignoring case/punctuation/spacing) into one canonical form.
- **Scheduling**: a nightly GitHub Action regenerates the data, opens a pull
  request and merges it, which triggers a Netlify deploy. See
  [.github/workflows/nightly-sync.yml](.github/workflows/nightly-sync.yml).

  This deliberately does **not** run as a Netlify Function. Verifying ~20
  store websites takes well over the 30 seconds a function is allowed, so the
  sync was being cut short every night and silently writing pokedata's stale
  times back over corrections we had already made.
- **Calendar feed**: [scripts/generate-fixtures.mjs](scripts/generate-fixtures.mjs)
  builds `web/public/calendar.ics` with the
  [`ics`](https://www.npmjs.com/package/ics) package, served directly at
  `/calendar.ics`.
- **Timezones**: pokedata.ovh returns wall-clock local (UK) time with no
  offset. We convert it to true UTC with `luxon` (DST-aware), so every
  calendar client displays the correct local time for the subscriber.
- **Event URLs**: each event includes a `pokemon_url` slug; we build the
  canonical event page URL:
  `https://www.pokemon.com/us/pokemon-trainer-club/play-pokemon-tournaments/{slug}/`
  and include it as the calendar entry's `URL` field.

## Local development

```bash
npm install
npm run fixtures   # fetch + verify, regenerate web/public data and calendar.ics
npm run dev        # run the site against that data
```

`npm run fixtures` takes a couple of minutes: it fetches every store site to
verify times. It refuses to write if the result looks broken (too few events,
or a large drop in verified times), so a store being down cannot silently wipe
out existing corrections.

## Deploying to Netlify

1. Push this repo to GitHub (or connect it directly).
2. Create a new Netlify site from the repo — `netlify.toml` handles the build
   config. It is a purely static deploy; no functions, storage or environment
   variables are required.
3. Visit `https://<your-site>.netlify.app/` for the subscribe page, or go
   straight to `https://<your-site>.netlify.app/calendar.ics`.

The data refreshes itself: the nightly GitHub Action commits new data, and
Netlify redeploys on the resulting merge. To force a refresh, run the
**Nightly event sync** workflow from the Actions tab.

## Adding more search locations

`src/lib/pokedata.js` exports `DEFAULT_SEARCH_POINTS` — currently just
London (40 km radius). Add more `{ label, lat, lng, radius }` entries to
cover other cities; results are de-duplicated by event GUID across all
points.

## Endpoints

| Path | Purpose |
|---|---|
| `/calendar.ics` | Public subscribable calendar feed |
| `/api/events` | JSON: all upcoming events |
| `/status` | JSON: last sync time, event and verified counts |

## Notes / etiquette

This project depends on an undocumented third-party API. If pokedata.ovh
changes its endpoint or blocks automated requests, the sync will start
failing — check `/status` and the Netlify function logs. Keep the sync
frequency low (nightly) to avoid putting load on their service.
