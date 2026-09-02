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

  return {
    id: raw.guid,
    name: raw.name || raw.type,
    type: raw.type,
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

/**
 * Fetch and normalise events across every configured search point,
 * de-duplicating by guid (events near multiple search points can repeat).
 */
export async function fetchAllEvents({
  points = DEFAULT_SEARCH_POINTS,
  filters = DEFAULT_FILTERS,
} = {}) {
  const byId = new Map();

  for (const point of points) {
    const data = await fetchEventsForPoint(point, filters);
    for (const raw of data.events ?? []) {
      const event = normaliseEvent(raw, point.label);
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
