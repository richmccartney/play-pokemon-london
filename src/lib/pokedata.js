// Client for the pokedata.ovh league-finder API.
//
// The public page (https://www.pokedata.ovh/events/leagues/) calls this
// endpoint client-side via fetch(). We call it directly server-side instead
// of scraping rendered HTML, since it returns clean, structured JSON.

import { resolveVenue, titleCase } from "./venues.js";
import {
  fetchAuthoritativeTypes,
  authoritativeTypeFor,
} from "./pokedata-types.js";

const API_URL = "https://www.pokedata.ovh/events/leagues/getevents.php";

// Search locations to sweep so we get full coverage instead of relying on
// a single lat/lng + radius (the API caps results and radius in practice).
// Add / edit entries here to expand coverage.
export const DEFAULT_SEARCH_POINTS = [
  {
    label: "London",
    lat: 51.50765702672531,
    lng: -0.12791295535862449,
    radius: 40,
  },
];

// Bitmask-style flags matching the site's checkboxes. Defaults mirror the
// "types=1100001100" query used on the public page (Cups, Challenges,
// Pre-releases, and TCG Friendlies; no VG/GO — this is a TCG-focused
// calendar). TCG Friendlies alone roughly 10x's the event count (31 -> 351
// for a 40km London search), so they're included by default.
export const DEFAULT_FILTERS = {
  tcg_cups: true,
  tcg_challenges: true,
  vg_cups: false,
  vg_challenges: false,
  go_cups: false,
  go_challenges: false,
  prereleases: true,
  ftcg: true,
  fvg: false,
  fgo: false,
};

/**
 * Fetch raw events + leagues data for a single search point.
 * @param {{lat:number,lng:number,radius:number,unit?:string}} point
 * @param {object} filters
 */
export async function fetchEventsForPoint(point, filters = DEFAULT_FILTERS) {
  const body = {
    sort: "time",
    radius: point.radius,
    unit: point.unit ?? "km",
    lat: point.lat,
    lng: point.lng,
    ...filters,
  };

  const res = await fetch(API_URL, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json; charset=UTF-8",
      // Behave like a normal browser request; the API is public but let's
      // be a good citizen and identify ourselves.
      "User-Agent": "pokemon-events-calendar/1.0 (+https://github.com/)",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw new Error(
      `pokedata.ovh API request failed: ${res.status} ${res.statusText}`
    );
  }

  return res.json();
}

/**
 * Normalise a raw event record from the API into our internal shape.
 * @param {object} raw
 * @param {string} searchLabel - which search point produced this result
 * @param {object} [venueRegistry] - mutable venue registry (see venues.js);
 *   when provided, shop name and address are cleaned up and converged on a
 *   single canonical spelling across repeated sightings of the same venue.
 * @param {Map<string,string>} [authoritativeTypes] - authoritative type labels
 *   from pokedata.ovh's /events2/ API (see pokedata-types.js). When this
 *   covers the event, it wins over sniffing the event name.
 */
export function normaliseEvent(raw, searchLabel, venueRegistry, authoritativeTypes) {
  // "when" looks like "2026-09-05 11:00:00" with no explicit timezone.
  // All observed events are UK shops, so we treat this as Europe/London
  // local time (the ICS file encodes this explicitly with a VTIMEZONE).
  const startsAt = raw.when.replace(" ", "T");

  // pokedata.ovh's shop/address fields are raw, inconsistent ALL CAPS data
  // (e.g. "DO OR DICE ADDLESTONE" vs "DO OR DICE - ADDLESTONE", or the same
  // venue with two differently-formatted addresses). Clean these up and, if
  // a registry is supplied, converge on one canonical spelling per venue
  // over time (the most-frequently-seen raw form wins).
  const cleanedVenue = venueRegistry
    ? resolveVenue(
        {
          shop: raw.shop,
          address: raw.street_address,
          latitude: raw.latitude,
          longitude: raw.longitude,
        },
        venueRegistry
      )
    : { name: titleCase(raw.shop), address: titleCase(raw.street_address) };

  // pokedata.ovh leaves `name` blank for most events (especially Friendlies),
  // in which case it falls back to the raw `type` code (e.g. "nonpremier
  // TCG") which is meaningless to subscribers. Build a readable title
  // instead: "{Shop} - {friendly type label}".
  //
  // pokedata.ovh's raw `type` only ever distinguishes "League Cup",
  // "League Challenge", or a single catch-all "nonpremier TCG" bucket that
  // covers Prereleases, Friendly Tournaments, and regular League Locals
  // alike. Prefer the authoritative classification from /events2/ where it
  // covers the event; otherwise sniff an organiser-provided title for
  // keywords rather than defaulting every one to "League (Locals)".
  const typeLabel =
    authoritativeTypeFor(raw, authoritativeTypes) ??
    refineTypeLabel(raw.type, raw.name);
  const title = raw.name && raw.name.trim()
    ? raw.name.trim()
    : `${cleanedVenue.name} - Pokémon TCG ${typeLabel}`;

  return {
    id: raw.guid,
    name: title,
    type: raw.type,
    typeLabel,
    shop: cleanedVenue.name,
    city: titleCase(raw.city),
    state: raw.state,
    countryCode: raw.country_code,
    address: cleanedVenue.address,
    latitude: Number(raw.latitude),
    longitude: Number(raw.longitude),
    startsAt,
    date: raw.date,
    time: raw.time,
    distanceKm:
      raw.unit === "km" ? Number(raw.distance) : Number(raw.distance) * 1.60934,
    pokemonUrl: raw.pokemon_url
      ? `https://www.pokemon.com/us/pokemon-trainer-club/play-pokemon-tournaments/${raw.pokemon_url}/`
      : null,
    sourceSearch: searchLabel,
    raw,
  };
}

// Human-readable labels for pokedata.ovh's raw `type` codes.
const TYPE_LABELS = {
  "nonpremier TCG": "League (Locals)",
  "League Challenge": "League Challenge",
  "League Cup": "League Cup",
  "Pre-release": "Pre-release",
};

// Keyword hints for sniffing a more specific event type out of an
// organiser-provided event name, tried in priority order. pokedata.ovh's
// "nonpremier TCG" raw type is a catch-all covering Prereleases, Friendly
// Tournaments and plain League Locals alike, so this is the only signal we
// have to tell them apart when the API itself doesn't distinguish them.
const NAME_TYPE_HINTS = [
  { label: "Pre-release", pattern: /pre[\s-]?release/i },
  { label: "League Cup", pattern: /\bcup\b/i },
  { label: "League Challenge", pattern: /\bchallenge\b/i },
  { label: "Friendly Tournament", pattern: /friendly/i },
  { label: "Play Session", pattern: /play\s*session/i },
];

/**
 * Resolve the most specific type label we can for an event: pokedata.ovh's
 * raw `type` code is trusted when it's already specific (League
 * Cup/Challenge/Pre-release), but "nonpremier TCG" is a catch-all, so for
 * that case we sniff the organiser-provided event name (when present) for
 * keywords before falling back to the generic "League (Locals)" label.
 * @param {string} rawType
 * @param {string} [rawName]
 */
function refineTypeLabel(rawType, rawName) {
  const baseLabel = TYPE_LABELS[rawType] || rawType || "TCG Event";
  if (rawType !== "nonpremier TCG" || !rawName || !rawName.trim()) {
    return baseLabel;
  }
  for (const hint of NAME_TYPE_HINTS) {
    if (hint.pattern.test(rawName)) return hint.label;
  }
  return baseLabel;
}

/**
 * Build a stable de-duplication key for an event: pokedata.ovh sometimes
 * returns the exact same event twice with two different guids (same shop,
 * time and address). We treat those as one event.
 */
function dedupeKey(event) {
  return [event.shop, event.startsAt, event.type, event.address]
    .join("|")
    .toLowerCase();
}

/**
 * Fetch and normalise events across every configured search point,
 * de-duplicating by guid (events near multiple search points can repeat).
 * @param {object} [options]
 * @param {object} [options.venueRegistry] - mutable venue registry to
 *   converge venue names/addresses across sightings (see venues.js).
 */
export async function fetchAllEvents({
  points = DEFAULT_SEARCH_POINTS,
  filters = DEFAULT_FILTERS,
  venueRegistry,
} = {}) {
  const byId = new Map();
  const byContentKey = new Map(); // guards against pokedata.ovh returning the
  // same event twice under different guids (same shop/time/type/address).

  // Best-effort: authoritative Cup/Challenge classification from /events2/.
  // Only covers premier events, and never throws - on failure we simply fall
  // back to sniffing event names as before.
  const authoritativeTypes = await fetchAuthoritativeTypes(points);

  for (const point of points) {
    const data = await fetchEventsForPoint(point, filters);
    for (const raw of data.events ?? []) {
      const event = normaliseEvent(
        raw,
        point.label,
        venueRegistry,
        authoritativeTypes
      );

      const contentKey = dedupeKey(event);
      const existingByContent = byContentKey.get(contentKey);
      if (existingByContent && existingByContent.id !== event.id) {
        // True duplicate from the API itself - skip, keep the first one seen.
        continue;
      }
      byContentKey.set(contentKey, event);

      // Keep the closest-distance copy if seen from multiple search points.
      const existing = byId.get(event.id);
      if (!existing || event.distanceKm < existing.distanceKm) {
        byId.set(event.id, event);
      }
    }
  }

  return Array.from(byId.values()).sort((a, b) =>
    a.startsAt.localeCompare(b.startsAt)
  );
}
