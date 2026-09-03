// Cross-reference event times against the stores' own websites.
//
// pokedata.ovh is our only source of League Locals, and its times are
// sometimes wrong - Dark Sphere's Tuesday league is listed at 15:00 when the
// shop's own site says 19:00, a four hour error. Where a store publishes its
// schedule we treat the store as authoritative for the start time, since a
// shop knows when its own league runs.
//
// There is no generic way to do this: none of the ~30 stores we track publish
// schema.org Event markup, and they run on everything from Shopify to Wix to
// bespoke PHP. So this is a registry of per-store adapters, each knowing how
// to read one site. Stores without an adapter simply keep their pokedata
// times.
//
// Design constraints, deliberately:
//   - Never throw. A store's site being down, slow or restructured must never
//     break the nightly sync; we fall back to pokedata and carry on.
//   - Fetch each store at most once per run, and only stores that actually
//     have events, so we stay a polite consumer of someone else's site.
//   - Only ever *correct* an existing event's time. We never add events from
//     a store's site, because those listings usually mix in Magic, Lorcana
//     and board game nights that aren't Pokémon at all.

const USER_AGENT =
  "PokeLeaguesLondon/1.0 (+https://playpokemonlondon.netlify.app; nightly schedule verification)";

const FETCH_TIMEOUT_MS = 15000;

/**
 * Fetch a URL as text, returning null rather than throwing on any failure.
 */
async function fetchText(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { "user-agent": USER_AGENT, accept: "text/html" },
      signal: controller.signal,
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

const MONTHS = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

/**
 * Parse "Tuesday 1st September 2026" into an ISO date, ignoring the weekday
 * and the ordinal suffix.
 */
function parseLongDate(text) {
  const match = /(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]+)\s+(\d{4})/.exec(text);
  if (!match) return null;
  const month = MONTHS[match[2].slice(0, 3).toLowerCase()];
  if (!month) return null;
  return `${match[3]}-${String(month).padStart(2, "0")}-${String(
    Number(match[1])
  ).padStart(2, "0")}`;
}

/**
 * Dark Sphere run a bespoke PHP site linking each of the coming week's events
 * from the homepage as event.php?e=<id>. Each event page carries its title
 * immediately before an "Event Start:" block holding the time and date.
 *
 * Their main "Gaming Calendar" page deliberately omits Pokémon (they run that
 * schedule through a Facebook group), so the homepage is the only place on
 * the site where a Pokémon night appears with a time.
 *
 * The title must be read from the event page's own heading rather than
 * sniffing the page for "Pokemon": every page carries a site-wide product nav
 * mentioning Pokémon, so a whole-page match also catches their Magic and One
 * Piece nights. That is almost certainly the origin of the error this fixes -
 * Dark Sphere's Tuesday 15:00 slot is MTG: Commander, while their Pokémon
 * night runs at 19:00.
 */
const darkSphere = {
  match: /^dark\s*sphere/i,
  async schedule() {
    const home = await fetchText("https://www.darksphere.co.uk/");
    if (!home) return [];

    const ids = [...new Set([...home.matchAll(/event\.php\?e=(\d+)/g)].map((m) => m[1]))];
    const found = [];

    for (const id of ids) {
      const page = await fetchText(`https://www.darksphere.co.uk/event.php?e=${id}`);
      if (!page) continue;

      const index = page.search(/Event Start:/i);
      if (index === -1) continue;

      // The event's own title is the last non-empty text node before the
      // "Event Start:" block.
      const before = page
        .slice(Math.max(0, index - 600), index)
        .replace(/<[^>]+>/g, "\n")
        .replace(/&nbsp;/g, " ")
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean);
      if (!/pok[eé]mon/i.test(before[before.length - 1] ?? "")) continue;

      const after = page
        .slice(index, index + 300)
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;/g, " ");
      const time = /(\d{1,2}):(\d{2})/.exec(after);
      const date = parseLongDate(after);
      if (!time || !date) continue;

      found.push({ date, time: `${time[1].padStart(2, "0")}:${time[2]}` });
    }
    return found;
  },
};

/**
 * P9 run WordPress with The Events Calendar ("Tribe"), which exposes a
 * paginated JSON API. That is by far the most reliable source we have: it
 * gives exact start times, a per-event venue name, and Europe/London as the
 * declared timezone, so no parsing or inference is needed.
 *
 * P9 have two branches and the API labels each event with the branch it runs
 * at, matching the names we already hold, so one fetch serves both shops.
 */
const p9 = {
  match: /^p9\s*card\s*game/i,
  async schedule(shop) {
    const found = [];

    // The feed is chronological from start_date, so we can stop as soon as a
    // page comes back short rather than walking all 20 pages.
    for (let page = 1; page <= 20; page += 1) {
      const body = await fetchText(
        "https://www.p9card.games/wp-json/tribe/events/v1/events" +
          `?per_page=50&page=${page}&start_date=${todayISO()}`
      );
      if (!body) break;

      let events;
      try {
        events = JSON.parse(body).events;
      } catch {
        break;
      }
      if (!Array.isArray(events) || events.length === 0) break;

      for (const event of events) {
        if (!/pok[eé]mon/i.test(event.title ?? "")) continue;
        if ((event.venue?.venue ?? "") !== shop) continue;
        const [date, time] = String(event.start_date).split(" ");
        if (!date || !time) continue;
        found.push({ date, time: time.slice(0, 5) });
      }

      if (events.length < 50) break;
    }
    return found;
  },
};

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

const ADAPTERS = [darkSphere, p9];

function adapterFor(shop) {
  return ADAPTERS.find((a) => a.match.test(shop)) ?? null;
}

/**
 * Correct event start times against the stores' own websites.
 *
 * Returns the events with corrected times, plus a list of the corrections
 * made so the sync can log what changed. Mutates nothing.
 *
 * @param {object[]} events
 * @returns {Promise<{events: object[], corrections: object[]}>}
 */
export async function verifyAgainstStoreSites(events) {
  const shops = [...new Set(events.map((e) => e.shop))].filter((shop) =>
    adapterFor(shop)
  );
  if (shops.length === 0) return { events, corrections: [] };

  // date -> time, per shop. Built once per shop so each site is fetched at
  // most once regardless of how many events we hold for it.
  //
  // Days where the store lists more than one Pokémon event are skipped: with
  // several candidate times there is no safe way to tell which of them a
  // given pokedata row refers to, so we leave it alone rather than guess.
  const schedules = new Map();
  for (const shop of shops) {
    try {
      const entries = await adapterFor(shop).schedule(shop);
      const byDate = new Map();
      const seen = new Set();
      for (const entry of entries) {
        if (seen.has(entry.date)) {
          byDate.delete(entry.date);
          continue;
        }
        seen.add(entry.date);
        byDate.set(entry.date, entry.time);
      }
      schedules.set(shop, { byDate, byWeekday: weeklyPattern(byDate) });
    } catch {
      // An adapter throwing is a bug in that adapter, not a reason to fail
      // the whole sync; the store just keeps its pokedata times.
      schedules.set(shop, { byDate: new Map(), byWeekday: new Map() });
    }
  }

  const corrections = [];
  const corrected = events.map((event) => {
    const schedule = schedules.get(event.shop);
    if (!schedule) return event;

    // Prefer an exact date match; fall back to the store's established
    // weekly slot for dates beyond what their site currently lists.
    const weekday = new Date(`${event.date}T12:00:00Z`).getUTCDay();
    const officialTime =
      schedule.byDate.get(event.date) ?? schedule.byWeekday.get(weekday);
    if (!officialTime) return event;

    const currentTime = (event.time ?? "").slice(0, 5);
    if (!currentTime || currentTime === officialTime) return event;

    corrections.push({
      id: event.id,
      shop: event.shop,
      date: event.date,
      from: currentTime,
      to: officialTime,
      exact: schedule.byDate.has(event.date),
    });

    return {
      ...event,
      time: `${officialTime}:00`,
      startsAt: `${event.date}T${officialTime}:00`,
      timeVerified: true,
    };
  });

  return { events: corrected, corrections };
}

/**
 * Derive a weekday -> time map from confirmed dates.
 *
 * Some stores only publish the coming week, while we hold events months out.
 * A league that runs at a fixed time every week is the norm, so a weekday
 * whose confirmed sightings all agree on one time can be applied forward.
 *
 * Two sightings are required before a *weekend* day counts as a pattern.
 * Weekday evenings are recurring league nights, so one confirmed sighting is
 * good evidence - and some stores (Dark Sphere) only ever publish the coming
 * week, so demanding two would discard them entirely. Saturdays and Sundays
 * are a mix of recurring leagues and one-off cups and challenges that start
 * at their own times, so a lone weekend sighting proves only that one event.
 * Days with conflicting times are dropped rather than guessed at.
 */
function weeklyPattern(byDate) {
  const times = new Map();
  for (const [date, time] of byDate) {
    const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
    if (!times.has(weekday)) times.set(weekday, []);
    times.get(weekday).push(time);
  }
  const pattern = new Map();
  for (const [weekday, seen] of times) {
    const isWeekend = weekday === 0 || weekday === 6;
    const distinct = new Set(seen);
    if (distinct.size === 1 && seen.length >= (isWeekend ? 2 : 1)) {
      pattern.set(weekday, seen[0]);
    }
  }
  return pattern;
}
