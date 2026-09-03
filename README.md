# Pokémon TCG League Events Calendar

Scrapes League Cup / Challenge / Pre-release events from
[pokedata.ovh](https://www.pokedata.ovh/events/leagues/), stores them
persistently, and publishes them as a subscribable `.ics` calendar feed —
hosted entirely on Netlify.

## How it works

```
Netlify Scheduled Function (nightly, 02:00 UTC)
        │
        ▼
pokedata.ovh getevents.php API  ──►  normalise  ──►  Netlify Blobs (storage)
                                                            │
                                                            ▼
                                          /.netlify/functions/calendar
                                                            │
                                                            ▼
                                              GET /calendar.ics  ──►  subscribers
```

- **Data source**: rather than scraping rendered HTML, we call the same
  JSON API the page's own JavaScript uses
  (`https://www.pokedata.ovh/events/leagues/getevents.php`). This is far
  more reliable than parsing the DOM. See
  [src/lib/pokedata.js](src/lib/pokedata.js).
- **Storage**: [Netlify Blobs](https://docs.netlify.com/blobs/overview/) —
  a built-in key/value store, so no external database is required. See
  [src/lib/store.js](src/lib/store.js).
- **Venue data cleanup**: pokedata.ovh's raw shop/address fields are messy
  (ALL CAPS, inconsistent punctuation — e.g. "DO OR DICE ADDLESTONE" vs
  "DO OR DICE - ADDLESTONE" — and the same venue sometimes has two
  differently-formatted addresses). [src/lib/venues.js](src/lib/venues.js)
  title-cases names/addresses and groups near-duplicate spellings of the
  same venue (ignoring case/punctuation/spacing) into one canonical form.
  A persistent registry (`venues.json` in Blobs) remembers every raw
  variant seen for each venue and its sighting count, so the canonical
  spelling converges on whichever raw form is seen most often — and gets
  more consistent over time as more nightly syncs run.
- **Scheduling**: a
  [Netlify Scheduled Function](https://docs.netlify.com/functions/scheduled-functions/)
  runs nightly. See [netlify/functions/sync-events.js](netlify/functions/sync-events.js)
  and the `[functions."sync-events"]` block in [netlify.toml](netlify.toml).
- **Calendar feed**: [netlify/functions/calendar.js](netlify/functions/calendar.js)
  reads stored events and builds an `.ics` file on each request using the
  [`ics`](https://www.npmjs.com/package/ics) package, redirected to the
  friendly URL `/calendar.ics`.
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
npm test          # fetches live data, writes tmp-preview.ics for inspection
netlify dev        # runs functions + redirects locally (requires Netlify CLI)
```

To test the calendar function locally once `netlify dev` is running:

```bash
curl http://localhost:8888/calendar.ics
```

## Deploying to Netlify

1. Push this repo to GitHub (or connect it directly).
2. Create a new Netlify site from the repo — `netlify.toml` handles the
   build config, function directory, and schedule automatically.
3. Enable **Netlify Blobs** — this is automatic on Netlify's platform,
   no extra setup needed for site-level Blobs stores.
4. Set an environment variable `SYNC_WRITE_KEY` (any long random string)
   if you want to use the manual sync endpoint.
5. Trigger a first sync manually so the calendar isn't empty on day one:

   ```bash
   curl -X POST https://<your-site>.netlify.app/.netlify/functions/sync-events-manual-background \
     -H "x-write-key: $SYNC_WRITE_KEY"
   ```

6. Visit `https://<your-site>.netlify.app/` for the subscribe page, or
   go straight to `https://<your-site>.netlify.app/calendar.ics`.

## Adding more search locations

`src/lib/pokedata.js` exports `DEFAULT_SEARCH_POINTS` — currently just
London (40 km radius). Add more `{ label, lat, lng, radius }` entries to
cover other cities; results are de-duplicated by event GUID across all
points.

## Endpoints

| Path | Purpose |
|---|---|
| `/calendar.ics` | Public subscribable calendar feed |
| `/status` | JSON: last sync time, event counts |
| `/.netlify/functions/sync-events-manual-background` | POST, requires `x-write-key` header — force a re-sync |

## Notes / etiquette

This project depends on an undocumented third-party API. If pokedata.ovh
changes its endpoint or blocks automated requests, the sync will start
failing — check `/status` and the Netlify function logs. Keep the sync
frequency low (nightly) to avoid putting load on their service.
