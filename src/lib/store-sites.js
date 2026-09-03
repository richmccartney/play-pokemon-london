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

// A couple of hosts block our honest User-Agent outright. For those, and only
// those, we send a browser string so the request is served at all.
const BROWSER_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

/**
 * Fetch a URL as text, returning null rather than throwing on any failure.
 */
async function fetchText(url, { browserAgent = false } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: {
        "user-agent": browserAgent ? BROWSER_USER_AGENT : USER_AGENT,
        accept: "text/html",
      },
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
 * A number of the stores run WordPress with The Events Calendar ("Tribe"),
 * which exposes a paginated JSON API. That is by far the most reliable source
 * we have: it gives exact start times, a per-event venue name, and
 * Europe/London as the declared timezone, so no parsing or inference is
 * needed.
 *
 * Build an adapter for one such site. `venueFor` maps one of our shop names
 * onto the venue label the site uses, so a chain with several branches can be
 * served by a single fetch; returning null means "accept any venue", which is
 * what single-site stores want.
 */
function tribeAdapter({ match, origin, venueFor = () => null }) {
  return {
    match,
    async schedule(shop) {
      const venue = venueFor(shop);
      const found = [];

      // The feed is chronological from start_date, so we can stop as soon as
      // a page comes back short rather than walking all 20 pages.
      for (let page = 1; page <= 20; page += 1) {
        const body = await fetchText(
          `${origin}/wp-json/tribe/events/v1/events` +
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
          if (venue !== null && (event.venue?.venue ?? "") !== venue) continue;
          const [date, time] = String(event.start_date).split(" ");
          if (!date || !time) continue;
          found.push({ date, time: time.slice(0, 5) });
        }

        if (events.length < 50) break;
      }
      return found;
    },
  };
}

const p9 = tribeAdapter({
  match: /^p9\s*card\s*game/i,
  origin: "https://www.p9card.games",
  // P9's own venue labels already match the shop names we hold.
  venueFor: (shop) => shop,
});

// Badger Badger label their two branches by neighbourhood alone, while we hold
// them by street ("Norwood Rd", "Deptford High St"), so the shop name has to be
// translated before it will match.
const badgerBadger = tribeAdapter({
  match: /^badger\s*badger/i,
  origin: "https://www.badgerbadger.org",
  venueFor: (shop) => (/norwood/i.test(shop) ? "West Norwood" : "Deptford"),
});

const onlyGraded = tribeAdapter({
  match: /^only\s*graded/i,
  origin: "https://www.onlygraded.com",
});

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Wayland Games list their events on a separate subdomain from their shop,
 * as a grid of cards each holding a title and a "Sept 8 2026 | 18:00 - 21:30"
 * meta line. One page covers roughly two months.
 *
 * The card title is the only thing distinguishing a Pokemon night from their
 * Magic, Star Wars and Riftbound nights, so the match is made against the
 * title alone rather than the card's wider markup.
 */
const wayland = {
  match: /^wayland\s*games/i,
  async schedule() {
    const page = await fetchText("https://centres.waylandgames.co.uk/brentwood");
    if (!page) return [];

    const found = [];
    for (const card of page.split('class="card-title">').slice(1)) {
      const title = card.slice(0, card.indexOf("<")).trim();
      if (!/pok[eé]mon/i.test(title)) continue;

      const metaIndex = card.indexOf("card-meta");
      if (metaIndex === -1) continue;
      const meta = card
        .slice(metaIndex, metaIndex + 6000)
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;/g, " ")
        .replace(/\s+/g, " ");

      // "Sept 8 2026 | 18:00 - 21:30" - month first here, and the second
      // clock time is the finish, so only the first is read.
      const date = parseMonthFirstDate(meta);
      const time = /(\d{1,2}):(\d{2})/.exec(meta);
      if (!date || !time) continue;

      found.push({ date, time: `${time[1].padStart(2, "0")}:${time[2]}` });
    }
    return found;
  },
};

/**
 * Parse "Sept 8 2026" into an ISO date. Wayland abbreviate September as
 * "Sept", so the month is matched on its first three letters.
 */
function parseMonthFirstDate(text) {
  const match = /([A-Za-z]{3,9})\s+(\d{1,2})\s+(\d{4})/.exec(text);
  if (!match) return null;
  const month = MONTHS[match[1].slice(0, 3).toLowerCase()];
  if (!month) return null;
  return `${match[3]}-${String(month).padStart(2, "0")}-${String(
    Number(match[2])
  ).padStart(2, "0")}`;
}

/**
 * Troll Trader embed a Tockify calendar, which serves its events as JSON from
 * a public endpoint keyed on the calendar name found in the page markup.
 *
 * Like the Tribe feeds this needs no parsing: each event carries an epoch
 * start time plus its UTC offset, so the local wall-clock time is exact.
 */
const trollTrader = {
  match: /^troll\s*trader/i,
  async schedule() {
    const body = await fetchText(
      "https://tockify.com/api/ngevent" +
        `?calname=ttbromley&startms=${Date.now()}&max=200`
    );
    if (!body) return [];

    let events;
    try {
      events = JSON.parse(body).events;
    } catch {
      return [];
    }
    if (!Array.isArray(events)) return [];

    const found = [];
    for (const event of events) {
      const title = event?.content?.summary?.text ?? "";
      if (!/pok[eé]mon/i.test(title)) continue;

      const start = event?.when?.start;
      if (!Number.isFinite(start?.millis)) continue;

      // Shift by the event's own offset and read the result as UTC, so the
      // local time is recovered without depending on the server's timezone.
      const local = new Date(start.millis + (start.offset ?? 0));
      found.push({
        date: local.toISOString().slice(0, 10),
        time: local.toISOString().slice(11, 16),
      });
    }
    return found;
  },
};

/**
 * The Movie Shack sell event places as Shopify products, one product per event
 * type with a variant per date ("Thursday 9th September 6pm"). The variant
 * title is the only place the schedule appears, so the year is absent and has
 * to be inferred.
 *
 * Their league nights are not sold this way - only the ticketed Challenges are
 * - so this confirms a handful of dates rather than the whole schedule.
 */
const movieShack = {
  match: /^(the\s*)?movie\s*shack/i,
  // Only their ticketed Challenges are sold as products; the weekly league
  // nights are free and never appear, so nothing else can be confirmed here.
  covers: /challenge/i,
  async schedule() {
    const body = await fetchText(
      "https://themovieshack.co.uk/products.json?limit=250"
    );
    if (!body) return [];

    let products;
    try {
      products = JSON.parse(body).products;
    } catch {
      return [];
    }
    if (!Array.isArray(products)) return [];

    const found = [];
    for (const product of products) {
      if (!/pok[eé]mon/i.test(product?.title ?? "")) continue;
      for (const variant of product.variants ?? []) {
        const parsed = parseDayMonthTime(variant?.title ?? "");
        if (parsed) found.push(parsed);
      }
    }
    return found;
  },
};

/**
 * Parse "Thursday 9th September 6pm" into a date and 24-hour time.
 *
 * No year is given, so the next occurrence of that day/month is assumed:
 * a month more than a little in the past belongs to next year. Times are
 * written informally ("6pm", "6.30pm"), so both forms are accepted.
 */
function parseDayMonthTime(text) {
  const when = /(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]{3,9})/.exec(text);
  const clock = /(\d{1,2})(?:[.:](\d{2}))?\s*(am|pm)/i.exec(text);
  if (!when || !clock) return null;

  const month = MONTHS[when[2].slice(0, 3).toLowerCase()];
  if (!month) return null;

  let hour = Number(clock[1]) % 12;
  if (/pm/i.test(clock[3])) hour += 12;

  const now = new Date();
  // Allow a month's grace before rolling forward, so an event earlier this
  // month is not pushed a year into the future.
  const year =
    month < now.getUTCMonth() ? now.getUTCFullYear() + 1 : now.getUTCFullYear();

  return {
    date: `${year}-${String(month).padStart(2, "0")}-${String(
      Number(when[1])
    ).padStart(2, "0")}`,
    time: `${String(hour).padStart(2, "0")}:${clock[2] ?? "00"}`,
  };
}

/**
 * Dark Fire Cafe run a Wix site that states its schedule in prose rather than
 * listing dates ("Wednesday League Nights - When: Every Wednesday From 6pm"),
 * with ticketed Challenges sold through a linked Shopify store.
 *
 * Only the Wednesday night is read. Their Sundays carry two overlapping
 * Pokémon sessions - Little Trainers from 10am and the league from 12noon -
 * and pokedata holds a single Sunday row whose time matches neither
 * consistently, so there is no safe way to tell which session it refers to.
 *
 * Challenge dates are emitted alongside so that a Challenge week is skipped by
 * the ambiguity guard rather than having the weekly 18:00 stamped over a
 * Challenge that starts at 18:30.
 */
const darkFire = {
  match: /^dark\s*fire/i,
  // Only the weekly league night is stated on their site. Challenges start
  // half an hour later and are listed on Shopify only a month or two ahead,
  // so beyond that window we would not know a Challenge week from a normal
  // one and would flatten its 18:30 onto the league's 18:00.
  covers: /^league\s*\(locals\)$/i,
  async schedule() {
    const page = await fetchText("https://www.darkfirecafe.com/pokemon-tcg");
    if (!page) return [];

    const text = page.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
    const weekly =
      /Wednesday\s+League\s+Nights.{0,80}?Every\s+Wednesday\s+From\s+(\d{1,2})\s*(am|pm)/i.exec(
        text
      );
    if (!weekly) return [];

    let hour = Number(weekly[1]) % 12;
    if (/pm/i.test(weekly[2])) hour += 12;
    const time = `${String(hour).padStart(2, "0")}:00`;

    const found = [];
    for (const date of upcomingWeekdays(3, 26)) found.push({ date, time });

    // Their Challenges are sold as Shopify products whose description carries
    // the date and start time in prose.
    const shop = await fetchText(
      "https://1cfgsy-ms.myshopify.com/collections/events/products.json?limit=250"
    );
    if (shop) {
      try {
        for (const product of JSON.parse(shop).products ?? []) {
          if (!/pok[eé]mon/i.test(product?.title ?? "")) continue;
          const body = (product.body_html ?? "")
            .replace(/<[^>]+>/g, " ")
            .replace(/\s+/g, " ");
          const parsed = parseDayMonthTime(body);
          if (parsed) found.push(parsed);
        }
      } catch {
        // A malformed catalogue just means no Challenge dates this run.
      }
    }
    return found;
  },
};

const wishlist = {
  match: /^wishlist\s*collectables/i,
  // Their shop sells a single weekly league ticket and no Pokémon tournaments,
  // so the league night is all we can vouch for.
  covers: /^league\s*\(locals\)$/i,
  async schedule() {
    const catalogue = await fetchText(
      "https://wishlistcollectables.co.uk/products.json?limit=250"
    );
    if (!catalogue) return [];

    let products;
    try {
      products = JSON.parse(catalogue).products ?? [];
    } catch {
      return [];
    }

    for (const product of products) {
      if (!/weekly\s+pok[eé]mon\s+league/i.test(product?.title ?? "")) continue;

      const body = (product.body_html ?? "")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ");
      const stated =
        /League\s+day:\s*(\w+day).{0,40}?Start\s+time:\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i.exec(
          body
        );
      if (!stated) continue;

      const weekday = WEEKDAYS.indexOf(stated[1].toLowerCase());
      if (weekday < 0) continue;

      let hour = Number(stated[2]) % 12;
      if (/pm/i.test(stated[4])) hour += 12;
      const time = `${String(hour).padStart(2, "0")}:${stated[3] ?? "00"}`;

      return upcomingWeekdays(weekday, 26).map((date) => ({ date, time }));
    }
    return [];
  },
};

const badMoon = {
  match: /^bad\s*moon/i,
  // Their on-site calendar deliberately carries only non-weekly events, so
  // the league nights come from the ticket shop instead. That shop lists no
  // Cups or Challenges, so we vouch for the weekly league only.
  covers: /^league\s*\(locals\)$/i,
  async schedule(shop) {
    const catalogue = await fetchText(
      "https://shop.badmooncafe.co.uk/products.json?limit=250"
    );
    if (!catalogue) return [];

    // They run a branch in Borough and another on Holloway Road, on different
    // days at different times, so the wrong product would be actively harmful.
    const wantsHolloway = /holloway/i.test(shop);

    let products;
    try {
      products = JSON.parse(catalogue).products ?? [];
    } catch {
      return [];
    }

    for (const product of products) {
      const title = product?.title ?? "";
      if (!/pok[eé]mon|pokemon/i.test(title)) continue;

      const stated =
        /(\w+day)s?\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)\s*@\s*(.+?)\s*BMC/i.exec(
          title
        );
      if (!stated) continue;
      if (/holloway/i.test(stated[5]) !== wantsHolloway) continue;

      const weekday = WEEKDAYS.indexOf(stated[1].toLowerCase());
      if (weekday < 0) continue;

      let hour = Number(stated[2]) % 12;
      if (/pm/i.test(stated[4])) hour += 12;
      const time = `${String(hour).padStart(2, "0")}:${stated[3] ?? "00"}`;

      return upcomingWeekdays(weekday, 26).map((date) => ({ date, time }));
    }
    return [];
  },
};

const mugAndMeeple = {
  match: /mug\s*(and|&)\s*meeple/i,
  // Their calendar carries the ticketed tournaments but not the weekly league
  // night, so we can only vouch for Cups and Challenges.
  covers: /cup|challenge|prerelease/i,
  async schedule() {
    // Their host rejects requests without a browser-shaped User-Agent.
    const page = await fetchText("https://mugandmeeple.co.uk/calendar/", {
      browserAgent: true,
    });
    if (!page) return [];

    const found = [];
    const entry =
      /title:\s*'((?:[^'\\]|\\.)*)',\s*start:\s*'(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2})'/g;
    let match;
    while ((match = entry.exec(page))) {
      const title = match[1];
      if (!/pok[eé]mon/i.test(title)) continue;
      // They run a parallel video game programme on the same evenings. Those
      // are not the TCG events we track, and a VGC Challenge falling on a
      // league night would otherwise overwrite it.
      if (/\bvgc\b|video\s*game/i.test(title)) continue;
      found.push({ date: match[2], time: match[3] });
    }
    return found;
  },
};

const gamersGuild = {
  match: /^(the\s+)?gamers'?\s*guild/i,
  // Their site states the Challenge schedule but says nothing about the weekly
  // league, so we can only vouch for Challenges.
  covers: /challenge/i,
  async schedule() {
    const page = await fetchText(
      "https://shop.thegamersguild.co.uk/pokemon-league-challenge/"
    );
    if (!page) return [];

    const text = page.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
    const stated =
      /League\s+Challenge\s+events\s+the\s+first\s+(\w+)\s+of\s+each\s+month,\s*(\d{1,2})(?::(\d{2}))?\s*(?:-|–|to)/i.exec(
        text
      );
    if (!stated) return [];

    const weekday = WEEKDAYS.indexOf(stated[1].toLowerCase());
    if (weekday < 0) return [];

    // "6-9pm" states no meridiem on the start, but an evening event that ends
    // at 9pm cannot start at 6am.
    let hour = Number(stated[2]);
    if (hour < 12) hour += 12;
    const time = `${String(hour).padStart(2, "0")}:${stated[3] ?? "00"}`;

    return firstWeekdayOfMonths(weekday, 6).map((date) => ({ date, time }));
  },
};

const WEEKDAYS = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
];

/** ISO dates for the first `weekday` of each of the next `count` months. */
function firstWeekdayOfMonths(weekday, count) {
  const dates = [];
  const start = new Date(`${todayISO()}T12:00:00Z`);
  for (let i = 0; i < count; i += 1) {
    const cursor = new Date(
      Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + i, 1, 12)
    );
    while (cursor.getUTCDay() !== weekday) {
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    dates.push(cursor.toISOString().slice(0, 10));
  }
  return dates;
}

/** ISO dates for the next `count` occurrences of a weekday (0 = Sunday). */
function upcomingWeekdays(weekday, count) {
  const dates = [];
  const cursor = new Date(`${todayISO()}T12:00:00Z`);
  while (dates.length < count) {
    if (cursor.getUTCDay() === weekday) dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

const ADAPTERS = [
  darkSphere,
  p9,
  wayland,
  badgerBadger,
  onlyGraded,
  trollTrader,
  movieShack,
  darkFire,
  badMoon,
  wishlist,
  mugAndMeeple,
  gamersGuild,
];
/**
 * Store websites we have found but not yet written an adapter for, kept here
 * so the search work is not repeated. Each note says why there is no adapter
 * yet, since that is the thing worth knowing before picking one up.
 */
const KNOWN_SITES = {
  "Dark Fire Cafe": "https://darkfirecafe.com/pokemon-tcg",
  "Troll Trader Bromley": "https://ttbromley.com/pages/calendar",
  "The Mug and Meeple": "https://www.mugandmeeple.co.uk/calendar/", // 403s to plain fetch
  "The Gamers Guild": "https://shop.thegamersguild.co.uk/events/",
  "Bad Moon Cafe": "https://www.badmooncafe.co.uk/events/",
  "Marquee Models": "https://www.mmodels.co.uk/",
  "Zombie Games Cafe": "https://www.zombiegamescafe.com/pokemon-tcg-events",
  "The Ludoquist": "https://www.theludoquist.com/pages/events-2026",
  "Spellbound Games": "https://spellboundgames.co.uk/pages/events",
  "D20 Board Game Cafe": "https://www.d20cafe.co.uk/watford/",
  "Wishlist Collectables": "https://www.wishlistcollectables.co.uk/pages/pokemon",
  "Europa Gaming": "https://www.europagaming.co.uk/",
  Labyrinthe: "https://www.labyrinthe.co.uk/trading-card-games", // 403s to plain fetch
  Thunderbolt: "https://thunderboltcards.com/",
  Stylecreep: "https://stylecreep.com/", // product pages only, no schedule found
  Kaboom: "https://kaboomcards.co.uk/collections/pokemon", // products only
  // Retro Giant (retrogiant.co.uk) is deliberately absent: their robots.txt
  // disallows automated fetching, so we leave their events unverified.
};

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
  if (shops.length === 0) {
    return {
      events: events.map((e) => ({ ...e, confidence: "unverified" })),
      corrections: [],
    };
  }

  // date -> time, per shop. Built once per shop so each site is fetched at
  // most once regardless of how many events we hold for it.
  //
  // Days where the store lists more than one Pokémon event are skipped: with
  // several candidate times there is no safe way to tell which of them a
  // given pokedata row refers to, so we leave it alone rather than guess.
  const schedules = new Map();
  for (const shop of shops) {
    const adapter = adapterFor(shop);
    try {
      const entries = await adapter.schedule(shop);
      const byDate = new Map();
      const seen = new Set();
      // Dates the store lists more than once. Recorded rather than merely
      // dropped: a weekday fallback would otherwise fill an ambiguous date
      // straight back in with the store's usual time, which is exactly the
      // time we know to be wrong on that particular day (Dark Fire Cafe's
      // Challenge weeks start at 18:30, not their usual 18:00).
      const ambiguous = new Set();
      for (const entry of entries) {
        if (seen.has(entry.date)) {
          byDate.delete(entry.date);
          ambiguous.add(entry.date);
          continue;
        }
        seen.add(entry.date);
        byDate.set(entry.date, entry.time);
      }
      schedules.set(shop, {
        byDate,
        ambiguous,
        byWeekday: weeklyPattern(byDate),
        covers: adapter.covers,
      });
    } catch {
      // An adapter throwing is a bug in that adapter, not a reason to fail
      // the whole sync; the store just keeps its pokedata times.
      schedules.set(shop, {
        byDate: new Map(),
        ambiguous: new Set(),
        byWeekday: new Map(),
      });
    }
  }

  const corrections = [];
  const corrected = events.map((event) => {
    const schedule = schedules.get(event.shop);

    // Events we cannot check against the store keep pokedata's time, and are
    // marked so the UI can tell people to ring ahead. pokedata mirrors
    // Pokemon's official listings, which we have found to lag behind what
    // stores actually run - so "unverified" genuinely means "might be stale".
    if (!schedule) return { ...event, confidence: "unverified" };

    // Some adapters only see part of a store's programme - The Movie Shack
    // sell their monthly Challenge as a Shopify product but run their weekly
    // league nights without tickets. A store can hold two Pokémon events on
    // one date (a 15:00 league and a 19:00 Challenge), so matching on date
    // alone would stamp the Challenge's time onto the league. Where an adapter
    // declares what it covers, everything else is left as unverified.
    if (schedule.covers && !schedule.covers.test(event.typeLabel ?? "")) {
      return { ...event, confidence: "unverified" };
    }

    // Prefer an exact date match; fall back to the store's established
    // weekly slot for dates beyond what their site currently lists.
    const weekday = new Date(`${event.date}T12:00:00Z`).getUTCDay();
    if (schedule.ambiguous?.has(event.date)) {
      return { ...event, confidence: "unverified" };
    }
    const officialTime =
      schedule.byDate.get(event.date) ?? schedule.byWeekday.get(weekday);
    if (!officialTime) return { ...event, confidence: "unverified" };

    const currentTime = (event.time ?? "").slice(0, 5);
    if (!currentTime || currentTime === officialTime) {
      return { ...event, confidence: "verified", timeVerified: true };
    }

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
      confidence: "verified",
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
 *
 * Agreeing times are not on their own evidence of a *weekly* rhythm: The Movie
 * Shack sell a monthly Challenge that always falls on a Thursday at 18:00,
 * which would otherwise be projected onto every Thursday league night. So
 * where a weekday has several sightings, two of them must be exactly a week
 * apart before the time is treated as recurring.
 */
function weeklyPattern(byDate) {
  const times = new Map();
  for (const [date, time] of byDate) {
    const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
    if (!times.has(weekday)) times.set(weekday, []);
    times.get(weekday).push({ date, time });
  }
  const pattern = new Map();
  for (const [weekday, seen] of times) {
    const isWeekend = weekday === 0 || weekday === 6;
    const distinct = new Set(seen.map((s) => s.time));
    if (distinct.size !== 1) continue;
    if (seen.length < (isWeekend ? 2 : 1)) continue;
    if (seen.length > 1 && !hasWeeklyGap(seen.map((s) => s.date))) continue;
    pattern.set(weekday, seen[0].time);
  }
  return pattern;
}

/** Are any two of these dates exactly seven days apart? */
function hasWeeklyGap(dates) {
  const days = dates
    .map((d) => Date.parse(`${d}T12:00:00Z`) / 86_400_000)
    .sort((a, b) => a - b);
  return days.some((d, i) => i > 0 && d - days[i - 1] === 7);
}
