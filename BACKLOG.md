# Backlog

Running list of outstanding work: feature ideas, data-quality gaps, and the
stores whose times we still cannot confirm.

The point of this file is that the *reasons* are as valuable as the tasks.
Several stores have already been investigated and found to be dead ends, and
that research is expensive to repeat. Where something was tried and rejected,
the note says so and why.

**Data status:** 312 events, 194 verified (62%), 30 venues.
Numbers below were accurate at the last update; regenerate with the snippet in
[Keeping this file honest](#keeping-this-file-honest).

---

## Feature requests

Roughly in the order they were raised, not priority order.

### Per-venue pages

Give each venue its own page: expanded detail, a map, something about the shop,
and its full list of upcoming events.

The biggest piece here, and the one that most changes the site's shape — it
turns a single-page calendar into a site with real structure. Worth doing for
its own sake, but it also gives us somewhere to put things that have nowhere to
live today: the verified/unverified explanation, a link to the shop's own
listings, price, and the "check before travelling" warning in context rather
than as a badge.

Two things to decide first:

- **Routing.** The site is currently a single page with a SPA fallback in
  `netlify.toml`. Real URLs (`/venue/dark-sphere`) need either a router plus a
  catch-all redirect, or pre-rendered pages at build time. Pre-rendering is
  likely better here — the data only changes nightly, and static pages would be
  indexable, which matters if people are searching for their local shop.
- **Where the copy comes from.** We hold no descriptive content about venues,
  only what pokedata gives us plus what the adapters scrape. An "about" section
  means either writing 30 short descriptions by hand or pulling them from each
  shop's site, which is a different kind of scraping to what we do now.

We do already have latitude/longitude for every venue, so the map is
straightforward.

### Filter by TfL zone

Filter events by Travelcard zone rather than only by venue.

Genuinely useful — zone is how Londoners actually think about whether somewhere
is worth travelling to on a weeknight. Needs a zone lookup per venue: there is
no zone in our data, and it cannot be derived from coordinates alone since
zones follow the network rather than geography.

Options are hand-mapping the ~30 venues to their nearest station's zone (small,
one-off, but goes stale if venues move), or a TfL API lookup. Note that a
meaningful number of venues are outside the zones entirely — Harlow, Watford,
Addlestone, Sidcup — so the filter needs an honest answer for those rather than
hiding them.

### Location-based calendar subscriptions

Let people subscribe to a filtered feed rather than all 312 events.

This is probably the highest-value item on the list. Most people want their two
or three local shops, and today they must take everything or nothing — which
makes the calendar noisy enough that some will unsubscribe.

Implementation is the interesting part: we serve a static `.ics`, so a filtered
feed means either generating one file per venue at build time (simple, cacheable,
but no arbitrary combinations) or accepting query parameters, which needs a
server and we deliberately moved *away* from Netlify Functions. Per-venue and
per-zone files are the natural fit for a static site, and would compose well
with the two features above.

### Better month view on mobile

The month grid is cramped on small screens.

Worth pinning down what "improve" means before starting — the underlying
tension is that a 7-column grid plus multiple events per day does not fit a
phone. Options range from smaller (dots instead of pills, tap to expand) to
larger (an agenda-style list on mobile instead of a grid).

### Animate the view switcher pill, and make it draggable on mobile

`ViewSwitcher.jsx` currently just toggles an `--active` class on three buttons —
there is no sliding pill to animate yet, so this is "build the pill, then
animate it" rather than a tweak.

Dragging needs care: the switcher sits above a horizontally-scrollable calendar,
so a horizontal drag gesture risks fighting the scroll underneath it. Also worth
honouring `prefers-reduced-motion`.

### Follow the system light/dark setting

`useTheme.js` reads `prefers-color-scheme` **once**, on first load, then writes
the result to `localStorage` — so the very first visit permanently pins a
preference the user never expressed, and the site stops following the system
from then on.

Two parts to fix: store an explicit `"system"` state distinct from a user's
choice, and subscribe to the media query so the theme follows a mid-session
change (phones switching at sunset). The inline script in `index.html` that
prevents a flash of the wrong theme on load needs updating in step.

---

## Known defects

### Every calendar event claims to last 3 hours

`src/lib/calendar.js` emits a hardcoded `DURATION:PT3H` on every event, because
pokedata gives a start time but no end time.

This is wrong in both directions: League Cups often run 6-8 hours, so a
subscriber's calendar looks free from mid-afternoon when they will still be
playing; weekly locals are usually 2 hours, so we block out an extra hour of
their evening. Challenges are about right by luck.

It is the only defect that is wrong on *every* event in *every* subscriber's
calendar, and it is invisible on our own website (which only shows a start
time), so nobody will report it.

Two ways to fix it, best combined:

- Per-type defaults — Cup 8h, Challenge 3h, Locals 2h. Quick, and a clear
  improvement, but it replaces one guess with three better guesses.
- Read real end times from store sites where they are published. Several
  already state them: Thunderbolt's "runs 6.30pm till 10pm", Do Or Dice's
  "6.30pm to 10pm", Tokyo Toys' "4-7:30 pm". This is the same
  verified-vs-assumed distinction we already apply to start times.

### Site is missing events that stores do run

Not a bug in our code — pokedata simply does not list them — but the calendar
is incomplete as a result, which users will read as our error:

- **Dark Fire Cafe** run a Sunday "Little Trainers" junior session (10am, £5)
  that has no pokedata row at all.
- **Dark Fire Cafe** and **Tokyo Toys** both advertise a monthly Challenge
  (Tokyo Toys: last Friday, 7:30pm) that does not appear in pokedata.

This raises a design question worth settling before building anything:
**should the site carry events pokedata does not know about?** Doing so means
our adapters become a source of events rather than only a correction to their
times, which is a meaningful change in what this project is. It would improve
coverage but the two sources could drift apart.

### No cancellation detection

If a store cancels a night, we keep publishing it until pokedata drops the row.
Subscribers get no signal. Worth knowing how often this actually happens before
building for it.

---

## Store coverage

118 of 312 events are still unverified. They are not equally solvable, so they
are grouped by what it would actually take.

### Reachable — most likely worth doing next

| Store | Unverified | Site | Notes |
|---|---|---|---|
| The Mug and Meeple | 15 | [calendar](https://www.mugandmeeple.co.uk/calendar/) | Adapter exists but deliberately covers Cups/Challenges only — their calendar carries ticketed tournaments and not the weekly league night, so most of these will never verify from that page. Would need another source for the weekly league. |
| The Gamers Guild | 13 | [events](https://shop.thegamersguild.co.uk/events/) | Adapter exists and verifies 3. Their site lists a programme that only partly overlaps pokedata's rows. |
| Mythic Goblin | 4 | — | Never investigated. Cups/Challenges only. |
| Mighty Meeples | 3 | — | Never investigated. |
| The Ludoquist | 2 | [events](https://www.theludoquist.com/pages/events-2026) | Never investigated. |
| Zombie Games Cafe | 1 | [events](https://www.zombiegamescafe.com/pokemon-tcg-events) | Never investigated. |
| Spellbound Games | 1 | [events](https://spellboundgames.co.uk/pages/events) | Never investigated. |

### Blocked on a specific obstacle

| Store | Unverified | Obstacle |
|---|---|---|
| D20 Board Game Cafe | 6 | Day is confirmed **Monday** from their own [calendar image](https://www.d20cafe.co.uk/watford/) — pokedata is right and their site's prose ("last Thursday Watford, Wednesdays Uxbridge") is stale. Time is still unknown: bookings run through BookingNinja, fully client-rendered with no JSON payload to read. Watford opens 12:00-22:30, so 18:30 is plausible but unconfirmed. |
| Labyrinthe | 5 | [Site](https://www.labyrinthe.co.uk/trading-card-games) 403s a plain fetch. Might yield to a browser user-agent, as Mug and Meeple did. |
| Kaboom Sports Trading Cards | 13 | [Site](https://kaboomcards.co.uk/collections/pokemon) lists products only, no schedule found. |

### Probably not solvable

Recorded so the same ground is not covered twice.

| Store | Unverified | Why |
|---|---|---|
| Marquee Models Harlow | 15 | Schedule is published only as Facebook images. |
| Retro Giant | 13 | CAPTCHA-protected, **and their robots.txt disallows automated fetching** — deliberately left alone. |
| The Movie Shack | 12 | Weekly league nights are free and never listed; only ticketed Challenges appear. Their 18:00 start is owner-reported, not verified. |

### Partly verified, remainder is expected

These are working as intended — noted so they are not mistaken for gaps.

- **Dark Fire Cafe** (6) — Challenge weeks are held back by the ambiguity guard
  so their 18:30 is not flattened onto the league's 18:00. Cup not covered.
- **Do Or Dice Addlestone** (4), **Europa Gaming** (3), **P9 Bow** (2) — the
  adapters deliberately cover the weekly league only; Cups and Challenges run
  to different times and are listed elsewhere.

---

## Rejected approaches

Do not redo these.

### playlondon.uk as a time source

Investigated in full and **rejected**. It has a public JSON API and 634 events,
so it looks ideal, but where we have ground truth it **disagrees 21 times out
of 26**, always in the same direction — toward 19:00.

The cause is visible in the `createdAt` timestamps: leagues are bulk-generated
quarterly with one flat default time. 419 of the 634 events are 19:00, and only
4 of 14 stores had updated in 90 days. It would verify at most 7 of our
unverified events and covers none of the priority stores above.

Narrow possible future use: *discovery* of Cup and Challenge dates, which do
look hand-entered. Always as `unverified`.

### events.pokemon.com

**Never fetch this.** Sits behind Imperva/Incapsula. pokedata mirrors it anyway,
and the whole premise of this project is that those listings are stale.

---

## Operational notes

- **Verification needs a generous time budget.** The full pass takes ~30s
  parallelised (91s sequential). Netlify functions cap at 30s, which silently
  truncated the run and published unverified times for weeks. This is why the
  nightly sync moved to GitHub Actions. Background functions are *not*
  available on the current Netlify plan — they 404.
- **Two independent failure modes, two defences.** A transient network blip on
  one store is handled by `fetchText` retries; a store being down for a whole
  run is handled by carry-forward of previously-verified times in the
  generator. Each has rescued events the other missed. A percentage-drop guard
  alone is not enough — losing one whole shop was only a 9% drop and slipped
  under the threshold.

---

## Keeping this file honest

Regenerate the unverified counts after a sync:

```sh
node -e "
const e=JSON.parse(require('fs').readFileSync('web/public/api/events','utf8'));
const by={};
for(const x of e){const s=x.shop;by[s]=by[s]||{v:0,u:0};x.confidence==='verified'?by[s].v++:by[s].u++;}
for(const [s,d] of Object.entries(by).sort((a,b)=>b[1].u-a[1].u)) if(d.u) console.log(d.u,'unverified |',d.v,'verified |',s);
"
```
