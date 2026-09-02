// Client for the pokedata.ovh league-finder API.
//
// The public page (https://www.pokedata.ovh/events/leagues/) calls this
// endpoint client-side via fetch(). We call it directly server-side instead
// of scraping rendered HTML, since it returns clean, structured JSON.

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
 */
export function normaliseEvent(raw, searchLabel) {
  // "when" looks like "2026-09-05 11:00:00" with no explicit timezone.
  // All observed events are UK shops, so we treat this as Europe/London
  // local time (the ICS file encodes this explicitly with a VTIMEZONE).
  const startsAt = raw.when.replace(" ", "T");

  // pokedata.ovh leaves `name` blank for most events (especially Friendlies),
  // in which case it falls back to the raw `type` code (e.g. "nonpremier
  // TCG") which is meaningless to subscribers. Build a readable title
  // instead: "{Shop} - {friendly type label}".
  const typeLabel = TYPE_LABELS[raw.type] || raw.type || "TCG Event";
  const title = raw.name && raw.name.trim()
    ? raw.name.trim()
    : `${raw.shop} - Pokémon TCG ${typeLabel}`;

  return {
    id: raw.guid,
    name: title,
    type: raw.type,
    typeLabel,
    shop: raw.shop,
    city: raw.city,
    state: raw.state,
    countryCode: raw.country_code,
    address: raw.street_address,
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
 */
export async function fetchAllEvents({
  points = DEFAULT_SEARCH_POINTS,
  filters = DEFAULT_FILTERS,
} = {}) {
  const byId = new Map();
  const byContentKey = new Map(); // guards against pokedata.ovh returning the
  // same event twice under different guids (same shop/time/type/address).

  for (const point of points) {
    const data = await fetchEventsForPoint(point, filters);
    for (const raw of data.events ?? []) {
      const event = normaliseEvent(raw, point.label);

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
